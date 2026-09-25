// Single theme module — the ONLY place that reads/writes the persisted
// theme preference and applies `data-theme` to <html>.
//
// Preference values (localStorage["testbox-theme"]):
//   "system" | "light" | "dark"
//
// Back-compat: legacy installs stored only "light"/"dark" — both are
// still valid and honored. A missing/invalid key resolves to "system"
// (follows the OS preference) instead of forcing light.

const THEME_KEY = "testbox-theme";
const VALID = ["system", "light", "dark"];

let preference = readPreference();
const listeners = new Set();
let mediaQuery = null;
let mediaListenerAttached = false;

function readPreference() {
  try {
    const raw = localStorage.getItem(THEME_KEY);
    if (VALID.includes(raw)) return raw;
  } catch {
    // storage unavailable (private mode) — fall through to default
  }
  return "system";
}

// Resolve the preference to an concrete theme actually applied to the DOM.
export function resolveTheme(pref = preference) {
  if (pref === "light" || pref === "dark") return pref;
  try {
    return window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
  } catch {
    return "light";
  }
}

export function getThemePreference() {
  return preference;
}

function apply() {
  document.documentElement.setAttribute("data-theme", resolveTheme());
}

function emit() {
  listeners.forEach((fn) => {
    try {
      fn();
    } catch {
      // a broken subscriber must not break the others
    }
  });
}

function handleSystemChange() {
  if (preference !== "system") return;
  apply();
  emit();
}

function ensureSystemListener() {
  if (mediaListenerAttached) return;
  if (typeof window === "undefined" || !window.matchMedia) return;
  mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
  if (mediaQuery.addEventListener) {
    mediaQuery.addEventListener("change", handleSystemChange);
  } else if (mediaQuery.addListener) {
    mediaQuery.addListener(handleSystemChange);
  }
  mediaListenerAttached = true;
}

export function setThemePreference(next) {
  const value = VALID.includes(next) ? next : "system";
  preference = value;
  try {
    localStorage.setItem(THEME_KEY, value);
  } catch {
    // non-fatal — the in-memory preference still applies this session
  }
  apply();
  ensureSystemListener();
  emit();
}

// Subscribe to preference/resolved-theme changes (React hook bridge +
// cross-tab sync).
export function subscribeTheme(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

// Apply the saved preference once per app start (called from main.jsx
// before render, and safe to call again).
export function initTheme() {
  preference = readPreference();
  apply();
  ensureSystemListener();
}

// Cross-tab: another tab changing the theme updates this one.
if (typeof window !== "undefined") {
  window.addEventListener("storage", (event) => {
    if (event.key !== THEME_KEY) return;
    preference = readPreference();
    apply();
    emit();
  });
}
