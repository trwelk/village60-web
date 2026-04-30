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
    <main className="relative isolate min-h-screen overflow-hidden bg-paper text-ink">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 village-grain"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -left-32 top-0 h-[120%] w-[55%] -rotate-6 bg-gradient-to-br from-pine/12 via-transparent to-terracotta/10 village-shimmer"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -right-24 bottom-0 h-[70%] w-[45%] rotate-3 rounded-[3rem] border border-pine/15 bg-cream/80 shadow-[0_25px_80px_-20px_rgba(27,67,50,0.35)]"
      />
      <div className="relative z-10 mx-auto flex min-h-screen max-w-6xl flex-col justify-center px-5 py-16 sm:px-8 lg:px-12">
        <div className="grid items-center gap-12 lg:grid-cols-12 lg:gap-10">
          <header className="relative lg:col-span-5">
            <p className="village-reveal village-reveal-delay-1 font-sans text-[0.7rem] font-bold uppercase tracking-[0.35em] text-pine">
              Staff access
            </p>
            <h1 className="village-reveal village-reveal-delay-2 mt-4 font-display text-[clamp(2.5rem,6vw,3.75rem)] font-normal leading-[1.05] text-pine-2">
              Village
              <span className="block translate-x-1 text-terracotta">60</span>
            </h1>
            <p className="village-reveal village-reveal-delay-3 mt-6 max-w-md font-sans text-base leading-relaxed text-ink/80">
              A quiet threshold between the lobby and the ledger—sign in to
              continue resident care, homes, and rostered access.
            </p>
            <div
              aria-hidden
              className="village-reveal village-reveal-delay-4 mt-10 hidden h-px max-w-xs bg-gradient-to-r from-terracotta via-pine/40 to-transparent sm:block"
            />
            <p className="village-reveal village-reveal-delay-5 mt-6 font-mono text-xs text-sage">
              Seeded administrator credentials live in the project README.
            </p>
          </header>

          <div className="relative lg:col-span-6 lg:col-start-7">
            <div
              aria-hidden
              className="absolute -inset-1 rounded-[1.75rem] bg-gradient-to-br from-pine/20 via-transparent to-terracotta/25 opacity-80 blur-sm"
            />
            <form
              onSubmit={onSubmit}
              className="village-reveal village-reveal-delay-3 relative rounded-[1.5rem] border border-pine/20 bg-cream/95 p-8 shadow-[0_30px_60px_-28px_rgba(15,31,26,0.45)] backdrop-blur-sm sm:p-10"
            >
              <h2 className="font-display text-2xl text-pine-2">
                Sign in
              </h2>
              <p className="mt-2 text-sm text-ink/70">
                Use your work email and password.
              </p>
              <div className="mt-8 flex flex-col gap-5">
                <label className="group flex flex-col gap-2 text-sm font-semibold text-pine">
                  Email
                  <input
                    className="rounded-xl border border-pine/25 bg-paper px-4 py-3 font-sans text-base text-ink shadow-inner shadow-pine/5 transition placeholder:text-ink/35 focus:border-terracotta focus:outline-none focus:ring-2 focus:ring-terracotta/35"
                    type="email"
                    autoComplete="username"
                    placeholder="you@home.org"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </label>
                <label className="flex flex-col gap-2 text-sm font-semibold text-pine">
                  Password
                  <input
                    className="rounded-xl border border-pine/25 bg-paper px-4 py-3 font-sans text-base text-ink shadow-inner shadow-pine/5 transition placeholder:text-ink/35 focus:border-terracotta focus:outline-none focus:ring-2 focus:ring-terracotta/35"
                    type="password"
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                </label>
                {error ? (
                  <p
                    className="rounded-lg border border-danger/25 bg-paper px-3 py-2 text-sm text-danger"
                    role="alert"
                  >
                    {error}
                  </p>
                ) : null}
                <button
                  type="submit"
                  disabled={pending}
                  className="group relative mt-2 overflow-hidden rounded-xl bg-pine px-4 py-3.5 text-sm font-bold uppercase tracking-[0.2em] text-cream shadow-[0_14px_30px_-12px_rgba(27,67,50,0.75)] transition hover:bg-pine-2 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <span
                    aria-hidden
                    className="absolute inset-0 z-0 translate-y-full bg-gradient-to-t from-terracotta/90 to-terracotta-bright/80 transition duration-300 group-hover:translate-y-0 group-disabled:translate-y-full"
                  />
                  <span className="relative z-10">
                    {pending ? "Signing in…" : "Enter"}
                  </span>
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </main>
  );
}
