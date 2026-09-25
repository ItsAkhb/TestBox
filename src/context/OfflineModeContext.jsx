import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import { useAuth } from "./AuthContext";
import {
  getDeviceId,
  isManualOffline,
  setManualOffline,
  shouldOfferOfflinePrompt,
  markOfflinePromptShown,
} from "../services/offlineMode";

const OfflineModeContext = createContext(null);

/**
 * User-controlled offline mode (spec §18–19).
 *
 * - Never enters offline mode automatically.
 * - When connectivity is missing and the user has not chosen offline,
 *   offers a one-shot prompt: Retry or Enter Offline Mode.
 * - Manual offline pauses sync until Go Online, which immediately
 *   re-probes connectivity and (when online) lets CloudSyncManager
 *   drain the outbox.
 */
export function OfflineModeProvider({ children }) {
  const { isOffline, networkOnline, supabaseReachable } = useAuth();

  const [manualOffline, setManualOfflineState] = useState(() => isManualOffline());
  const [showPrompt, setShowPrompt] = useState(false);
  const [deviceId] = useState(() => getDeviceId());

  // One-shot offer when the app discovers it has no connectivity and
  // the user has not already chosen offline mode. Pure check during
  // render ({ mark: false }) so StrictMode's double-render is safe;
  // the module "shown" flag is set in an effect once the prompt is up.
  let effectiveShowPrompt = showPrompt;
  if (!isOffline && showPrompt) {
    effectiveShowPrompt = false;
  } else if (
    isOffline &&
    !manualOffline &&
    !showPrompt &&
    shouldOfferOfflinePrompt({ online: false, manualOffline }, { mark: false })
  ) {
    effectiveShowPrompt = true;
  }
  if (effectiveShowPrompt !== showPrompt) {
    setShowPrompt(effectiveShowPrompt);
  }

  useEffect(() => {
    if (showPrompt) markOfflinePromptShown();
  }, [showPrompt]);

  const enterOfflineMode = useCallback(() => {
    setManualOffline(true);
    setManualOfflineState(true);
    setShowPrompt(false);
  }, []);

  const goOnline = useCallback(() => {
    setManualOffline(false);
    setManualOfflineState(false);
    setShowPrompt(false);
    // Force a connectivity re-probe: AuthContext listens to online/offline
    // events; dispatching online re-runs the health probe when the browser
    // already believes it is online (manual offline can outlive the event).
    try {
      window.dispatchEvent(new Event("online"));
    } catch {
      // non-browser environment
    }
  }, []);

  const dismissPrompt = useCallback(() => {
    // Closing the dialog without choosing keeps the current mode
    // (online-or-unknown). Never silently enters offline mode.
    setShowPrompt(false);
  }, []);

  const retryConnectivity = useCallback(() => {
    setShowPrompt(false);
    try {
      window.dispatchEvent(new Event("online"));
    } catch {
      // non-browser environment
    }
    // Re-offer the prompt if still offline after the retry attempt.
    setTimeout(() => {
      if (!isManualOffline()) {
        setShowPrompt(
          shouldOfferOfflinePrompt({ online: false, manualOffline: false })
        );
      }
    }, 6500);
  }, []);

  const value = useMemo(
    () => ({
      manualOffline,
      // Effective "do not hit the network" for the sync engine:
      // user chose offline OR the network/probe says we're offline.
      offline: manualOffline || isOffline,
      showPrompt,
      deviceId,
      networkOnline,
      supabaseReachable,
      enterOfflineMode,
      goOnline,
      dismissPrompt,
      retryConnectivity,
    }),
    [
      manualOffline,
      isOffline,
      showPrompt,
      deviceId,
      networkOnline,
      supabaseReachable,
      enterOfflineMode,
      goOnline,
      dismissPrompt,
      retryConnectivity,
    ]
  );

  return (
    <OfflineModeContext.Provider value={value}>
      {children}
    </OfflineModeContext.Provider>
  );
}

export function useOfflineMode() {
  const context = useContext(OfflineModeContext);
  if (!context) {
    throw new Error("useOfflineMode must be used inside OfflineModeProvider");
  }
  return context;
}
