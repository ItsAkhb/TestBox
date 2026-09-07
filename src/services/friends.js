import { supabase } from "./supabaseClient";

// =========================================================
// Friends — profiles, requests, friendships
// Server-backed through Supabase (RLS-protected). This is the one
// feature whose data lives only in the cloud: profiles and friendships
// are account-level by definition and have no meaningful local-only
// state, so offline the Friends page simply shows cached error/empty
// states and syncs nothing.
// =========================================================

// A profile counts as "online" when its heartbeat is newer than this.
export const ONLINE_WINDOW_MS = 5 * 60 * 1000;

function isOnline(updatedAt) {
  if (!updatedAt) return false;
  return Date.now() - Date.parse(updatedAt) < ONLINE_WINDOW_MS;
}

/**
 * Get or create the current user's profile. Returns
 * { userId, username, displayName, updatedAt } or null.
 */
export async function getMyProfile(userId) {
  if (!userId) return null;

  const { data, error } = await supabase
    .from("profiles")
    .select("user_id, username, display_name, updated_at")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw error;
  if (data) {
    return {
      userId: data.user_id,
      username: data.username,
      displayName: data.display_name || data.username,
      updatedAt: data.updated_at,
    };
  }

  // First visit: auto-create a profile from the email local part.
  const { data: sessionData } = await supabase.auth.getUser();
  const email = sessionData?.user?.email || "";
  const base = (email.split("@")[0] || "user").replace(/[^a-zA-Z0-9_]/g, "").slice(0, 20) || "user";
  const username = `${base}_${String(userId).slice(0, 4)}`;

  const { data: created, error: createError } = await supabase
    .from("profiles")
    .upsert(
      { user_id: userId, username, display_name: username },
      { onConflict: "user_id" }
    )
    .select("user_id, username, display_name, updated_at")
    .single();

  if (createError) {
    // username collision: retry once with a random suffix
    const retry = `${base}_${Math.random().toString(36).slice(2, 6)}`;
    const { data: retried, error: retryError } = await supabase
      .from("profiles")
      .upsert(
        { user_id: userId, username: retry, display_name: retry },
        { onConflict: "user_id" }
      )
      .select("user_id, username, display_name, updated_at")
      .single();
    if (retryError) throw retryError;
    return {
      userId: retried.user_id,
      username: retried.username,
      displayName: retried.display_name || retried.username,
      updatedAt: retried.updated_at,
    };
  }

  return {
    userId: created.user_id,
    username: created.username,
    displayName: created.display_name || created.username,
    updatedAt: created.updated_at,
  };
}

export async function updateProfile(userId, { username, displayName }) {
  const patch = { updated_at: new Date().toISOString() };
  if (username != null) patch.username = username.trim();
  if (displayName != null) patch.display_name = displayName.trim();

  const { data, error } = await supabase
    .from("profiles")
    .upsert({ user_id: userId, ...patch }, { onConflict: "user_id" })
    .select("user_id, username, display_name, updated_at")
    .single();

  if (error) throw error;
  return {
    userId: data.user_id,
    username: data.username,
    displayName: data.display_name || data.username,
    updatedAt: data.updated_at,
  };
}

/**
 * Heartbeat: touch updated_at so friends see this account as online.
 * Cheap; call on app load and when the Friends page opens.
 */
export async function heartbeat(userId) {
  if (!userId) return;
  try {
    await supabase
      .from("profiles")
      .upsert(
        { user_id: userId, updated_at: new Date().toISOString() },
        { onConflict: "user_id" }
      );
  } catch {
    // non-fatal — presence is best-effort
  }
}

export async function searchUsers(query) {
  const q = String(query || "").trim();
  if (!q) return [];
  const { data, error } = await supabase
    .from("profiles")
    .select("user_id, username, display_name, updated_at")
    .ilike("username", `%${q}%`)
    .limit(10);
  if (error) throw error;
  return (data || []).map((p) => ({ ...p, online: isOnline(p.updated_at) }));
}

/**
 * All friendships of the current user, enriched with the other side's
 * profile and online status.
 */
