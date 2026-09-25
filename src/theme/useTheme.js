import { useSyncExternalStore } from "react";
import {
  getThemePreference,
  resolveTheme,
  setThemePreference,
  subscribeTheme,
} from "./theme";

// Snapshot must be a stable primitive for useSyncExternalStore.
function getSnapshot() {
  return `${getThemePreference()}|${resolveTheme()}`;
}

// React bridge over the theme module: one source of truth shared by
// TopBar and Settings (no per-component localStorage logic).
export function useTheme() {
  const snapshot = useSyncExternalStore(subscribeTheme, getSnapshot, getSnapshot);
  const [preference, resolvedTheme] = snapshot.split("|");

  return {
    preference, // "system" | "light" | "dark"
    resolvedTheme, // "light" | "dark" — what is actually applied
    setTheme: setThemePreference,
  };
}

export default useTheme;
