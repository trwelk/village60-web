"use client";

import { useI18n } from "@/lib/i18n/I18nProvider";
import { LanguageSwitcher } from "@/lib/i18n/LanguageSwitcher";
import type { AppLocale } from "@/lib/i18n/locales";
import { useEffect, useState } from "react";

type ProfilePayload = {
  email: string;
  role: string;
  displayName: string | null;
  phone: string | null;
  avatarUrl: string | null;
  preferredLocale: AppLocale;
};

const inputClassName =
  "rounded-lg border border-pine/25 bg-paper px-3 py-2 text-ink shadow-inner shadow-pine/5 focus:border-terracotta focus:outline-none focus:ring-2 focus:ring-terracotta/30";

export function UserDetailsCard() {
  const { t, setLocale } = useI18n();
  const [profile, setProfile] = useState<ProfilePayload | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [phone, setPhone] = useState("");
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function roleLabel(role: string): string {
    if (role === "admin") return t("roles.admin");
    if (role === "care") return t("roles.care");
    return role;
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await fetch("/api/me/profile");
      if (cancelled) return;
      if (!res.ok) {
        setLoadError(t("account.loadError"));
        return;
      }
      const data: unknown = await res.json();
      if (
        typeof data !== "object" ||
        data === null ||
        typeof (data as ProfilePayload).email !== "string" ||
        typeof (data as ProfilePayload).role !== "string"
      ) {
        setLoadError(t("account.loadError"));
        return;
      }
      const p = data as ProfilePayload;
      setProfile(p);
      setDisplayName(p.displayName ?? "");
      setPhone(p.phone ?? "");
      if (p.preferredLocale) {
        setLocale(p.preferredLocale);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [setLocale]);

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
    return t("account.requestFailed");
  }

  function validateForm(): string | null {
    if (displayName.trim().length > 200) {
      return t("account.displayNameTooLong");
    }
    if (phone.trim().length > 50) {
      return t("account.phoneTooLong");
    }
    return null;
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!profile) return;
    setFieldError(null);
    setMessage(null);
    const localErr = validateForm();
    if (localErr) {
      setFieldError(localErr);
      return;
    }
    setSaving(true);
    const res = await fetch("/api/me/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        displayName: displayName === "" ? null : displayName,
        phone: phone === "" ? null : phone,
      }),
    });
    setSaving(false);
    if (!res.ok) {
      setFieldError(await parseError(res));
      return;
    }
    const data: unknown = await res.json();
    if (
      typeof data !== "object" ||
      data === null ||
      typeof (data as ProfilePayload).email !== "string"
    ) {
      setFieldError(t("account.invalidResponse"));
      return;
    }
    const p = data as ProfilePayload;
    setProfile(p);
    setDisplayName(p.displayName ?? "");
    setPhone(p.phone ?? "");
    if (p.preferredLocale) {
      setLocale(p.preferredLocale);
    }
    setMessage(t("account.profileUpdated"));
  }

  return (
    <section className="rounded-xl border border-pine/20 bg-cream/90 p-5 shadow-[0_12px_40px_-24px_rgba(15,31,26,0.35)]">
      <h2 className="font-display text-lg font-normal text-pine-2">
        {t("account.yourProfile")}
      </h2>
      <p className="mt-1 text-xs text-ink/65">{t("account.profileHint")}</p>
      {loadError ? (
        <p className="mt-3 text-sm text-danger">{loadError}</p>
      ) : profile ? (
        <>
          <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="font-normal text-ink/70">{t("account.email")}</dt>
              <dd className="mt-0.5 font-medium text-ink">{profile.email}</dd>
            </div>
            <div>
              <dt className="font-normal text-ink/70">{t("account.role")}</dt>
              <dd className="mt-0.5 font-medium text-ink">
                {roleLabel(profile.role)}
              </dd>
            </div>
          </dl>
          <div className="mt-4">
            <LanguageSwitcher />
          </div>
          <form onSubmit={onSubmit} className="mt-4 space-y-3">
            <div className="grid gap-3 sm:grid-cols-2 sm:items-end">
              <label className="flex min-w-0 flex-col gap-1 text-sm font-medium text-pine">
                <span className="font-normal text-ink/70">
                  {t("account.displayName")}
                </span>
                <input
                  type="text"
                  className={inputClassName}
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  autoComplete="name"
                />
              </label>
              <label className="flex min-w-0 flex-col gap-1 text-sm font-medium text-pine">
                <span className="font-normal text-ink/70">
                  {t("account.phone")}
                </span>
                <input
                  type="tel"
                  className={inputClassName}
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  autoComplete="tel"
                />
              </label>
            </div>
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-pine px-4 py-2 text-sm font-bold uppercase tracking-wide text-cream shadow-md shadow-pine/30 transition hover:bg-pine-2 disabled:opacity-60"
            >
              {saving ? t("account.saving") : t("account.save")}
            </button>
          </form>
          {fieldError ? (
            <p className="mt-2 text-sm text-danger">{fieldError}</p>
          ) : null}
          {message ? (
            <p className="mt-2 text-sm text-success">{message}</p>
          ) : null}
        </>
      ) : (
        <p className="mt-3 text-sm text-ink/70">{t("account.loading")}</p>
      )}
    </section>
  );
}
