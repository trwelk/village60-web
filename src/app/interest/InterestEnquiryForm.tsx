"use client";

import { VillageSelect } from "@/components/VillageSelect";
import type { PublicInterestHomeOption } from "@/lib/homeInterestLeads/service";
import { useState } from "react";

type Props = {
  homes: PublicInterestHomeOption[];
};

export function InterestEnquiryForm({ homes }: Props) {
  const [homeId, setHomeId] = useState("");
  const [contactName, setContactName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [note, setNote] = useState("");
  const [consent, setConsent] = useState(false);
  const [website, setWebsite] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);

  const selectedHome = homes.find((x) => x.id === homeId);
  const locationText =
    !homeId || !selectedHome
      ? "Pick a home to see its address."
      : selectedHome.address?.trim()
        ? selectedHome.address
        : "Address will be confirmed when we respond.";

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!homeId.trim()) {
      setError("Please select a home.");
      return;
    }
    setPending(true);
    try {
      const res = await fetch("/api/interest/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          homeId,
          contactName,
          phone,
          email: email.trim() === "" ? null : email,
          note: note.trim() === "" ? null : note,
          consentAccepted: consent,
          website,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        ok?: boolean;
      };
      if (!res.ok) {
        setError(data.error ?? "Something went wrong.");
        return;
      }
      setDone(true);
    } finally {
      setPending(false);
    }
  }

  if (done) {
    return (
      <div
        className="village-hero-card relative overflow-hidden px-6 py-12 backdrop-blur sm:px-10 sm:py-14"
        role="status"
      >
        <div
          aria-hidden
          className="pointer-events-none absolute -right-16 top-0 h-48 w-48 rounded-full bg-[color:color-mix(in_srgb,var(--accent)_14%,transparent)] blur-2xl"
        />
        <div className="relative mx-auto max-w-lg text-center">
          <p className="village-kicker">Thank you</p>
          <h2 className="mt-4 font-display text-[clamp(1.75rem,3.2vw,2.5rem)] font-normal tracking-[-0.04em] text-[var(--text-primary)]">
            We&apos;ll be in touch
          </h2>
          <p className="mt-4 text-base leading-relaxed text-[var(--text-secondary)]">
            Thanks for registering your interest. Our team will follow up using
            the contact details you provided.
          </p>
        </div>
      </div>
    );
  }

  if (homes.length === 0) {
    return (
      <div className="village-hero-card relative overflow-hidden px-6 py-10 sm:px-10 sm:py-12">
        <p className="text-[var(--text-secondary)] leading-relaxed">
          No homes are accepting enquiries at the moment. Please check back
          later.
        </p>
      </div>
    );
  }

  return (
    <form
      onSubmit={onSubmit}
      className="village-hero-card relative isolate grid gap-0 overflow-hidden lg:grid-cols-2"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-y-12 left-1/2 z-0 hidden w-px -translate-x-1/2 bg-gradient-to-b from-transparent via-[color:color-mix(in_srgb,var(--line-subtle)_70%,transparent)] to-transparent lg:block"
      />

      {/* Story + placement — left */}
      <div className="relative z-[1] flex flex-col gap-8 px-5 py-8 sm:px-8 sm:py-10 lg:px-10 lg:py-11">
        <div>
          <p className="village-kicker">Families &amp; residents-to-be</p>
          <h1 className="mt-4 font-display text-[clamp(2rem,3.9vw,3.35rem)] font-normal leading-[0.98] tracking-[-0.055em] text-[var(--text-primary)]">
            Find your Village60 home
          </h1>
          <p className="mt-5 max-w-md text-[0.975rem] leading-relaxed text-[var(--text-secondary)]">
            Choose a location and leave your details — our team replies by
            phone or email. No staff login needed on your side.
          </p>
        </div>

        <div className="flex flex-col gap-4">
          <label className="group flex flex-col gap-2 text-sm font-semibold text-[var(--text-secondary)]">
            Home
            <VillageSelect
              className="w-full font-sans [&_.village-select-trigger]:px-4 [&_.village-select-trigger]:py-2.5 [&_.village-select-trigger]:text-base"
              value={homeId}
              onChange={setHomeId}
              placeholder="Select a home"
              ariaRequired
              options={homes.map((h) => ({ value: h.id, label: h.name }))}
            />
          </label>

          <div className="rounded-2xl border border-[color:color-mix(in_srgb,var(--line-subtle)_62%,transparent)] bg-[color:color-mix(in_srgb,var(--bg-elevated)_52%,transparent)] px-4 py-3 shadow-[inset_0_1px_0_color-mix(in_srgb,var(--bg-elevated)_80%,transparent)]">
            <p className="text-[0.7rem] font-extrabold uppercase tracking-[0.2em] text-[var(--accent-strong)]">
              Selected location
            </p>
            <p className="mt-2 text-sm leading-relaxed text-[var(--text-secondary)] whitespace-pre-wrap">
              {locationText}
            </p>
          </div>
        </div>

        <p className="mt-auto border-t border-[color:color-mix(in_srgb,var(--line-subtle)_55%,transparent)] pt-5 text-xs leading-relaxed text-[var(--text-muted)]">
          Plain-text addresses (no embedded map here) · Takes about a minute
        </p>
      </div>

      {/* Contact capture — right */}
      <div className="relative z-[1] p-4 sm:p-5 lg:flex lg:flex-col lg:justify-center lg:p-7 xl:p-9">
        <div
          aria-hidden
          className="pointer-events-none absolute right-6 top-6 h-24 w-24 rounded-bl-full bg-[color:color-mix(in_srgb,var(--accent)_10%,transparent)]"
        />

        <div className="village-panel-card relative flex min-h-full flex-col p-6 sm:p-7 lg:p-8">
          <p className="village-kicker relative">Enquiry</p>
          <h2 className="relative mt-3 font-display text-2xl font-normal tracking-[-0.038em] text-[var(--text-primary)] sm:text-[1.75rem]">
            Register your interest
          </h2>
          <p className="relative mt-2 text-sm leading-snug text-[var(--text-secondary)]">
            We&apos;ll reach out shortly after you send this.
          </p>

          <div className="relative mt-6 flex flex-col gap-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="flex flex-col gap-2 text-sm font-semibold text-[var(--text-secondary)]">
                Your name
                <input
                  className="village-input px-3.5 py-2.5 font-sans text-base"
                  value={contactName}
                  onChange={(e) => setContactName(e.target.value)}
                  required
                  autoComplete="name"
                />
              </label>
              <label className="flex flex-col gap-2 text-sm font-semibold text-[var(--text-secondary)]">
                Phone
                <input
                  className="village-input px-3.5 py-2.5 font-sans text-base"
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  required
                  autoComplete="tel"
                />
              </label>
            </div>

            <label className="flex flex-col gap-2 text-sm font-semibold text-[var(--text-secondary)]">
              Email{" "}
              <span className="font-normal opacity-75">(optional)</span>
              <input
                className="village-input px-3.5 py-2.5 font-sans text-base"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
              />
            </label>

            <label className="flex flex-col gap-2 text-sm font-semibold text-[var(--text-secondary)]">
              Note{" "}
              <span className="font-normal opacity-75">(optional)</span>
              <textarea
                className="village-input resize-y px-3.5 py-2.5 font-sans text-base leading-snug sm:max-h-[5.75rem]"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={3}
              />
            </label>

            <label className="flex cursor-pointer items-start gap-3 text-sm leading-snug text-[var(--text-secondary)]">
              <input
                type="checkbox"
                className="village-checkbox mt-0.5 shrink-0 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:color-mix(in_srgb,var(--accent)_50%,transparent)]"
                checked={consent}
                onChange={(e) => setConsent(e.target.checked)}
                required
              />
              <span>
                I agree my details may be used to respond to this enquiry.
              </span>
            </label>

            <div
              aria-hidden="true"
              className="pointer-events-none absolute left-[-9999px] top-0 opacity-0"
            >
              <label>
                Website
                <input
                  tabIndex={-1}
                  autoComplete="off"
                  value={website}
                  onChange={(e) => setWebsite(e.target.value)}
                />
              </label>
            </div>

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
              className="village-btn-primary mt-1 min-h-12 w-full uppercase tracking-[0.18em] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {pending ? "Sending…" : "Submit enquiry"}
            </button>
          </div>
        </div>
      </div>
    </form>
  );
}
