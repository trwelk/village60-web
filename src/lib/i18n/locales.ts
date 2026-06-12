export const APP_LOCALES = ["en", "si", "ta"] as const;

export type AppLocale = (typeof APP_LOCALES)[number];

export const DEFAULT_LOCALE: AppLocale = "en";

export type LocaleOption = {
  code: AppLocale;
  labelKey: "language.english" | "language.sinhala" | "language.tamil";
  nativeLabel: string;
};

export const LOCALE_OPTIONS: LocaleOption[] = [
  { code: "en", labelKey: "language.english", nativeLabel: "English" },
  { code: "si", labelKey: "language.sinhala", nativeLabel: "සිංහල" },
  { code: "ta", labelKey: "language.tamil", nativeLabel: "தமிழ்" },
];

export function isAppLocale(value: string): value is AppLocale {
  return (APP_LOCALES as readonly string[]).includes(value);
}

export function parseAppLocale(
  value: string | null | undefined,
): AppLocale | null {
  if (value == null) return null;
  const trimmed = value.trim();
  return isAppLocale(trimmed) ? trimmed : null;
}
