import {
  createContext,
  useContext,
  useEffect,
  useState,
} from "react";

import { supabase, consumeUserInitiatedSignOut } from "../services/supabaseClient";

import {
  setStorageUser,
} from "../services/dataService";

import {
  deriveOAuthRedirectTo,
  detectAuthPlatform,
  startGoogleSignIn,
  handleAuthCallback,
  isAuthCallbackUrl,
} from "../services/authFlow";

import { openAuthUrl } from "../services/native";


const AuthContext = createContext(null);

// The last user whose data namespace was active. Persisted so an
// offline relaunch (or a failed token refresh while offline) keeps
// reading/writing the SAME localStorage prefix instead of silently
// flipping to the anonymous namespace — which would make local data
// appear to vanish.
const LAST_USER_KEY = "testbox-last-user";

// Four-state auth model (spec P6):
//   authenticated       — live session, online
//   needs_revalidation  — identity cached, token refresh pending/offline
//   logged_out          — user explicitly signed out
//   unknown             — still resolving on boot
// Timeout / network failure NEVER maps to logged_out.
export function deriveAuthState({ session, user, loading, networkOnline, supabaseReachable }) {
  if (loading) return "unknown";
  if (session?.user) {
    if (networkOnline === false || supabaseReachable === false) {
      return "needs_revalidation";
    }
    return "authenticated";
  }
  if (user) {
    // No live session but a cached identity is present: offline
    // revalidation pending — not logged out.
    return "needs_revalidation";
  }
  return "logged_out";
}

function readLastUserId() {
  try {
    return localStorage.getItem(LAST_USER_KEY) || null;
  } catch {
    return null;
  }
}

function writeLastUserId(userId) {
  try {
    if (userId) {
      localStorage.setItem(LAST_USER_KEY, userId);
    } else {
      localStorage.removeItem(LAST_USER_KEY);
    }
  } catch {
    // storage unavailable — nothing to persist
  }
}

function readOnline() {
  return typeof navigator === "undefined" ? true : navigator.onLine !== false;
}

