// Pure Google Sign-In / OAuth helpers. No React, no side effects on
// app storage — safe for the Node test harness (VM) and for reuse from
// AuthContext, Electron preload bridges, and Capacitor deep links.

export const AUTH_CALLBACK_SCHEME = "testbox";
export const AUTH_CALLBACK_PATH = "testbox://auth/callback";

/**
 * Platform flags for choosing an OAuth return strategy.
 * Web → same-origin redirect; Electron/Android → custom scheme.
 */
export function detectAuthPlatform(win = {}) {
  const location = win.location || {};
  const userAgent = String(win.navigator?.userAgent || "");
  const isElectron = Boolean(win.testboxDesktop) || /Electron/i.test(userAgent);
  const isNative = Boolean(win.Capacitor?.isNativePlatform?.());
  const isFile = location.protocol === "file:";
  return {
    isElectron,
    isNative,
    isFile,
    needsCustomScheme: isElectron || isNative || isFile,
  };
}

function ensureTrailingSlash(value) {
  const trimmed = String(value || "").trim();
  if (!trimmed) return "";
  return trimmed.endsWith("/") ? trimmed : `${trimmed}/`;
}

/**
 * Derive the OAuth redirectTo for the current environment.
 * - VITE_SITE_URL (siteUrl) wins when set (full absolute URL, no secret).
 * - Electron / Capacitor / file: → testbox://auth/callback
 * - Web → origin + Vite base path (handles /TestBox/ GitHub Pages base).
 * Never hardcodes a production origin in source.
 */
export function deriveOAuthRedirectTo({
  origin = "",
  baseUrl = "/",
  protocol = "",
  siteUrl = "",
  platform = null,
} = {}) {
  const plat =
    platform ||
    detectAuthPlatform({
      location: { protocol, origin },
    });

  if (siteUrl) {
    const base = ensureTrailingSlash(siteUrl);
    if (plat.needsCustomScheme) {
      return AUTH_CALLBACK_PATH;
    }
    const path = baseUrl && baseUrl !== "./" ? baseUrl : "/";
    // siteUrl may already include the app base path (…/TestBox/) —
    // do not append BASE_URL a second time.
    if (path !== "/" && (base === ensureTrailingSlash(path) || base.endsWith(path.endsWith("/") ? path : `${path}/`))) {
      return base;
    }
    return base.replace(/\/$/, "") + (path.startsWith("/") ? path : `/${path}`);
  }

  if (plat.needsCustomScheme) {
    return AUTH_CALLBACK_PATH;
  }

  const normalizedOrigin = String(origin || "").replace(/\/$/, "");
  if (!normalizedOrigin) {
    return AUTH_CALLBACK_PATH;
  }
  const path = !baseUrl || baseUrl === "./" ? "/" : baseUrl;
  return normalizedOrigin + (path.startsWith("/") ? path : `/${path}`);
}

/**
 * Start Google Sign-In via Supabase OAuth.
 * When `openExternal` is provided (Electron/system browser), asks the
 * client for a URL without navigating (`skipRedirect`) and hands it off.
 * Otherwise supabase-js performs the browser redirect.
 */
export async function startGoogleSignIn(auth, { redirectTo, openExternal } = {}) {
  if (!auth || typeof auth.signInWithOAuth !== "function") {
    return { ok: false, error: "auth_unavailable" };
  }
  if (!redirectTo) {
    return { ok: false, error: "missing_redirect" };
  }

  const options = { redirectTo };
  if (typeof openExternal === "function") {
    options.skipRedirect = true;
  }

  try {
    const { data, error } = await auth.signInWithOAuth({
      provider: "google",
      options,
    });
    if (error) {
      return { ok: false, error: error.message || "oauth_error" };
    }
    const url = data?.url || null;
    if (url && typeof openExternal === "function") {
      openExternal(url);
    }
    return { ok: true, url, navigated: typeof openExternal !== "function" };
  } catch (err) {
    return { ok: false, error: err?.message || "oauth_exception" };
  }
}

/**
 * Pull PKCE/OAuth callback params out of a return URL without touching
 * HashRouter's `#/...` route fragment (query `code` is authoritative).
 */
export function extractAuthCallbackParams(rawUrl) {
  const empty = { code: null, error: null, errorDescription: null };
  if (!rawUrl) return empty;

  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return empty;
  }

  const code = parsed.searchParams.get("code");
  const error =
    parsed.searchParams.get("error") || parsed.searchParams.get("error_code");
  const errorDescription =
    parsed.searchParams.get("error_description") ||
    parsed.searchParams.get("error_description") ||
    parsed.searchParams.get("error_reason");

  return { code, error, errorDescription };
}

/**
 * Exchange a PKCE code for a session. Safe to call once per callback;
 * a second call with the same code fails without corrupting local state
 * (no storage-user writes happen here).
 */
export async function handleAuthCallback(auth, rawUrl) {
  const params = extractAuthCallbackParams(rawUrl);
  if (params.error) {
    return {
      ok: false,
      error: params.error,
      errorDescription: params.errorDescription,
    };
  }
  if (!params.code) {
    return { ok: false, error: "no_code" };
  }
  if (!auth || typeof auth.exchangeCodeForSession !== "function") {
    return { ok: false, error: "auth_unavailable" };
  }
  try {
    const { error } = await auth.exchangeCodeForSession(params.code);
    if (error) {
      return { ok: false, error: error.message || "exchange_failed" };
    }
    return { ok: true, code: params.code };
  } catch (err) {
    return { ok: false, error: err?.message || "exchange_exception" };
  }
}

/** True when the current browser URL is an OAuth/PKCE return. */
export function isAuthCallbackUrl(rawUrl) {
  const { code, error } = extractAuthCallbackParams(rawUrl);
  return Boolean(code || error);
}
