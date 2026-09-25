import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabasePublishableKey =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

// PKCE keeps the OAuth return code in the query string (?code=...) so
// it does not collide with HashRouter's `#/...` fragment. Implicit
// flow would place tokens in the hash and break route parsing.
export const supabase = createClient(
  supabaseUrl,
  supabasePublishableKey,
  {
    auth: {
      flowType: "pkce",
      detectSessionInUrl: true,
      persistSession: true,
      autoRefreshToken: true,
    },
  }
);

// True while OUR code is performing an explicit sign-out. Supabase also
// emits SIGNED_OUT when an offline token refresh fails — that one must
// NOT clear the cached identity (the user never asked to sign out).
// The AuthContext reads this flag to tell the two apart; no credentials
// are involved, just an in-memory boolean.
let userInitiatedSignOut = false;

export function markUserInitiatedSignOut() {
  userInitiatedSignOut = true;
}

export function consumeUserInitiatedSignOut() {
  const value = userInitiatedSignOut;
  userInitiatedSignOut = false;
  return value;
}