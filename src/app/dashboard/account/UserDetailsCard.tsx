"use client";

import { useEffect, useState } from "react";

type ProfilePayload = {
  email: string;
  role: string;
  displayName: string | null;
  phone: string | null;
  avatarUrl: string | null;
};

function roleLabel(role: string): string {
  if (role === "admin") return "Admin";
  if (role === "care") return "Care";
  return role;
}

const inputClassName =
  "rounded-lg border border-pine/25 bg-paper px-3 py-2 text-ink shadow-inner shadow-pine/5 focus:border-terracotta focus:outline-none focus:ring-2 focus:ring-terracotta/30";

export function UserDetailsCard() {
  const [profile, setProfile] = useState<ProfilePayload | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [phone, setPhone] = useState("");
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await fetch("/api/me/profile");
      if (cancelled) return;
      if (!res.ok) {
        setLoadError("Could not load your profile.");
        return;
      }
      const data: unknown = await res.json();
      if (
        typeof data !== "object" ||
        data === null ||
        typeof (data as ProfilePayload).email !== "string" ||
        typeof (data as ProfilePayload).role !== "string"
      ) {
        setLoadError("Could not load your profile.");
        return;
      }
      const p = data as ProfilePayload;
      setProfile(p);
      setDisplayName(p.displayName ?? "");
      setPhone(p.phone ?? "");
    })();
    return () => {
      cancelled = true;
    };
  }, []);

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

  function validateForm(): string | null {
    if (displayName.trim().length > 200) {
      return "Display name is too long.";
    }
    if (phone.trim().length > 50) {
      return "Phone is too long.";
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
      setFieldError("Invalid response from server.");
      return;
    }
    const p = data as ProfilePayload;
    setProfile(p);
    setDisplayName(p.displayName ?? "");
    setPhone(p.phone ?? "");
    setMessage("Profile updated.");
  }

  return (
    <section className="rounded-xl border border-pine/20 bg-cream/90 p-5 shadow-[0_12px_40px_-24px_rgba(15,31,26,0.35)]">
      <h2 className="font-display text-lg font-normal text-pine-2">
        Your profile
      </h2>
      <p className="mt-1 text-xs text-ink/65">
        Your email and role are managed by the site. Update your display name
        and phone as needed.
      </p>
      {loadError ? (
        <p className="mt-3 text-sm text-danger">{loadError}</p>
      ) : profile ? (
        <>
          <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="font-normal text-ink/70">Email</dt>
              <dd className="mt-0.5 font-medium text-ink">{profile.email}</dd>
            </div>
            <div>
              <dt className="font-normal text-ink/70">Role</dt>
              <dd className="mt-0.5 font-medium text-ink">
                {roleLabel(profile.role)}
              </dd>
            </div>
          </dl>
          <form onSubmit={onSubmit} className="mt-4 space-y-3">
            <div className="grid gap-3 sm:grid-cols-2 sm:items-end">
              <label className="flex min-w-0 flex-col gap-1 text-sm font-medium text-pine">
                <span className="font-normal text-ink/70">Display name</span>
                <input
                  type="text"
                  className={inputClassName}
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  autoComplete="name"
                />
              </label>
              <label className="flex min-w-0 flex-col gap-1 text-sm font-medium text-pine">
                <span className="font-normal text-ink/70">Phone</span>
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
              {saving ? "Saving…" : "Save"}
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
        <p className="mt-3 text-sm text-ink/70">Loading…</p>
      )}
    </section>
  );
}
