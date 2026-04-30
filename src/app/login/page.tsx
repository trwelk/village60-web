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
    <main className="relative isolate min-h-screen overflow-hidden bg-[var(--bg-canvas)] text-[var(--text-primary)]">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(900px_420px_at_-10%_-10%,color-mix(in_srgb,var(--accent)_20%,transparent),transparent_58%),radial-gradient(860px_420px_at_110%_0%,color-mix(in_srgb,var(--highlight)_18%,transparent),transparent_60%)]"
      />
      <div className="relative z-10 mx-auto flex min-h-screen max-w-6xl flex-col justify-center px-5 py-16 sm:px-8 lg:px-12">
        <div className="grid items-center gap-12 lg:grid-cols-12 lg:gap-10">
          <header className="relative lg:col-span-5">
            <p className="font-sans text-[0.72rem] font-bold uppercase tracking-[0.32em] text-[var(--accent-strong)]">
              Staff access
            </p>
            <h1 className="mt-4 font-sans text-[clamp(2.2rem,5vw,3.2rem)] font-semibold leading-tight text-[var(--text-primary)]">
              Village60 operations
            </h1>
            <p className="mt-5 max-w-md text-base leading-relaxed text-[var(--text-secondary)]">
              Sign in to manage residents, homes, analytics, and staff workflows.
            </p>
            <p className="mt-8 text-xs text-[var(--text-muted)]">
              Seeded administrator credentials are available in the README.
            </p>
          </header>

          <div className="relative lg:col-span-6 lg:col-start-7">
            <form
              onSubmit={onSubmit}
              className="relative rounded-3xl border border-[color:color-mix(in_srgb,var(--line-strong)_60%,transparent)] bg-[color:color-mix(in_srgb,var(--bg-elevated)_95%,transparent)] p-8 shadow-[var(--shadow-lg)] backdrop-blur sm:p-10"
            >
              <h2 className="text-2xl font-semibold text-[var(--text-primary)]">
                Sign in
              </h2>
              <p className="mt-2 text-sm text-[var(--text-secondary)]">
                Use your work email and password.
              </p>
              <div className="mt-8 flex flex-col gap-5">
                <label className="group flex flex-col gap-2 text-sm font-semibold text-[var(--text-secondary)]">
                  Email
                  <input
                    className="rounded-xl border border-[color:color-mix(in_srgb,var(--line-strong)_60%,transparent)] bg-[var(--bg-muted)] px-4 py-3 font-sans text-base text-[var(--text-primary)] transition placeholder:text-[color:color-mix(in_srgb,var(--text-muted)_58%,transparent)] focus:border-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-[color:color-mix(in_srgb,var(--accent)_28%,transparent)]"
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
                    className="rounded-xl border border-[color:color-mix(in_srgb,var(--line-strong)_60%,transparent)] bg-[var(--bg-muted)] px-4 py-3 font-sans text-base text-[var(--text-primary)] transition placeholder:text-[color:color-mix(in_srgb,var(--text-muted)_58%,transparent)] focus:border-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-[color:color-mix(in_srgb,var(--accent)_28%,transparent)]"
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
                  className="mt-2 rounded-xl bg-[var(--accent-strong)] px-4 py-3.5 text-sm font-bold uppercase tracking-[0.18em] text-white shadow-[0_18px_34px_-18px_color-mix(in_srgb,var(--accent-strong)_90%,transparent)] transition hover:bg-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-60"
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
