import type {
  PublicProfileAllergy,
  PublicProfileCondition,
  PublicProfileMedication,
} from "@/lib/residentPublicProfile/service";
import type { ReactNode } from "react";

type Props = {
  allergies: PublicProfileAllergy[];
  conditions: PublicProfileCondition[];
  medications: PublicProfileMedication[];
};

function formatDose(med: PublicProfileMedication): string {
  const qty = Number.isInteger(med.quantityPerServing)
    ? String(med.quantityPerServing)
    : med.quantityPerServing.toFixed(3).replace(/\.?0+$/, "");
  return `${qty} ${med.unit}`;
}

function AllergyIcon() {
  return (
    <svg
      aria-hidden
      className="h-3.5 w-3.5"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 9v4" />
      <path d="M12 17h.01" />
      <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
    </svg>
  );
}

function ConditionIcon() {
  return (
    <svg
      aria-hidden
      className="h-3.5 w-3.5"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" />
    </svg>
  );
}

function MedicationIcon() {
  return (
    <svg
      aria-hidden
      className="h-3.5 w-3.5"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m10.5 20.5 10-10a4.95 4.95 0 1 0-7-7l-10 10a4.95 4.95 0 1 0 7 7Z" />
      <path d="m8.5 8.5 7 7" />
    </svg>
  );
}

function SectionHeading({
  icon,
  tone,
  children,
}: {
  icon: ReactNode;
  tone: "allergy" | "condition" | "medication";
  children: string;
}) {
  return (
    <div className="village-public-profile-section-head">
      <span
        className={[
          "village-public-profile-section-icon",
          tone === "allergy"
            ? "village-public-profile-section-icon--allergy"
            : tone === "condition"
              ? "village-public-profile-section-icon--condition"
              : "village-public-profile-section-icon--medication",
        ].join(" ")}
      >
        {icon}
      </span>
      <h2 className="text-sm font-bold tracking-[0.04em] text-ink">{children}</h2>
    </div>
  );
}

function EmptyLine({ children }: { children: string }) {
  return (
    <p className="rounded-xl border border-dashed border-pine/12 bg-[color:color-mix(in_srgb,var(--bg-elevated)_88%,transparent)] px-3.5 py-2.5 text-sm italic text-ink/45">
      {children}
    </p>
  );
}

export function PublicProfileClinicalSections({
  allergies,
  conditions,
  medications,
}: Props) {
  const hasClinical =
    allergies.length > 0 ||
    conditions.length > 0 ||
    medications.length > 0;

  return (
    <section
      className="village-reveal village-reveal-delay-4 mt-9 w-full text-left"
      aria-label="Medical overview"
    >
      <div className="mb-5 flex items-center justify-center gap-3">
        <span
          aria-hidden
          className="h-px w-10 bg-[color:color-mix(in_srgb,var(--accent)_28%,transparent)]"
        />
        <p className="village-kicker text-[0.62rem] tracking-[0.22em]">
          Medical overview
        </p>
        <span
          aria-hidden
          className="h-px w-10 bg-[color:color-mix(in_srgb,var(--accent)_28%,transparent)]"
        />
      </div>

      <div className="village-public-profile-clinical px-4 py-5 sm:px-6 sm:py-6">
        {!hasClinical ? (
          <p className="text-center text-sm leading-relaxed text-ink/50">
            No allergies, conditions, or medications on file.
          </p>
        ) : (
          <div className="space-y-7">
            <div>
              <SectionHeading icon={<AllergyIcon />} tone="allergy">
                Allergies
              </SectionHeading>
              {allergies.length === 0 ? (
                <EmptyLine>None recorded</EmptyLine>
              ) : (
                <ul className="flex flex-col gap-2.5">
                  {allergies.map((allergy, index) => (
                    <li
                      key={index}
                      className="rounded-2xl border border-[color:color-mix(in_srgb,var(--danger)_22%,var(--line-subtle))] bg-[color:color-mix(in_srgb,var(--danger)_6%,var(--bg-elevated))] px-4 py-3.5 shadow-[inset_3px_0_0_color-mix(in_srgb,var(--danger)_55%,transparent),inset_0_1px_0_color-mix(in_srgb,var(--bg-elevated)_80%,transparent)]"
                    >
                      <p className="font-semibold text-[color:color-mix(in_srgb,var(--danger)_72%,var(--text-primary)_28%)]">
                        {allergy.allergen}
                      </p>
                      {allergy.notes ? (
                        <p className="mt-1.5 text-sm leading-relaxed text-ink/70">
                          {allergy.notes}
                        </p>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div>
              <SectionHeading icon={<ConditionIcon />} tone="condition">
                Conditions
              </SectionHeading>
              {conditions.length === 0 ? (
                <EmptyLine>None recorded</EmptyLine>
              ) : (
                <ul className="flex flex-wrap gap-2">
                  {conditions.map((condition, index) => (
                    <li
                      key={index}
                      className="rounded-full border border-[color:color-mix(in_srgb,var(--accent)_18%,var(--line-subtle))] bg-[color:color-mix(in_srgb,var(--accent)_7%,var(--bg-elevated))] px-3.5 py-1.5 text-sm font-semibold text-[color:color-mix(in_srgb,var(--accent-strong)_68%,var(--text-primary)_32%)] ring-1 ring-[color:color-mix(in_srgb,var(--accent)_12%,transparent)]"
                    >
                      {condition.label}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div>
              <SectionHeading icon={<MedicationIcon />} tone="medication">
                Medications
              </SectionHeading>
              {medications.length === 0 ? (
                <EmptyLine>None recorded</EmptyLine>
              ) : (
                <ul className="flex flex-col gap-3">
                  {medications.map((med, index) => (
                    <li
                      key={index}
                      className={[
                        "village-public-profile-med-card pl-[1.15rem] pr-4 py-4",
                        med.prn ? "village-public-profile-med-card--prn" : "",
                      ].join(" ")}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <p className="font-display text-[1.05rem] font-normal leading-snug tracking-[-0.02em] text-ink">
                          {med.name}
                        </p>
                        <span
                          className={[
                            "shrink-0 rounded-full px-2.5 py-0.5 text-[0.65rem] font-bold uppercase tracking-[0.1em]",
                            med.prn
                              ? "bg-[color:color-mix(in_srgb,var(--highlight)_16%,var(--bg-muted))] text-[color:color-mix(in_srgb,var(--accent-strong)_72%,var(--text-primary)_28%)] ring-1 ring-[color:color-mix(in_srgb,var(--accent)_24%,transparent)]"
                              : "bg-[color:color-mix(in_srgb,var(--accent)_8%,var(--bg-muted))] text-[color:color-mix(in_srgb,var(--accent-strong)_62%,var(--text-primary)_38%)] ring-1 ring-[color:color-mix(in_srgb,var(--accent)_16%,transparent)]",
                          ].join(" ")}
                        >
                          {med.prn ? "PRN" : "Scheduled"}
                        </span>
                      </div>
                      <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                        <span className="inline-flex items-center rounded-md bg-[color:color-mix(in_srgb,var(--bg-muted)_72%,var(--bg-elevated)_28%)] px-2 py-0.5 font-semibold text-ink/85 ring-1 ring-pine/10">
                          {formatDose(med)}
                        </span>
                        <span className="text-ink/30" aria-hidden>
                          ·
                        </span>
                        <span className="font-medium text-ink/60">
                          {med.scheduleLabel}
                        </span>
                      </div>
                      {med.directions ? (
                        <p className="mt-3 border-t border-pine/10 pt-3 text-sm leading-relaxed text-ink/65">
                          {med.directions}
                        </p>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
