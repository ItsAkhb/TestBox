// Persisted device identity for this install. Stable across restarts;
// used by multi-tab / multi-device coordination and offline-mode UI so
// diagnostics can tell two browsers on the same account apart.
const DEVICE_KEY = "testbox-device-id";

function randomId() {
  try {
    if (typeof crypto !== "undefined" && crypto.randomUUID) {
      return crypto.randomUUID();
    }
  } catch {
    // fall through
  }
  return `dev-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

let cachedDeviceId = null;

export function getDeviceId() {
  if (cachedDeviceId) return cachedDeviceId;
  try {
    let id = localStorage.getItem(DEVICE_KEY);
    if (!id) {
      id = randomId();
      localStorage.setItem(DEVICE_KEY, id);
    }
    cachedDeviceId = id;
  } catch {
    // storage unavailable — ephemeral id for this session only
    cachedDeviceId = randomId();
  }
  return cachedDeviceId;
}

// =========================================================
// User-selected offline mode (spec §18–19)
// Offline mode is NEVER entered automatically. The user must pick
// "Enter Offline Mode" when connectivity is missing (or later from
// the TopBar). Once entered, sync stays paused until "Go Online".
// =========================================================

const MANUAL_OFFLINE_KEY = "testbox-manual-offline";

export function isManualOffline() {
  try {
    return localStorage.getItem(MANUAL_OFFLINE_KEY) === "1";
  } catch {
    return false;
  }
}

export function setManualOffline(active) {
  try {
    if (active) {
      localStorage.setItem(MANUAL_OFFLINE_KEY, "1");
    } else {
      localStorage.removeItem(MANUAL_OFFLINE_KEY);
    }
  } catch {
    // storage unavailable — mode lasts for this session only
  }
}

// Connectivity prompt: shown once per session when the network is
// unavailable and the user has not chosen manual offline yet.
let promptShownThisSession = false;

export function shouldOfferOfflinePrompt({ online, manualOffline }, { mark = true } = {}) {
  if (manualOffline) return false;
  if (online) return false;
  if (promptShownThisSession) return false;
  if (mark) promptShownThisSession = true;
  return true;
}

export function markOfflinePromptShown() {
  promptShownThisSession = true;
}

export function resetOfflinePromptForTests() {
  promptShownThisSession = false;
  cachedDeviceId = null;
}
