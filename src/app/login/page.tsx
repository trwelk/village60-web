"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);
    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Sign-in failed.");
        return;
      }
      router.push("/dashboard");
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="village-app-bg relative isolate min-h-screen overflow-hidden text-[var(--text-primary)]">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(900px_420px_at_-10%_-10%,color-mix(in_srgb,var(--accent)_20%,transparent),transparent_58%),radial-gradient(860px_420px_at_110%_0%,color-mix(in_srgb,var(--highlight)_18%,transparent),transparent_60%)]"
      />
      <div className="relative z-10 mx-auto flex min-h-screen max-w-6xl flex-col justify-center px-5 py-16 sm:px-8 lg:px-12">
        <div className="village-hero-card grid items-stretch gap-0 p-3 sm:p-4 lg:grid-cols-12">
          <header className="relative flex flex-col justify-between rounded-[1.35rem] px-5 py-7 sm:px-7 lg:col-span-5 lg:min-h-[34rem]">
            <div>
            <p className="village-kicker">
              Staff access
            </p>
            <h1 className="mt-5 font-display text-[clamp(2.4rem,5vw,4.25rem)] font-normal leading-[0.96] tracking-[-0.055em] text-[var(--text-primary)]">
              Village60 operations
            </h1>
            <p className="mt-6 max-w-md text-base leading-relaxed text-[var(--text-secondary)]">
              Sign in to manage residents, homes, analytics, and staff workflows.
            </p>
            </div>
            <div className="mt-10 grid gap-3 text-sm">
              {["Resident records", "Billing signals", "Care reminders"].map(
                (label) => (
                  <div
                    key={label}
                    className="rounded-2xl border border-[color:color-mix(in_srgb,var(--line-subtle)_75%,transparent)] bg-[color:color-mix(in_srgb,var(--bg-elevated)_58%,transparent)] px-4 py-3 text-[var(--text-secondary)] shadow-sm"
                  >
                    {label}
                  </div>
                ),
              )}
            </div>
            <p className="mt-8 text-xs text-[var(--text-muted)]">
              Seeded administrator credentials are available in the README.
            </p>
          </header>

          <div className="relative flex items-center p-2 sm:p-4 lg:col-span-7 lg:p-7">
            <form
              onSubmit={onSubmit}
              className="village-panel-card relative w-full overflow-hidden p-6 backdrop-blur sm:p-8 lg:p-10"
            >
              <div
                aria-hidden
                className="absolute right-0 top-0 h-32 w-32 rounded-bl-full bg-[color:color-mix(in_srgb,var(--accent)_10%,transparent)]"
              />
              <p className="village-kicker relative">Secure workspace</p>
              <h2 className="relative mt-3 font-display text-3xl font-normal tracking-[-0.04em] text-[var(--text-primary)]">
                Sign in
              </h2>
              <p className="relative mt-2 text-sm text-[var(--text-secondary)]">
                Use your work email and password.
              </p>
              <div className="mt-8 flex flex-col gap-5">
                <label className="group flex flex-col gap-2 text-sm font-semibold text-[var(--text-secondary)]">
                  Email
                  <input
                    className="village-input px-4 py-3 font-sans text-base"
                    type="email"
                    autoComplete="username"
                    placeholder="you@home.org"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </label>
                <label className="flex flex-col gap-2 text-sm font-semibold text-[var(--text-secondary)]">
                  Password
                  <input
                    className="village-input px-4 py-3 font-sans text-base"
                    type="password"
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                </label>
                {error ? (
                  <p
                    className="rounded-lg border border-[color:color-mix(in_srgb,var(--danger)_44%,transparent)] bg-[var(--bg-muted)] px-3 py-2 text-sm text-[var(--danger)]"
                    role="alert"
                  >
                    {error}
                  </p>
                ) : null}
                <button
                  type="submit"
                  disabled={pending}
                  className="village-btn-primary mt-2 min-h-12 w-full uppercase tracking-[0.18em] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {pending ? "Signing in..." : "Enter"}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </main>
  );
}
