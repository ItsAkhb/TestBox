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


const AuthContext = createContext(null);

// The last user whose data namespace was active. Persisted so an
// offline relaunch (or a failed token refresh while offline) keeps
// reading/writing the SAME localStorage prefix instead of silently
// flipping to the anonymous namespace — which would make local data
// appear to vanish.
const LAST_USER_KEY = "testbox-last-user";

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

  const isOffline = networkOnline === false || supabaseReachable === false;

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
