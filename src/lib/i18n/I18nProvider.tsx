"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { AppLocale } from "./locales";
import { DEFAULT_LOCALE } from "./locales";
import { ButtonAutoLocalizer } from "./ButtonAutoLocalizer";
import { UI_LITERAL_MAP } from "./uiLiterals";
import { createTranslator, type TranslateFn } from "./messages";

type I18nContextValue = {
  locale: AppLocale;
  setLocale: (locale: AppLocale) => void;
  t: TranslateFn;
  /** Translate a known English UI label (buttons, links). */
  tl: (englishLabel: string) => string;
};

const I18nContext = createContext<I18nContextValue | null>(null);

type I18nProviderProps = {
  initialLocale?: AppLocale;
  children: React.ReactNode;
};

export function I18nProvider({
  initialLocale = DEFAULT_LOCALE,
  children,
}: I18nProviderProps) {
  const [locale, setLocaleState] = useState<AppLocale>(initialLocale);

  useEffect(() => {
    setLocaleState(initialLocale);
  }, [initialLocale]);

  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dataset.locale = locale;
  }, [locale]);

  const setLocale = useCallback((next: AppLocale) => {
    setLocaleState(next);
  }, []);

  const t = useMemo(() => createTranslator(locale), [locale]);

  const tl = useCallback(
    (englishLabel: string) => {
      const key = UI_LITERAL_MAP[englishLabel];
      return key ? t(key) : englishLabel;
    },
    [t],
  );

  const value = useMemo(
    () => ({
      locale,
      setLocale,
      t,
      tl,
    }),
    [locale, setLocale, t, tl],
  );

  return (
    <I18nContext.Provider value={value}>
      <ButtonAutoLocalizer locale={locale} />
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) {
    throw new Error("useI18n must be used within I18nProvider");
  }
  return ctx;
}
