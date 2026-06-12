"use client";

import { useState } from "react";
import type { AppLocale } from "./locales";
import { LOCALE_OPTIONS } from "./locales";
import { useI18n } from "./I18nProvider";

const selectClassName =
  "rounded-lg border border-pine/25 bg-paper px-3 py-2 text-sm text-ink shadow-inner shadow-pine/5 focus:border-terracotta focus:outline-none focus:ring-2 focus:ring-terracotta/30";

type LanguageSwitcherProps = {
  compact?: boolean;
  className?: string;
};

async function parseError(res: Response): Promise<string> {
  try {
    const data: unknown = await res.json();
    if (
      typeof data === "object" &&
      data !== null &&
      "error" in data &&
      typeof (data as { error: unknown }).error === "string"
    ) {
      return (data as { error: string }).error;
    }
  } catch {
    /* ignore */
  }
  return "Request failed.";
}

export function LanguageSwitcher({
  compact = false,
  className,
}: LanguageSwitcherProps) {
  const { locale, setLocale, t } = useI18n();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function onChange(next: AppLocale) {
    if (next === locale) return;
    setError(null);
    setMessage(null);
    const previous = locale;
    setLocale(next);
    setSaving(true);
    const res = await fetch("/api/me/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ preferredLocale: next }),
    });
    setSaving(false);
    if (!res.ok) {
      setLocale(previous);
      setError(await parseError(res));
      return;
    }
    setMessage(t("language.updated"));
  }

  return (
    <div className={className}>
      <label
        className={
          compact
            ? "flex items-center gap-2 text-sm text-[var(--text-secondary)]"
            : "flex flex-col gap-1 text-sm font-medium text-pine"
        }
      >
        <span className={compact ? "sr-only" : "font-normal text-ink/70"}>
          {compact ? t("language.label") : t("language.preferred")}
        </span>
        <select
          className={selectClassName}
          value={locale}
          disabled={saving}
          aria-label={t("language.label")}
          onChange={(e) => void onChange(e.target.value as AppLocale)}
        >
          {LOCALE_OPTIONS.map((option) => (
            <option key={option.code} value={option.code}>
              {option.nativeLabel}
            </option>
          ))}
        </select>
      </label>
      {!compact && error ? (
        <p className="mt-2 text-sm text-danger">{error}</p>
      ) : null}
      {!compact && message ? (
        <p className="mt-2 text-sm text-success">{message}</p>
      ) : null}
      {!compact && saving ? (
        <p className="mt-2 text-sm text-ink/70">{t("language.saving")}</p>
      ) : null}
    </div>
  );
}