export async function getFriends(userId) {
  if (!userId) return [];
  const { data, error } = await supabase
    .from("friendships")
    .select("user_a, user_b, created_at")
    .or(`user_a.eq.${userId},user_b.eq.${userId}`);
  if (error) throw error;

  const otherIds = (data || []).map((f) =>
    String(f.user_a) === String(userId) ? f.user_b : f.user_a
  );
  if (otherIds.length === 0) return [];

  const { data: profiles, error: pError } = await supabase
    .from("profiles")
    .select("user_id, username, display_name, updated_at")
    .in("user_id", otherIds);
  if (pError) throw pError;

  const byId = new Map((profiles || []).map((p) => [String(p.user_id), p]));
  return (data || []).map((f) => {
    const otherId = String(f.user_a) === String(userId) ? f.user_b : f.user_a;
    const profile = byId.get(String(otherId));
    return {
      userId: otherId,
      username: profile?.username || "unknown",
      displayName: profile?.display_name || profile?.username || "unknown",
      online: isOnline(profile?.updated_at),
      friendsSince: f.created_at,
    };
  });
}

/** Incoming (to me) + outgoing (from me) pending requests. */
export async function getRequests(userId) {
  if (!userId) return { incoming: [], outgoing: [] };

  const { data, error } = await supabase
    .from("friend_requests")
    .select("id, requester_id, addressee_id, created_at")
    .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`);
  if (error) throw error;

  const rows = data || [];
  const incoming = rows.filter((r) => String(r.addressee_id) === String(userId));
  const outgoing = rows.filter((r) => String(r.requester_id) === String(userId));

  const allIds = [
    ...incoming.map((r) => r.requester_id),
    ...outgoing.map((r) => r.addressee_id),
  ];

  let profiles = [];
  if (allIds.length > 0) {
    const { data: p, error: pError } = await supabase
      .from("profiles")
      .select("user_id, username, display_name, updated_at")
      .in("user_id", allIds);
    if (pError) throw pError;
    profiles = p || [];
  }
  const byId = new Map(profiles.map((p) => [String(p.user_id), p]));

  const enrich = (r, otherId) => {
    const profile = byId.get(String(otherId));
    return {
      id: r.id,
      userId: otherId,
      username: profile?.username || "unknown",
      displayName: profile?.display_name || profile?.username || "unknown",
      online: isOnline(profile?.updated_at),
      createdAt: r.created_at,
    };
  };

  return {
    incoming: incoming.map((r) => enrich(r, r.requester_id)),
    outgoing: outgoing.map((r) => enrich(r, r.addressee_id)),
  };
}

export async function sendFriendRequest(requesterId, addresseeId) {
  if (!requesterId || !addresseeId) throw new Error("missing ids");
  if (String(requesterId) === String(addresseeId)) {
    throw new Error("self");
  }
  const { error } = await supabase
    .from("friend_requests")
    .upsert(
      { requester_id: requesterId, addressee_id: addresseeId },
      { onConflict: "requester_id,addressee_id" }
    );
  if (error) throw error;
}

/** Accept: move the request into friendships, drop the request row. */
export async function acceptFriendRequest(userId, requestId) {
  const { data, error } = await supabase
    .from("friend_requests")
    .select("id, requester_id, addressee_id")
    .eq("id", requestId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("not-found");
  if (String(data.addressee_id) !== String(userId)) throw new Error("forbidden");

  // Deterministic ordering keeps the unique constraint symmetric.
  const [a, b] = [data.requester_id, data.addressee_id].sort();

  const { error: fError } = await supabase
    .from("friendships")
    .upsert({ user_a: a, user_b: b }, { onConflict: "user_a,user_b" });
  if (fError) throw fError;

  const { error: dError } = await supabase
    .from("friend_requests")
    .delete()
    .eq("id", requestId);
  if (dError) throw dError;
}

export async function rejectFriendRequest(userId, requestId) {
  const { data, error } = await supabase
    .from("friend_requests")
    .select("id, addressee_id, requester_id")
    .eq("id", requestId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return;
  if (
    String(data.addressee_id) !== String(userId) &&
    String(data.requester_id) !== String(userId)
  ) {
    throw new Error("forbidden");
  }
  const { error: dError } = await supabase
    .from("friend_requests")
    .delete()
    .eq("id", requestId);
  if (dError) throw dError;
}

export async function removeFriend(userId, friendId) {
  // The unique pair may be stored in either orientation.
  const [a, b] = [userId, friendId].sort();
  const { error } = await supabase
    .from("friendships")
    .delete()
    .eq("user_a", a)
    .eq("user_b", b);
  if (error) throw error;
}
