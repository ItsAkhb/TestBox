import { createContext, useCallback, useContext, useState } from "react";

import { getSettings, saveSettings } from "../services/dataService";

const SettingsContext = createContext(null);

const DEFAULT_SETTINGS = {
  language: "fa",
  weatherLocation: { lat: 35.6892, lon: 51.3890, name: "Tehran" },
  defaultNegativeMarking: true,
  defaultExamType: "practice",
};

export function SettingsProvider({ children }) {
  const [settings, setSettingsState] = useState(() => {
    try {
      return { ...DEFAULT_SETTINGS, ...getSettings() };
    } catch {
      return DEFAULT_SETTINGS;
    }
  });

  const updateSettings = useCallback((updates) => {
    setSettingsState((prev) => {
      const next = { ...prev, ...updates };
      try {
        saveSettings(next);
      } catch {
        // storage unavailable — settings stay in-memory
      }
      return next;
    });
  }, []);

  return (
    <SettingsContext.Provider value={{ settings, updateSettings }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  const context = useContext(SettingsContext);
  if (!context) {
    throw new Error("useSettings must be used inside SettingsProvider");
  }
  return context;
}
