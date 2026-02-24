import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { SUPPORTED_LANGUAGES, translations } from './translations';

export const LANGUAGE_STORAGE_KEY = 'tirpe_language';
const TRANSLATION_PACK_PREFIX = 'tirpe_dynamic_i18n_pack_v1';
const FALLBACK_LANG = 'en';

const LanguageContext = createContext({
  language: FALLBACK_LANG,
  setLanguage: () => {},
  t: (key) => key,
  supportedLanguages: SUPPORTED_LANGUAGES,
});

function detectInitialLanguage() {
  try {
    const stored = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
    if (stored && SUPPORTED_LANGUAGES.some((entry) => entry.code === stored)) {
      return stored;
    }
  } catch {
    // ignore storage read error
  }

  try {
    const browser = (navigator.language || '').slice(0, 2).toLowerCase();
    if (SUPPORTED_LANGUAGES.some((entry) => entry.code === browser)) {
      return browser;
    }
  } catch {
    // ignore browser language read error
  }

  return FALLBACK_LANG;
}

export function LanguageProvider({ children }) {
  const [language, setLanguageState] = useState(detectInitialLanguage);
  const [dynamicPack, setDynamicPack] = useState({});

  useEffect(() => {
    let cancelled = false;

    async function hydrateDynamicPack() {
      if (language === FALLBACK_LANG) {
        if (!cancelled) {
          setDynamicPack({});
        }
        return;
      }

      const englishEntries = translations[FALLBACK_LANG] || {};
      const staticEntries = translations[language] || {};
      const missingEntries = {};

      for (const [key, value] of Object.entries(englishEntries)) {
        if (!staticEntries[key]) {
          missingEntries[key] = value;
        }
      }

      if (!Object.keys(missingEntries).length) {
        if (!cancelled) {
          setDynamicPack({});
        }
        return;
      }

      const cacheKey = `${TRANSLATION_PACK_PREFIX}:${language}`;
      try {
        const cachedRaw = window.localStorage.getItem(cacheKey);
        if (cachedRaw) {
          const cached = JSON.parse(cachedRaw);
          if (cached && typeof cached === 'object') {
            if (!cancelled) {
              setDynamicPack(cached);
            }
            return;
          }
        }
      } catch {
        // ignore cache read errors
      }

      try {
        const baseUrl = import.meta.env.VITE_API_URL || 'http://localhost:4000/api';
        const keys = Object.keys(missingEntries);
        const batchSize = 40;
        const translatedPack = {};

        for (let index = 0; index < keys.length; index += batchSize) {
          const batchKeys = keys.slice(index, index + batchSize);
          const batchEntries = {};
          batchKeys.forEach((key) => {
            batchEntries[key] = missingEntries[key];
          });

          const response = await fetch(`${baseUrl}/i18n/pack`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              language,
              entries: batchEntries,
            }),
          });

          const payload = await response.json();
          const packChunk = payload?.data?.entries || {};
          Object.assign(translatedPack, packChunk);
        }

        const pack = translatedPack;
        if (!cancelled) {
          setDynamicPack(pack);
        }
        try {
          window.localStorage.setItem(cacheKey, JSON.stringify(pack));
        } catch {
          // ignore cache write errors
        }
      } catch {
        if (!cancelled) {
          setDynamicPack({});
        }
      }
    }

    hydrateDynamicPack();

    return () => {
      cancelled = true;
    };
  }, [language]);

  useEffect(() => {
    try {
      document.documentElement.lang = language;
    } catch {
      // ignore document write errors
    }
  }, [language]);

  function setLanguage(next) {
    const valid = SUPPORTED_LANGUAGES.some((entry) => entry.code === next);
    const chosen = valid ? next : FALLBACK_LANG;
    setLanguageState(chosen);

    try {
      window.localStorage.setItem(LANGUAGE_STORAGE_KEY, chosen);
    } catch {
      // ignore storage write error
    }

    if (chosen !== language) {
      window.location.reload();
    }
  }

  const value = useMemo(() => ({
    language,
    setLanguage,
    supportedLanguages: SUPPORTED_LANGUAGES,
    t: (key) => {
      const selected = translations[language] || {};
      const fallback = translations[FALLBACK_LANG] || {};
      return selected[key] || dynamicPack[key] || fallback[key] || key;
    },
  }), [language, dynamicPack]);

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  return useContext(LanguageContext);
}
