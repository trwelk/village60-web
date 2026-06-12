import type {
  PublicProfileAllergy,
  PublicProfileCondition,
  PublicProfileMedication,
} from "@/lib/residentPublicProfile/service";

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
      className="h-4 w-4 shrink-0 text-[color:color-mix(in_srgb,var(--danger)_78%,var(--text-primary)_22%)]"
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

function EmptyLine({ children }: { children: string }) {
  return (
    <p className="text-sm italic text-ink/45">{children}</p>
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
      className="village-reveal village-reveal-delay-2 mt-8 w-full border-t border-pine/12 pt-8 text-left"
      aria-label="Medical overview"
    >
      <div className="flex items-center justify-center gap-2">
        <span
          aria-hidden
          className="h-px w-8 bg-[color:color-mix(in_srgb,var(--accent)_35%,transparent)]"
        />
        <p className="village-kicker text-[0.62rem] tracking-[0.22em]">
          Medical overview
        </p>
        <span
          aria-hidden
          className="h-px w-8 bg-[color:color-mix(in_srgb,var(--accent)_35%,transparent)]"
        />
      </div>

      {!hasClinical ? (
        <p className="mt-6 text-center text-sm text-ink/50">
          No allergies, conditions, or medications on file.
        </p>
      ) : (
        <div className="mt-6 space-y-6">
          <div>
            <div className="mb-3 flex items-center gap-2">
              <AllergyIcon />
              <h2 className="text-sm font-bold tracking-wide text-ink">
                Allergies
              </h2>
            </div>
            {allergies.length === 0 ? (
              <EmptyLine>None recorded</EmptyLine>
            ) : (
              <ul className="flex flex-col gap-2">
                {allergies.map((allergy, index) => (
                  <li
                    key={index}
                    className="rounded-2xl border border-[color:color-mix(in_srgb,var(--danger)_22%,var(--line-subtle))] bg-[color:color-mix(in_srgb,var(--danger)_6%,var(--bg-elevated))] px-4 py-3 shadow-[inset_0_1px_0_color-mix(in_srgb,var(--bg-elevated)_80%,transparent)]"
                  >
                    <p className="font-semibold text-[color:color-mix(in_srgb,var(--danger)_72%,var(--text-primary)_28%)]">
                      {allergy.allergen}
                    </p>
                    {allergy.notes ? (
                      <p className="mt-1 text-sm leading-relaxed text-ink/70">
                        {allergy.notes}
                      </p>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div>
            <h2 className="mb-3 text-sm font-bold tracking-wide text-ink">
              Conditions
            </h2>
            {conditions.length === 0 ? (
              <EmptyLine>None recorded</EmptyLine>
            ) : (
              <ul className="flex flex-wrap gap-2">
                {conditions.map((condition, index) => (
                  <li
                    key={index}
                    className="rounded-full border border-pine/18 bg-pine/8 px-3.5 py-1.5 text-sm font-medium text-pine-2 ring-1 ring-pine/10"
                  >
                    {condition.label}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div>
            <h2 className="mb-3 text-sm font-bold tracking-wide text-ink">
              Medications
            </h2>
            {medications.length === 0 ? (
              <EmptyLine>None recorded</EmptyLine>
            ) : (
              <ul className="flex flex-col gap-3">
                {medications.map((med, index) => (
                  <li
                    key={index}
                    className="village-panel-card px-4 py-3.5"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <p className="font-display text-base font-normal tracking-[-0.02em] text-ink">
                        {med.name}
                      </p>
                      <span
                        className={[
                          "shrink-0 rounded-full px-2.5 py-0.5 text-[0.68rem] font-bold uppercase tracking-[0.08em]",
                          med.prn
                            ? "bg-[color:color-mix(in_srgb,var(--highlight)_18%,var(--bg-muted))] text-[color:color-mix(in_srgb,var(--accent-strong)_70%,var(--text-primary)_30%)] ring-1 ring-[color:color-mix(in_srgb,var(--accent)_22%,transparent)]"
                            : "bg-cream-muted text-ink/65 ring-1 ring-pine/12",
                        ].join(" ")}
                      >
                        {med.prn ? "PRN" : "Scheduled"}
                      </span>
                    </div>
                    <p className="mt-2 text-sm font-medium text-ink/80">
                      {formatDose(med)}
                      <span className="mx-2 text-ink/25" aria-hidden>
                        ·
                      </span>
                      <span className="font-normal text-ink/60">
                        {med.scheduleLabel}
                      </span>
                    </p>
                    <p className="mt-2 text-sm leading-relaxed text-ink/65">
                      {med.directions}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
