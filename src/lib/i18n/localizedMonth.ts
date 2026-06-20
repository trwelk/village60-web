import type { AppLocale } from "./locales";

const BCP47: Record<AppLocale, string> = {
  en: "en",
  si: "si-LK",
  ta: "ta-LK",
};

export function localizedMonthLabel(
  locale: AppLocale,
  monthIndex: number,
): string {
  return new Date(2000, monthIndex, 1).toLocaleString(BCP47[locale], {
    month: "long",
  });
}

export function localizedBillingMonthLabel(
  locale: AppLocale,
  ym: string,
): string {
  const parts = ym.split("-");
  const y = parts[0];
  const monthIndex = Number(parts[1]) - 1;
  if (!y || !Number.isFinite(monthIndex) || monthIndex < 0 || monthIndex > 11) {
    return ym;
  }
  return `${localizedMonthLabel(locale, monthIndex)} ${y}`;
}

export function localizedMonthOptions(
  locale: AppLocale,
): { value: string; label: string }[] {
  return Array.from({ length: 12 }, (_, i) => ({
    value: String(i + 1),
    label: localizedMonthLabel(locale, i),
  }));
}
