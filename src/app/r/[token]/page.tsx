import { getDb } from "@/db/client";
import { NotFoundError } from "@/lib/homes/errors";
import { calculateAge } from "@/lib/residents/age";
import { getResidentPublicProfile } from "@/lib/residentPublicProfile/service";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

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
    <main className="village-app-bg relative isolate min-h-screen overflow-hidden text-[var(--text-primary)]">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(900px_420px_at_-10%_-10%,color-mix(in_srgb,var(--accent)_20%,transparent),transparent_58%),radial-gradient(860px_420px_at_110%_0%,color-mix(in_srgb,var(--highlight)_18%,transparent),transparent_60%),radial-gradient(700px_400px_at_50%_115%,color-mix(in_srgb,var(--partner-green)_15%,transparent),transparent_52%)]"
      />
      <div className="relative z-10 mx-auto flex min-h-[100dvh] max-w-lg flex-col justify-center px-5 py-10 sm:px-8">
        <article className="village-hero-card relative overflow-hidden px-6 py-8 backdrop-blur sm:px-10 sm:py-10">
          <div
            aria-hidden
            className="pointer-events-none absolute -right-16 top-0 h-48 w-48 rounded-full bg-[color:color-mix(in_srgb,var(--accent)_14%,transparent)] blur-2xl"
          />
          <div className="relative flex flex-col items-center text-center">
            <p className="village-kicker">{profile.homeName}</p>

            <div className="mt-6">
              {imgSrc ? (
                <img
                  src={imgSrc}
                  alt={`Portrait of ${profile.fullName}`}
                  className="mx-auto h-36 w-36 rounded-3xl object-cover ring-2 ring-pine/15 shadow-lg"
                  width={144}
                  height={144}
                />
              ) : (
                <div
                  className="mx-auto flex h-36 w-36 items-center justify-center rounded-3xl bg-pine/8 text-pine-2 ring-2 ring-pine/15 shadow-lg"
                  aria-label="No portrait"
                >
                  <span
                    className="font-display text-4xl font-normal text-ink/45"
                    aria-hidden
                  >
                    {residentInitials(profile.fullName)}
                  </span>
                </div>
              )}
            </div>

            <h1 className="mt-6 font-display text-[clamp(1.75rem,4vw,2.25rem)] font-normal tracking-[-0.03em] text-[var(--text-primary)]">
              {profile.fullName}
            </h1>

            {profile.status === "departed" ? (
              <span className="mt-3 inline-flex items-center rounded-full bg-cream-muted px-3 py-1 text-xs font-semibold text-ink/70 ring-1 ring-pine/15">
                Former resident
              </span>
            ) : null}

            <dl className="mt-8 w-full space-y-4 border-t border-pine/12 pt-8 text-left text-sm">
              <div className="flex items-baseline justify-between gap-4">
                <dt className="village-field-label">Date of birth</dt>
                <dd className="font-medium text-ink">
                  {profile.dob}{" "}
                  <span className="text-ink/60">(age {age})</span>
                </dd>
              </div>
              <div className="flex items-baseline justify-between gap-4">
                <dt className="village-field-label">Admitted</dt>
                <dd className="font-medium text-ink">{profile.admissionDate}</dd>
              </div>
              {profile.wardLabel ? (
                <div className="flex items-baseline justify-between gap-4">
                  <dt className="village-field-label">Ward</dt>
                  <dd className="font-medium text-ink">{profile.wardLabel}</dd>
                </div>
              ) : null}
              {profile.roomText ? (
                <div className="flex items-baseline justify-between gap-4">
                  <dt className="village-field-label">Room</dt>
                  <dd className="font-medium text-ink">{profile.roomText}</dd>
                </div>
              ) : null}
            </dl>
          </div>
        </article>
      </div>
    </main>
  );
}
