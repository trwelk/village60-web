"use client";

import { useState } from "react";

export function ChangeOwnPasswordForm() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    const res = await fetch("/api/me/password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currentPassword, newPassword }),
    });
    if (!res.ok) {
      setError(await parseError(res));
      return;
    }
    setCurrentPassword("");
    setNewPassword("");
    setMessage("Password updated.");
  }

  return (
    <section className="rounded-xl border border-pine/20 bg-cream/90 p-5 shadow-[0_12px_40px_-24px_rgba(15,31,26,0.35)]">
      <h2 className="font-display text-lg font-normal text-pine-2">
        Change your password
      </h2>
      <p className="mt-1 text-xs text-ink/65">
        At least 12 characters with upper and lower case, a digit, and a
        symbol.
      </p>
      <form
        onSubmit={onSubmit}
        className="mt-3 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end"
      >
        <label className="flex min-w-[12rem] flex-1 flex-col gap-1 text-sm font-medium text-pine">
          <span className="font-normal text-ink/70">Current password</span>
          <input
            type="password"
            className="rounded-lg border border-pine/25 bg-paper px-3 py-2 text-ink shadow-inner shadow-pine/5 focus:border-terracotta focus:outline-none focus:ring-2 focus:ring-terracotta/30"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            required
            autoComplete="current-password"
          />
        </label>
        <label className="flex min-w-[12rem] flex-1 flex-col gap-1 text-sm font-medium text-pine">
          <span className="font-normal text-ink/70">New password</span>
          <input
            type="password"
            className="rounded-lg border border-pine/25 bg-paper px-3 py-2 text-ink shadow-inner shadow-pine/5 focus:border-terracotta focus:outline-none focus:ring-2 focus:ring-terracotta/30"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            required
            autoComplete="new-password"
          />
        </label>
        <button
          type="submit"
          className="rounded-lg bg-pine px-4 py-2 text-sm font-bold uppercase tracking-wide text-cream shadow-md shadow-pine/30 transition hover:bg-pine-2"
        >
          Update
        </button>
      </form>
      {error ? (
        <p className="mt-2 text-sm text-danger">{error}</p>
      ) : null}
      {message ? (
        <p className="mt-2 text-sm text-success">{message}</p>
      ) : null}
    </section>
  );
}
