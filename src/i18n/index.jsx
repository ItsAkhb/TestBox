import { createContext, useCallback, useContext, useEffect, useState } from "react";
import translations from "./translations";

const I18nContext = createContext(null);

export function I18nProvider({ children }) {
  const [language, setLanguageState] = useState(() => {
    try {
      const settings = JSON.parse(localStorage.getItem("testbox-settings") || "null");
      return settings?.language || "fa";
    } catch {
      return "fa";
    }
  });

  const setLanguage = useCallback((lang) => {
    setLanguageState(lang);

    document.documentElement.dir = lang === "fa" ? "rtl" : "ltr";
    document.documentElement.lang = lang;

    try {
      const settings = JSON.parse(localStorage.getItem("testbox-settings") || "{}");
      settings.language = lang;
      localStorage.setItem("testbox-settings", JSON.stringify(settings));
    } catch {
      // storage unavailable — language stays in-memory
    }
  }, []);

  useEffect(() => {
    document.documentElement.dir = language === "fa" ? "rtl" : "ltr";
    document.documentElement.lang = language;
  }, [language]);

  const t = useCallback((key, params) => {
    let text =
      translations[language]?.[key] || translations["fa"]?.[key] || key;
    if (params && typeof text === "string") {
      Object.keys(params).forEach((param) => {
        text = text.split(`{${param}}`).join(String(params[param]));
      });
    }
    return text;
  }, [language]);

  const formatDate = useCallback((date, options = {}) => {
    const locale = language === "fa" ? "fa-IR" : "en-US";
    return new Intl.DateTimeFormat(locale, options).format(new Date(date));
  }, [language]);

  const formatNumber = useCallback((num) => {
    const locale = language === "fa" ? "fa-IR" : "en-US";
    return new Intl.NumberFormat(locale).format(num);
  }, [language]);

  return (
    <I18nContext.Provider value={{ t, language, setLanguage, formatDate, formatNumber }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useTranslation() {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error("useTranslation must be used inside I18nProvider");
  }
  return context;
}
