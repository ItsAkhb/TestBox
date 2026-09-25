import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

async function loadAuthFlow() {
  const source = await readFile(
    new URL("./authFlow.js", import.meta.url),
    "utf8"
  );
  const context = vm.createContext({ URL, URLSearchParams });
  vm.runInContext(
    source.replace(/^export\s+/gm, "") +
      "\n;globalThis.__authFlow = {" +
      " AUTH_CALLBACK_SCHEME, AUTH_CALLBACK_PATH," +
      " detectAuthPlatform, deriveOAuthRedirectTo, startGoogleSignIn," +
      " extractAuthCallbackParams, handleAuthCallback, isAuthCallbackUrl };",
    context
  );
  return context.__authFlow;
}

function loadDeriveAuthState(source) {
  const match = source.match(
    /export function deriveAuthState\([\s\S]*?\n}/
  );
  assert.ok(match, "deriveAuthState export present in AuthContext");
  const body = match[0].replace("export ", "");
  const context = vm.createContext({});
  vm.runInContext(
    `${body}\n;globalThis.deriveAuthState = deriveAuthState;`,
    context
  );
  return context.deriveAuthState;
}

test("auth: Google sign-in trigger calls signInWithOAuth with provider google + redirectTo", async () => {
  const flow = await loadAuthFlow();
  const calls = [];
  const auth = {
    signInWithOAuth: async (args) => {
      calls.push(args);
      return { data: { url: "https://accounts.google.com/o/oauth2/v2/auth" }, error: null };
    },
  };
  const result = await flow.startGoogleSignIn(auth, {
    redirectTo: "http://127.0.0.1:5173/TestBox/",
  });
  assert.equal(result.ok, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].provider, "google");
  assert.equal(calls[0].options.redirectTo, "http://127.0.0.1:5173/TestBox/");
  assert.equal(calls[0].options.skipRedirect, undefined);
});

test("auth: external open path uses skipRedirect and hands off the URL", async () => {
  const flow = await loadAuthFlow();
  const opened = [];
  const auth = {
    signInWithOAuth: async (args) => {
      assert.equal(args.options.skipRedirect, true);
      return { data: { url: "https://example.test/oauth" }, error: null };
    },
  };
  const result = await flow.startGoogleSignIn(auth, {
    redirectTo: "testbox://auth/callback",
    openExternal: (url) => opened.push(url),
  });
  assert.equal(result.ok, true);
  assert.deepEqual(opened, ["https://example.test/oauth"]);
});

test("auth: failed OAuth returns error and does not open external", async () => {
  const flow = await loadAuthFlow();
  const opened = [];
  const auth = {
    signInWithOAuth: async () => ({
      data: null,
      error: { message: "provider_disabled" },
    }),
  };
  const result = await flow.startGoogleSignIn(auth, {
    redirectTo: "testbox://auth/callback",
    openExternal: (url) => opened.push(url),
  });
  assert.equal(result.ok, false);
  assert.equal(result.error, "provider_disabled");
  assert.deepEqual(opened, []);
});

test("auth: deriveAuthState — four-state transitions", async () => {
  const source = await readFile(
    new URL("../context/AuthContext.jsx", import.meta.url),
    "utf8"
  );
  const derive = loadDeriveAuthState(source);

  assert.equal(
    derive({
      session: null,
      user: null,
      loading: true,
      networkOnline: true,
      supabaseReachable: null,
    }),
    "unknown"
  );

  assert.equal(
    derive({
      session: { user: { id: "u1" } },
      user: { id: "u1" },
      loading: false,
      networkOnline: true,
      supabaseReachable: null,
    }),
    "authenticated"
  );

  // Offline with live session → needs_revalidation, never logged_out
  assert.equal(
    derive({
      session: { user: { id: "u1" } },
      user: { id: "u1" },
      loading: false,
      networkOnline: false,
      supabaseReachable: false,
    }),
    "needs_revalidation"
  );

  // Cached identity, no session (offline restore) → needs_revalidation
  assert.equal(
    derive({
      session: null,
      user: { id: "u1" },
      loading: false,
      networkOnline: false,
      supabaseReachable: false,
    }),
    "needs_revalidation"
  );

  assert.equal(
    derive({
      session: null,
      user: null,
      loading: false,
      networkOnline: true,
      supabaseReachable: null,
    }),
    "logged_out"
  );
});

