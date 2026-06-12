import { getDb } from "@/db/client";
import { NotFoundError } from "@/lib/homes/errors";
import { calculateAge } from "@/lib/residents/age";
import { getResidentPublicProfile } from "@/lib/residentPublicProfile/service";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PublicProfileClinicalSections } from "./PublicProfileClinicalSections";

export const dynamic = "force-dynamic";

type PageParams = {
  params: Promise<{ token: string }>;
};

function residentInitials(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0]![0] ?? ""}${parts[1]![0] ?? ""}`.toUpperCase();
  }
  const one = parts[0] ?? "";
  return one.slice(0, 2).toUpperCase();
}

function portraitSrc(
  token: string,
  hasPortrait: boolean,
  portraitUpdatedAtUtcMs: number | null,
): string | null {
  if (!hasPortrait) return null;
  const base = `/api/public/residents/${token}/photo`;
  if (portraitUpdatedAtUtcMs != null) {
    return `${base}?v=${portraitUpdatedAtUtcMs}`;
  }
  return base;
}

function formatPublicDate(isoDate: string): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  if (!year || !month || !day) return isoDate;
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

function ProfileStat({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail?: string;
}) {
  return (
    <div className="village-public-profile-stat">
      <dt className="village-field-label">{label}</dt>
      <dd className="mt-1.5 text-[0.95rem] font-semibold leading-snug text-ink">
        {value}
        {detail ? (
          <span className="mt-0.5 block text-sm font-medium text-ink/55">
            {detail}
          </span>
        ) : null}
      </dd>
    </div>
  );
}

export async function generateMetadata({
  params,
}: PageParams): Promise<Metadata> {
  const { token } = await params;
  try {
    const profile = getResidentPublicProfile(getDb(), token);
    return {
      title: profile.fullName,
      description: `Resident profile at ${profile.homeName}.`,
    };
  } catch {
    return { title: "Resident profile" };
  }
}

export default async function ResidentPublicProfilePage({ params }: PageParams) {
  const { token } = await params;
  let profile;
  try {
    profile = getResidentPublicProfile(getDb(), token);
  } catch (e) {
    if (e instanceof NotFoundError) {
      notFound();
    }
    throw e;
  }

  const today = new Date().toISOString().slice(0, 10);
  const age = calculateAge(profile.dob, today);
  const imgSrc = portraitSrc(
    token,
    profile.hasPortrait,
    profile.portraitUpdatedAtUtcMs,
  );

  return (
    <main className="village-app-bg village-grain relative isolate min-h-screen overflow-hidden text-[var(--text-primary)]">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(900px_420px_at_-10%_-10%,color-mix(in_srgb,var(--accent)_20%,transparent),transparent_58%),radial-gradient(860px_420px_at_110%_0%,color-mix(in_srgb,var(--highlight)_18%,transparent),transparent_60%),radial-gradient(700px_400px_at_50%_115%,color-mix(in_srgb,var(--partner-green)_15%,transparent),transparent_52%)]"
      />
      <div className="relative z-10 mx-auto flex min-h-[100dvh] max-w-2xl flex-col justify-center px-5 py-10 sm:px-8 sm:py-12">
        <article className="village-hero-card village-public-profile-card village-reveal village-shimmer relative overflow-hidden px-6 py-9 backdrop-blur sm:px-10 sm:py-11">
          <div
            aria-hidden
            className="pointer-events-none absolute -right-20 -top-16 h-56 w-56 rounded-full bg-[color:color-mix(in_srgb,var(--accent)_16%,transparent)] blur-3xl"
          />
          <div
            aria-hidden
            className="pointer-events-none absolute -bottom-24 -left-16 h-48 w-48 rounded-full bg-[color:color-mix(in_srgb,var(--partner-green)_14%,transparent)] blur-3xl"
          />

          <header className="relative flex flex-col items-center text-center">
            <p className="village-kicker">{profile.homeName}</p>

            <div className="village-public-profile-portrait village-reveal village-reveal-delay-1 mt-7">
              {imgSrc ? (
                <img
                  src={imgSrc}
                  alt={`Portrait of ${profile.fullName}`}
                  className="relative h-40 w-40 rounded-[1.35rem] object-cover shadow-[0_18px_40px_-22px_color-mix(in_srgb,var(--text-primary)_35%,transparent)] sm:h-44 sm:w-44"
                  width={176}
                  height={176}
                />
              ) : (
                <div
                  className="relative flex h-40 w-40 items-center justify-center rounded-[1.35rem] bg-[linear-gradient(145deg,color-mix(in_srgb,var(--accent)_8%,var(--bg-muted)_92%),color-mix(in_srgb,var(--partner-green)_6%,var(--bg-elevated)_94%))] shadow-[0_18px_40px_-22px_color-mix(in_srgb,var(--text-primary)_35%,transparent)] sm:h-44 sm:w-44"
                  aria-label="No portrait"
                >
                  <span
                    className="font-display text-[clamp(2.5rem,6vw,3rem)] font-normal tracking-[-0.04em] text-ink/40"
                    aria-hidden
                  >
                    {residentInitials(profile.fullName)}
                  </span>
                </div>
              )}
            </div>

            <h1 className="village-reveal village-reveal-delay-2 mt-7 font-display text-[clamp(2rem,4.8vw,2.65rem)] font-normal leading-[1.02] tracking-[-0.045em] text-[var(--text-primary)]">
              {profile.fullName}
            </h1>

            {profile.status === "departed" ? (
              <span className="village-reveal village-reveal-delay-2 mt-4 inline-flex items-center rounded-full bg-cream-muted px-3.5 py-1 text-xs font-semibold text-ink/70 ring-1 ring-pine/15">
                Former resident
              </span>
            ) : (
              <p className="village-reveal village-reveal-delay-2 mt-3 max-w-sm text-sm leading-relaxed text-ink/55">
                A shared profile for family and care partners
              </p>
            )}
          </header>

          <dl className="village-reveal village-reveal-delay-3 mt-9 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <ProfileStat
              label="Date of birth"
              value={formatPublicDate(profile.dob)}
              detail={`Age ${age}`}
            />
            <ProfileStat
              label="Admitted"
              value={formatPublicDate(profile.admissionDate)}
            />
            {profile.wardLabel ? (
              <ProfileStat label="Ward" value={profile.wardLabel} />
            ) : null}
            {profile.roomText ? (
              <ProfileStat label="Room" value={profile.roomText} />
            ) : null}
          </dl>

          <PublicProfileClinicalSections
            allergies={profile.allergies}
            conditions={profile.conditions}
            medications={profile.medications}
          />

          <footer className="village-reveal village-reveal-delay-5 mt-10 border-t border-pine/10 pt-6 text-center">
            <p className="text-[0.68rem] font-bold uppercase tracking-[0.24em] text-ink/35">
              Village60
            </p>
          </footer>
        </article>
      </div>
    </main>
  );
}
