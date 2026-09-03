import { createContext, useCallback, useContext, useState } from "react";

const SettingsContext = createContext(null);

const DEFAULT_SETTINGS = {
  language: "fa",
  weatherLocation: { lat: 35.6892, lon: 51.3890, name: "Tehran" },
};

export function SettingsProvider({ children }) {
  const [settings, setSettingsState] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("testbox-settings") || "null");
      return { ...DEFAULT_SETTINGS, ...saved };
    } catch {
      return DEFAULT_SETTINGS;
    }
  });

  const updateSettings = useCallback((updates) => {
    setSettingsState((prev) => {
      const next = { ...prev, ...updates };
      try {
        localStorage.setItem("testbox-settings", JSON.stringify(next));
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