test("auth: PKCE client options keep code in query (HashRouter-safe)", async () => {
  const source = await readFile(
    new URL("./supabaseClient.js", import.meta.url),
    "utf8"
  );
  assert.match(source, /flowType:\s*["']pkce["']/);
  assert.match(source, /detectSessionInUrl:\s*true/);
});

test("auth: redirectTo derivation — web base path, siteUrl override, custom scheme", async () => {
  const flow = await loadAuthFlow();

  const web = flow.deriveOAuthRedirectTo({
    origin: "https://itsakhb.github.io",
    baseUrl: "/TestBox/",
    protocol: "https:",
  });
  assert.equal(web, "https://itsakhb.github.io/TestBox/");

  const dev = flow.deriveOAuthRedirectTo({
    origin: "http://127.0.0.1:5173",
    baseUrl: "/TestBox/",
    protocol: "http:",
  });
  assert.equal(dev, "http://127.0.0.1:5173/TestBox/");

  const electron = flow.deriveOAuthRedirectTo({
    origin: "file://",
    baseUrl: "./",
    protocol: "file:",
    platform: { needsCustomScheme: true, isElectron: true },
  });
  assert.equal(electron, "testbox://auth/callback");

  const site = flow.deriveOAuthRedirectTo({
    origin: "http://127.0.0.1:5173",
    baseUrl: "/TestBox/",
    siteUrl: "https://itsakhb.github.io/TestBox/",
  });
  // siteUrl already includes the app path — do not append BASE_URL again
  assert.equal(site, "https://itsakhb.github.io/TestBox/");

  const siteOrigin = flow.deriveOAuthRedirectTo({
    origin: "http://127.0.0.1:5173",
    baseUrl: "/TestBox/",
    siteUrl: "https://itsakhb.github.io",
  });
  assert.equal(siteOrigin, "https://itsakhb.github.io/TestBox/");
});

test("auth: platform detection flags Electron/Android/file", async () => {
  const flow = await loadAuthFlow();

  const electron = flow.detectAuthPlatform({
    testboxDesktop: {},
    location: { protocol: "file:" },
    navigator: { userAgent: "Mozilla/5.0 Electron/44" },
  });
  assert.equal(electron.needsCustomScheme, true);

  const android = flow.detectAuthPlatform({
    Capacitor: { isNativePlatform: () => true },
    location: { protocol: "https:" },
  });
  assert.equal(android.isNative, true);
  assert.equal(android.needsCustomScheme, true);

  const web = flow.detectAuthPlatform({
    location: { protocol: "https:" },
    navigator: { userAgent: "Mozilla/5.0" },
  });
  assert.equal(web.needsCustomScheme, false);
});

test("auth: OAuth callback extracts code from query without touching hash routes", async () => {
  const flow = await loadAuthFlow();

  const web = flow.extractAuthCallbackParams(
    "https://itsakhb.github.io/TestBox/?code=pkce_abc#/settings"
  );
  assert.equal(web.code, "pkce_abc");
  assert.equal(web.error, null);

  const deep = flow.extractAuthCallbackParams(
    "testbox://auth/callback?code=xyz123"
  );
  assert.equal(deep.code, "xyz123");

  const err = flow.extractAuthCallbackParams(
    "https://x.test/?error=access_denied&error_description=User+cancelled"
  );
  assert.equal(err.error, "access_denied");

  const none = flow.extractAuthCallbackParams("https://x.test/#/login");
  assert.equal(none.code, null);
  assert.equal(flow.isAuthCallbackUrl("https://x.test/#/login"), false);
  assert.equal(
    flow.isAuthCallbackUrl("https://x.test/?code=1"),
    true
  );
});

test("auth: session restoration shape — getSession user id drives storage (static)", async () => {
  const source = await readFile(
    new URL("../context/AuthContext.jsx", import.meta.url),
    "utf8"
  );
  // Boot restore must write last-user + setStorageUser from the session id
  assert.match(source, /writeLastUserId\(currentSession\.user\.id\)/);
  assert.match(source, /setStorageUser\(\s*currentSession\?\.user\?\.id/);
  // Offline SIGNED_OUT must not clear identity without the flag
  assert.match(source, /consumeUserInitiatedSignOut\(\)/);
});

test("auth: logout path still marks user-initiated sign-out before signOut", async () => {
  const source = await readFile(
    new URL("../pages/Settings.jsx", import.meta.url),
    "utf8"
  );
  const markIdx = source.indexOf("markUserInitiatedSignOut()");
  const signOutIdx = source.indexOf("supabase.auth.signOut()");
  assert.ok(markIdx >= 0 && signOutIdx >= 0);
  assert.ok(markIdx < signOutIdx, "flag set before signOut");
});

test("auth: local storage user-scoping uses same UUID prefix", async () => {
  const storageSource = await readFile(
    new URL("./storage.js", import.meta.url),
    "utf8"
  );
  const context = vm.createContext({
    localStorage: {
      store: new Map(),
      getItem(k) {
        return this.store.has(k) ? this.store.get(k) : null;
      },
      setItem(k, v) {
        this.store.set(k, String(v));
      },
      removeItem(k) {
        this.store.delete(k);
      },
      clear() {
        this.store.clear();
      },
    },
    console,
  });
  // Strip ES module syntax for VM
  const stripped = storageSource
    .replace(/^import\s.+$/gm, "")
    .replace(/^export\s+/gm, "");
  vm.runInContext(
    stripped +
      "\n;globalThis.api = { setStorageUser, getStoragePrefix };",
    context
  );
  const { setStorageUser, getStoragePrefix } = context.api;

  setStorageUser(null);
  assert.equal(getStoragePrefix(), "testbox-");

  // Same UUID before and after a Google re-login → same namespace
  const uuid = "11111111-2222-3333-4444-555555555555";
  setStorageUser(uuid);
  const first = getStoragePrefix();
  assert.equal(first, `testbox-${uuid}-`);

  setStorageUser(null);
  setStorageUser(uuid);
  assert.equal(getStoragePrefix(), first);

  // Different user must not share the namespace
  setStorageUser("other-uuid");
  assert.equal(getStoragePrefix(), "testbox-other-uuid-");
});

test("auth: sync remains keyed on authenticated user.id (static)", async () => {
  const source = await readFile(
    new URL("../components/CloudSyncManager.jsx", import.meta.url),
    "utf8"
  );
  assert.match(source, /setStorageUser\(\s*user\.id\s*\)/);
  assert.match(source, /user_id/);
  // Gated on live user, not on a raw email
  assert.match(source, /if \(!user\)/);
});

test("auth: OAuth callback exchange is idempotent-safe (no storage writes in handler)", async () => {
  const flow = await loadAuthFlow();
  let exchanges = 0;
  const auth = {
    exchangeCodeForSession: async (code) => {
      exchanges += 1;
      if (exchanges > 1) {
        return { error: { message: "flow_state_not_found" } };
      }
      assert.equal(code, "abc");
      return { error: null };
    },
  };

  const first = await flow.handleAuthCallback(
    auth,
    "https://x.test/?code=abc"
  );
  assert.equal(first.ok, true);

  // Duplicate callback: fails cleanly without throwing or "succeeding"
  const second = await flow.handleAuthCallback(
    auth,
    "https://x.test/?code=abc"
  );
  assert.equal(second.ok, false);
  assert.equal(exchanges, 2);
});

test("auth: failed OAuth callback does not treat missing code as success", async () => {
  const flow = await loadAuthFlow();
  const auth = {
    exchangeCodeForSession: async () => {
      throw new Error("must not run");
    },
  };
  const noCode = await flow.handleAuthCallback(auth, "https://x.test/#/login");
  assert.equal(noCode.ok, false);
  assert.equal(noCode.error, "no_code");

  const denied = await flow.handleAuthCallback(
    auth,
    "https://x.test/?error=access_denied"
  );
  assert.equal(denied.ok, false);
  assert.equal(denied.error, "access_denied");
});

test("auth: Login page exposes Continue with Google and keeps password path", async () => {
  const login = await readFile(
    new URL("../pages/Login.jsx", import.meta.url),
    "utf8"
  );
  assert.match(login, /signInWithGoogle/);
  assert.match(login, /auth\.google\.continue/);
  assert.match(login, /signInWithPassword/);
  assert.match(login, /type="password"/);
});

test("auth: all auth.google.* and auth.orEmail i18n keys defined in fa+en", async () => {
  const translations = await readFile(
    new URL("../i18n/translations.js", import.meta.url),
    "utf8"
  );
  for (const key of [
    "auth.google.continue",
    "auth.google.loading",
    "auth.google.error",
    "auth.orEmail",
  ]) {
    const count = translations.split(`"${key}"`).length - 1;
    assert.equal(count, 2, `${key} defined twice (fa+en)`);
  }
});

test("auth: AuthContext does not sign up or create a second user on Google path", async () => {
  const authContext = await readFile(
    new URL("../context/AuthContext.jsx", import.meta.url),
    "utf8"
  );
  assert.ok(!authContext.includes("signInWithPassword"));
  assert.ok(!authContext.includes(".signUp("));

  const flowSource = await readFile(
    new URL("./authFlow.js", import.meta.url),
    "utf8"
  );
  assert.ok(!flowSource.includes(".signUp("));
  assert.ok(!flowSource.includes("signInWithPassword"));
  // No data-copy / FK rewrite helpers
  assert.ok(!/copy.*user|merge.*uuid|rewrite.*foreign/i.test(flowSource));
});

test("auth: Electron main registers testbox protocol and forwards callback", async () => {
  const source = await readFile(
    new URL("../../electron/main.cjs", import.meta.url),
    "utf8"
  );
  assert.match(source, /setAsDefaultProtocolClient/);
  assert.match(source, /testbox:auth-callback/);
  assert.match(source, /open-url/);
});

test("auth: Android manifest declares testbox deep link", async () => {
  const source = await readFile(
    new URL("../../android/app/src/main/AndroidManifest.xml", import.meta.url),
    "utf8"
  );
  assert.match(source, /android:scheme="testbox"/);
  assert.match(source, /android:host="auth"/);
});

test("auth: packaging.md documents Google + Supabase deploy steps and redirect URLs", async () => {
  const source = await readFile(
    new URL("../../docs/packaging.md", import.meta.url),
    "utf8"
  );
  assert.match(source, /Google Sign-In/);
  assert.match(source, /mnkqjwtqtzlwmbzfquzf\.supabase\.co\/auth\/v1\/callback/);
  assert.match(source, /itsakhb\.github\.io\/TestBox/);
  assert.match(source, /testbox:\/\/auth\/callback/);
  assert.match(source, /Client [Ss]ecret/);
});