export function AuthProvider({
  children,
}) {
  const [session, setSession] =
    useState(null);

  const [loading, setLoading] =
    useState(true);

  // "online" = navigator.onLine AND Supabase reachable at probe time.
  // navigator.onLine alone can be true while the network is useless.
  const [networkOnline, setNetworkOnline] = useState(readOnline);

  const [supabaseReachable, setSupabaseReachable] = useState(!readOnline() ? false : null);

  const [googleLoading, setGoogleLoading] = useState(false);

  const [googleError, setGoogleError] = useState("");

  const isOffline = networkOnline === false || supabaseReachable === false;

  // Offline identity: session user, else the last user id kept for
  // storage-namespace continuity. Without this, a failed refresh while
  // offline would derive "logged_out" even though the account is cached.
  const cachedIdentity =
    session?.user ??
    (readLastUserId() ? { id: readLastUserId() } : null);

  const authState = deriveAuthState({
    session,
    user: cachedIdentity,
    loading,
    networkOnline,
    supabaseReachable,
  });

  // Reaching the auth endpoint is a cheap, reliable Supabase probe.
  useEffect(() => {
    let cancelled = false;

    async function probe() {
      if (!networkOnline) {
        if (!cancelled) setSupabaseReachable(false);
        return;
      }
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 6000);
        // The health endpoint requires the apikey header even though
        // this probe is unauthenticated — without it Supabase answers
        // 401 and a healthy network would be treated as offline.
        const res = await fetch(
          `${new URL(supabase.supabaseUrl).origin}/auth/v1/health`,
          {
            signal: controller.signal,
            headers: supabase.auth.headers,
          }
        );
        clearTimeout(timer);
        if (!cancelled) setSupabaseReachable(res.ok);
      } catch {
        if (!cancelled) setSupabaseReachable(false);
      }
    }

    probe();
    return () => {
      cancelled = true;
    };
  }, [networkOnline]);

  useEffect(() => {
    const handleOnline = () => setNetworkOnline(true);
    const handleOffline = () => setNetworkOnline(false);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);


  useEffect(() => {
    let mounted = true;


    async function loadSession() {
      const {
        data,
        error,
      } =
        await supabase.auth.getSession();


      if (error) {
        console.error(
          "Failed to load auth session",
          error
        );
      }


      const currentSession =
        data?.session ?? null;


      if (mounted) {
        setSession(
          currentSession
        );

        setStorageUser(
          currentSession?.user?.id ??
          readLastUserId() ?? null
        );

        if (currentSession?.user?.id) {
          writeLastUserId(currentSession.user.id);
        }

        setLoading(false);
      }
    }


    loadSession();


    const {
      data: listener,
    } =
      supabase.auth.onAuthStateChange(
        (event, newSession) => {

          // OFFLINE AUTH GUARD (v2 hardening):
          //
          // Supabase emits SIGNED_OUT (and TOKEN_REFRESHED with no
          // session) when an automatic token refresh fails — which
          // happens whenever the app starts without internet, or the
          // network drops behind a "connected" gateway where
          // navigator.onLine is still true. Wiping the identity then
          // would flip storage to the anonymous namespace and make the
          // user's local data appear to vanish.
          //
          // A SIGNED_OUT may only clear the identity when OUR code
          // requested it (consumeUserInitiatedSignOut() returns true).
          // Every other session-less event keeps the cached identity;
          // cloud sync is gated separately on real connectivity.
          //
          // This is not a security weakening: the session token itself
          // stays managed by supabase-js (invalid tokens simply fail
          // server-side when used). We only preserve WHO the user is
          // locally so their data stays visible offline.
          if (!newSession && event === "SIGNED_OUT") {
            if (consumeUserInitiatedSignOut()) {
              writeLastUserId(null);
              setStorageUser(null);
              setSession(null);
              return;
            }
            // Not user-initiated (offline refresh failure or unknown):
            // keep identity and any cached session data.
            return;
          }

          if (!newSession && event === "TOKEN_REFRESHED") {
            // Refresh failed silently — keep identity.
            return;
          }

          setSession(
            newSession ?? null
          );


          const nextUserId =
            newSession?.user?.id ?? null;

          setStorageUser(
            nextUserId ??
            readLastUserId() ?? null
          );

          if (nextUserId) {
            writeLastUserId(nextUserId);
          }
        }
      );


    return () => {
      mounted = false;

      listener.subscription.unsubscribe();
    };

  }, [networkOnline, supabaseReachable]);

  // Custom-scheme OAuth return (Electron testbox:// or Android intent).
  // Web PKCE returns are handled by supabase-js detectSessionInUrl.
  useEffect(() => {
    let cancelled = false;
    // One exchange per callback URL: the preload buffer, the live
    // listener, and the boot-time location check can surface the same
    // URL — a spent PKCE code must never be exchanged twice (Supabase
    // rejects it, which would flash a false error after a real login).
    let lastCallbackUrl = null;

    async function finishCallback(url) {
      if (!url || cancelled) return;
      if (url === lastCallbackUrl) return;
      lastCallbackUrl = url;
      const result = await handleAuthCallback(supabase.auth, url);
      if (!result.ok && result.error && result.error !== "no_code") {
        if (!cancelled) {
          setGoogleError("auth.google.error");
        }
      }
      if (!cancelled) setGoogleLoading(false);
    }

    // Current URL may already be a callback on boot (deep link open).
    if (typeof window !== "undefined" && isAuthCallbackUrl(window.location.href)) {
      finishCallback(window.location.href);
    }

    const unsubscribers = [];

    // Capacitor appUrlOpen
    if (window.Capacitor?.isNativePlatform?.()) {
      import("@capacitor/app")
        .then(({ App }) => {
          if (cancelled) return;
          App.addListener("appUrlOpen", ({ url }) => {
            finishCallback(url);
          }).then((handle) => {
            if (handle) unsubscribers.push(() => handle.remove?.());
          });
        })
        .catch(() => {});
    }

    // Electron preload bridge
    if (window.testboxDesktop?.onAuthCallback) {
      const off = window.testboxDesktop.onAuthCallback((url) => {
        finishCallback(url);
      });
      if (typeof off === "function") unsubscribers.push(off);
      // Drain a callback that arrived while the renderer was still
      // booting: main.cjs forwards the deep link on a timer, so the
      // IPC can beat React mount — the preload buffers it until this
      // pull consumes it exactly once.
      if (typeof window.testboxDesktop.getPendingAuthUrl === "function") {
        const pending = window.testboxDesktop.getPendingAuthUrl();
        if (pending) finishCallback(pending);
      }
    }

    return () => {
      cancelled = true;
      unsubscribers.forEach((off) => {
        try {
          off();
        } catch {
          // listener already gone
        }
      });
    };
  }, []);

  async function signInWithGoogle() {
    setGoogleError("");
    setGoogleLoading(true);

    try {
      const platform = detectAuthPlatform(window);
      const siteUrl = import.meta.env.VITE_SITE_URL || "";
      const redirectTo = deriveOAuthRedirectTo({
        origin: window.location.origin,
        baseUrl: import.meta.env.BASE_URL || "/",
        protocol: window.location.protocol,
        siteUrl,
        platform,
      });

      // Electron: window.open is routed to shell.openExternal by the
      // main process. Android: openAuthUrl hands the URL to a Chrome
      // Custom Tab (native Google account screen when the Google app
      // is installed) — never the bare WebView. Web: supabase-js
      // performs the redirect itself.
      const openExternal = platform.needsCustomScheme
        ? (url) => {
            openAuthUrl(url);
          }
        : undefined;

      const result = await startGoogleSignIn(supabase.auth, {
        redirectTo,
        openExternal,
      });

      if (!result.ok) {
        setGoogleError("auth.google.error");
        setGoogleLoading(false);
      }
      // On success with in-browser redirect, the page navigates away;
      // leave googleLoading true until unload. External-open path also
      // stays loading until the custom-scheme callback finishes.
    } catch {
      setGoogleError("auth.google.error");
      setGoogleLoading(false);
    }
  }

  return (
    <AuthContext.Provider
      value={{
        session,
        user:
          session?.user ??
          null,
        loading,
        isOffline,
        networkOnline,
        supabaseReachable,
        authState,
        // Offline identity: last user id kept for storage namespace
        // continuity even when there is no live session object.
        cachedUserId: cachedIdentity?.id ?? null,
        googleLoading,
        googleError,
        signInWithGoogle,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}



export function useAuth() {
  const context =
    useContext(AuthContext);


  if (!context) {
    throw new Error(
      "useAuth must be used inside AuthProvider"
    );
  }


  return context;
}
