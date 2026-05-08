"use client";

import { LocalTime } from "@/components/LocalTime";
import { VillageSelect } from "@/components/VillageSelect";
import type { ResidentPublic } from "@/lib/residents/service";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { DepartResidentModal } from "./DepartResidentModal";

type WardOption = { id: string; label: string };

type ResidentInitial = ResidentPublic;

type Props = {
  homeId: string;
  homeName: string;
  wards: WardOption[];
  mode: "create" | "edit";
  initial?: ResidentInitial;
  careStaffOptions?: { id: string; email: string }[];
  /** When provided in create mode, Close uses this instead of navigating away */
  onCloseCreate?: () => void;
};

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

const fieldLabelClass = "flex flex-col gap-1.5 text-sm";
const fieldTextClass = "village-field-label";
const inputClass = "village-input w-full";
const subsectionTitleClass =
  "text-sm font-semibold uppercase tracking-[0.18em] text-pine/75";
const wizardSteps = [
  { id: "home", label: "Ward" },
  { id: "demographics", label: "Demographics" },
  { id: "contacts", label: "NOK/POA" },
  { id: "clinical", label: "Clinical" },
  { id: "done", label: "Done" },
] as const;

type CreateWizardStep = (typeof wizardSteps)[number]["id"];

const stepIndexById: Record<CreateWizardStep, number> = {
  home: 0,
  demographics: 1,
  contacts: 2,
  clinical: 3,
  done: 4,
};

function splitLines(raw: string): string[] {
  return raw
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}


export function ResidentEditor({
  homeId,
  homeName,
  wards,
  mode,
  initial,
  careStaffOptions = [],
  onCloseCreate,
}: Props) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [fullName, setFullName] = useState(initial?.fullName ?? "");
  const [dob, setDob] = useState(initial?.dob ?? "");
  const [admissionDate, setAdmissionDate] = useState(
    initial?.admissionDate ?? "",
  );
  const [wardId, setWardId] = useState(initial?.wardId ?? "");
  const [roomText, setRoomText] = useState(initial?.roomText ?? "");
  const [departOpen, setDepartOpen] = useState(false);
  const [regAmount, setRegAmount] = useState("0");
  const [regReceived, setRegReceived] = useState(false);
  const [regPaidOn, setRegPaidOn] = useState("");
  const [depAmount, setDepAmount] = useState("0");
  const [depReceived, setDepReceived] = useState(false);
  const [depPaidOn, setDepPaidOn] = useState("");
  const [nokName, setNokName] = useState(initial?.nokName ?? "");
  const [nokContact, setNokContact] = useState(initial?.nokContact ?? "");
  const [nokRelationship, setNokRelationship] = useState(
    initial?.nokRelationship ?? "",
  );
  const [poaSameAsNok, setPoaSameAsNok] = useState(
    initial?.poaSameAsNok ?? false,
  );
  const [poaName, setPoaName] = useState(initial?.poaName ?? "");
  const [poaContact, setPoaContact] = useState(initial?.poaContact ?? "");
  const [poaRelationship, setPoaRelationship] = useState(
    initial?.poaRelationship ?? "",
  );
  const [assignedNurseUserId, setAssignedNurseUserId] = useState(
    initial?.assignedNurseUserId ?? "",
  );
  const [assignedNurseDisplayOverride, setAssignedNurseDisplayOverride] =
    useState(initial?.assignedNurseDisplayOverride ?? "");
  const [clinicalAllergiesText, setClinicalAllergiesText] = useState("");
  const [clinicalConditionsText, setClinicalConditionsText] = useState("");
  const [createStep, setCreateStep] = useState<CreateWizardStep>("home");
  const [createSubmitting, setCreateSubmitting] = useState(false);

  const isCreateMode = mode === "create";
  const isCreateModal = isCreateMode && !!onCloseCreate;
  const isDeparted = mode === "edit" && initial?.status === "departed";
  const createStepIndex = stepIndexById[createStep];

  const selectedWardLabel =
    wardId.trim() === ""
      ? null
      : (wards.find((w) => w.id === wardId)?.label ?? null);
  const selectedNurseLabel =
    assignedNurseUserId.trim() === ""
      ? null
      : (careStaffOptions.find((u) => u.id === assignedNurseUserId)?.email ??
        null);
  const residentStatusLabel =
    mode === "edit" && initial
      ? initial.status === "departed"
        ? "Departed record"
        : "Active resident"
      : "New admission";
  const placementLabel = [
    selectedWardLabel,
    roomText.trim() ? `Room ${roomText.trim()}` : null,
  ]
    .filter(Boolean)
    .join(" / ");

  useEffect(() => {
    if (!isCreateModal) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [isCreateModal]);

  function handleCloseCreate() {
    if (onCloseCreate) {
      onCloseCreate();
      return;
    }
    router.push(`/dashboard/homes/${homeId}/residents`);
  }

  function validationMessageForStep(step: CreateWizardStep): string | null {
    if (step === "home") {
      if (wards.length === 0) {
        return "This home has no wards. Add a ward before admitting a resident.";
      }
      if (!wardId.trim()) return "Select a ward before continuing.";
    }
    if (step === "contacts") {
      if (!nokName.trim()) return "Next of kin name is required.";
      if (!nokContact.trim()) return "Next of kin contact is required.";
      if (!nokRelationship.trim()) {
        return "Next of kin relationship is required.";
      }
    }
    if (step === "demographics") {
      if (!fullName.trim()) return "Full name is required.";
      if (!dob) return "Date of birth is required.";
      if (!admissionDate) return "Admission date is required.";
    }
    return null;
  }

  function isStepComplete(step: CreateWizardStep): boolean {
    if (step === "home") {
      return !validationMessageForStep("home");
    }
    if (step === "demographics") {
      return !validationMessageForStep("demographics");
    }
    if (step === "contacts") {
      return !validationMessageForStep("contacts");
    }
    return true;
  }

  function goNextStep() {
    const err = validationMessageForStep(createStep);
    if (err) {
      setError(err);
      return;
    }
    setError(null);
    if (createStepIndex < wizardSteps.length - 1) {
      setCreateStep(wizardSteps[createStepIndex + 1].id);
    }
  }

  function goPreviousStep() {
    setError(null);
    if (createStepIndex > 0) {
      setCreateStep(wizardSteps[createStepIndex - 1].id);
    }
  }

  function goToStep(step: CreateWizardStep) {
    const targetIndex = stepIndexById[step];
    if (targetIndex <= createStepIndex) {
      setCreateStep(step);
      return;
    }
    const priorSteps = wizardSteps.slice(0, targetIndex);
    const blocked = priorSteps.some((s) => !isStepComplete(s.id));
    if (!blocked) {
      setCreateStep(step);
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (mode === "create") {
      if (createStep !== "done") {
        goNextStep();
        return;
      }
      const stepError =
        validationMessageForStep("home") ??
        validationMessageForStep("contacts") ??
        validationMessageForStep("demographics") ??
        validationMessageForStep("clinical");
      if (stepError) {
        setError(stepError);
        return;
      }
      setCreateSubmitting(true);
      const regMinor = Number.parseInt(regAmount, 10);
      const depMinor = Number.parseInt(depAmount, 10);
      if (
        Number.isNaN(regMinor) ||
        regMinor < 0 ||
        Number.isNaN(depMinor) ||
        depMinor < 0
      ) {
        setCreateSubmitting(false);
        setError(
          "Registration and deposit amounts must be non-negative integers (minor units).",
        );
        return;
      }
      const registration: Record<string, unknown> = {
        amountMinor: regMinor,
        received: regReceived,
      };
      if (regReceived && regPaidOn.trim() !== "") {
        registration.paidOn = regPaidOn.trim();
      }
      const deposit: Record<string, unknown> = {
        amountMinor: depMinor,
        received: depReceived,
      };
      if (depReceived && depPaidOn.trim() !== "") {
        deposit.paidOn = depPaidOn.trim();
      }
      const res = await fetch(`/api/homes/${homeId}/residents`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName,
          dob,
          admissionDate,
          wardId: wardId.trim(),
          roomText: roomText || null,
          nokName: nokName.trim(),
          nokContact: nokContact.trim(),
          nokRelationship: nokRelationship.trim(),
          poaSameAsNok,
          poaName: poaSameAsNok ? null : poaName || null,
          poaContact: poaSameAsNok ? null : poaContact || null,
          poaRelationship: poaSameAsNok ? null : poaRelationship || null,
          assignedNurseUserId: assignedNurseUserId || null,
          assignedNurseDisplayOverride: assignedNurseDisplayOverride || null,
          otherCharges: { registration, deposit },
        }),
      });
      if (!res.ok) {
        setCreateSubmitting(false);
        setError(await parseError(res));
        return;
      }
      const data: unknown = await res.json();
      const id =
        typeof data === "object" &&
        data !== null &&
        "resident" in data &&
        typeof (data as { resident: unknown }).resident === "object" &&
        (data as { resident: unknown }).resident !== null &&
        "id" in (data as { resident: { id?: unknown } }).resident &&
        typeof (data as { resident: { id: unknown } }).resident.id === "string"
          ? (data as { resident: { id: string } }).resident.id.trim() || null
          : null;
      if (!id) {
        setCreateSubmitting(false);
        setError(
          "The server created the resident but did not return an id. Refresh the directory and open the new record if it appears.",
        );
        return;
      }
      const allergies = splitLines(clinicalAllergiesText);
      const conditions = splitLines(clinicalConditionsText);
      const followUps: Promise<Response>[] = [];
      for (const allergen of allergies) {
        followUps.push(
          fetch(`/api/homes/${homeId}/residents/${id}/clinical/allergies`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ allergen }),
          }),
        );
      }
      for (const label of conditions) {
        followUps.push(
          fetch(`/api/homes/${homeId}/residents/${id}/clinical/conditions`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ label }),
          }),
        );
      }
      if (followUps.length > 0) {
        const followUpResponses = await Promise.all(followUps);
        const failed = followUpResponses.find((r) => !r.ok);
        if (failed) {
          setCreateSubmitting(false);
          setError(
            "Resident was created, but one or more clinical items failed to save. Use Manage medications and the Clinical tabs to add them.",
          );
          router.push(`/dashboard/homes/${homeId}/residents/${id}`);
          router.refresh();
          return;
        }
      }
      setCreateSubmitting(false);
      router.push(`/dashboard/homes/${homeId}/residents/${id}`);
      router.refresh();
      return;
    }

    if (!initial) {
      return;
    }

    const patchBody: Record<string, unknown> = {
      fullName,
      dob,
      admissionDate,
      wardId: isDeparted ? null : wardId || null,
      roomText: isDeparted ? null : roomText || null,
      nokName,
      nokContact,
      nokRelationship,
      poaSameAsNok,
      poaName: poaSameAsNok ? null : poaName,
      poaContact: poaSameAsNok ? null : poaContact,
      poaRelationship: poaSameAsNok ? null : poaRelationship,
      assignedNurseUserId: assignedNurseUserId || null,
      assignedNurseDisplayOverride: assignedNurseDisplayOverride.trim()
        ? assignedNurseDisplayOverride.trim()
        : null,
    };

    const res = await fetch(`/api/homes/${homeId}/residents/${initial.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patchBody),
    });
    if (!res.ok) {
      setError(await parseError(res));
      return;
    }
    router.refresh();
  }

  const rendered = (
    <main
      className={[
        "flex flex-col gap-8 text-ink",
        isCreateModal
          ? "min-h-0 max-sm:min-h-0 sm:min-h-[70vh]"
          : isCreateMode
            ? "mx-auto w-full min-w-0 max-w-none"
            : "mx-auto w-full max-w-5xl",
      ].join(" ")}
    >
      {mode === "edit" ? (
        <header className="village-card village-reveal overflow-hidden p-0">
          <div className="relative isolate px-5 py-6 sm:px-7">
            <div
              aria-hidden
              className="absolute inset-y-0 right-0 -z-10 w-2/3 bg-[radial-gradient(circle_at_top_right,color-mix(in_srgb,var(--accent)_18%,transparent),transparent_58%)]"
            />
            <div
              aria-hidden
              className="absolute bottom-0 left-0 right-0 -z-10 h-px bg-[linear-gradient(90deg,transparent,color-mix(in_srgb,var(--accent)_36%,transparent),transparent)]"
            />
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-[0.7rem] font-bold uppercase tracking-[0.22em] text-[var(--accent-strong)]">
                  {residentStatusLabel}
                </p>
                <h1 className="mt-2 font-display text-3xl font-normal tracking-[-0.04em] text-[var(--text-primary)] sm:text-4xl">
                  {initial?.fullName || "Resident"}
                </h1>
                <p className="mt-2 max-w-2xl text-sm text-[var(--text-secondary)]">
                  {homeName}
                </p>
              </div>
            {initial && initial.status === "active" ? (
              <button
                type="button"
                onClick={() => setDepartOpen(true)}
                className="rounded-full border border-[color:color-mix(in_srgb,var(--danger)_38%,var(--line-strong))] bg-[color:color-mix(in_srgb,var(--danger)_6%,var(--bg-elevated)_94%)] px-4 py-2 text-sm font-semibold text-[var(--danger)] shadow-sm transition hover:bg-[color:color-mix(in_srgb,var(--danger)_10%,var(--bg-elevated)_90%)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:color-mix(in_srgb,var(--danger)_35%,transparent)]"
              >
                Depart
              </button>
            ) : null}
          </div>
          <div className="mt-5 grid gap-2 text-sm sm:grid-cols-3">
            <div className="rounded-2xl border border-[color:color-mix(in_srgb,var(--line-subtle)_80%,transparent)] bg-[color:color-mix(in_srgb,var(--bg-elevated)_74%,transparent)] px-3 py-2">
              <span className="village-field-label block">Placement</span>
              <span className="mt-1 block font-semibold text-[var(--text-primary)]">
                {placementLabel || "Unassigned"}
              </span>
            </div>
            <div className="rounded-2xl border border-[color:color-mix(in_srgb,var(--line-subtle)_80%,transparent)] bg-[color:color-mix(in_srgb,var(--bg-elevated)_74%,transparent)] px-3 py-2">
              <span className="village-field-label block">Admission</span>
              <span className="mt-1 block font-semibold text-[var(--text-primary)]">
                {admissionDate || "Not set"}
              </span>
            </div>
            <div className="rounded-2xl border border-[color:color-mix(in_srgb,var(--line-subtle)_80%,transparent)] bg-[color:color-mix(in_srgb,var(--bg-elevated)_74%,transparent)] px-3 py-2">
              <span className="village-field-label block">Care contact</span>
              <span className="mt-1 block truncate font-semibold text-[var(--text-primary)]">
                {selectedNurseLabel || assignedNurseDisplayOverride || "Not assigned"}
              </span>
            </div>
          </div>
          <div className="mt-5 flex flex-wrap gap-4 border-t border-[color:color-mix(in_srgb,var(--line-subtle)_78%,transparent)] pt-4 text-sm">
            <Link
              href={`/dashboard/homes/${homeId}/residents`}
              className="village-link-subtle"
            >
              Residents at this home
            </Link>
            <Link href="/dashboard/residents" className="village-link-subtle">
              Full directory
            </Link>
          </div>
          </div>
        </header>
      ) : null}

      {error ? (
        <p className="village-alert-error village-reveal village-reveal-delay-1">
          {error}
        </p>
      ) : null}

      {mode === "edit" && initial ? (
        <LocalTime
          utcMs={initial.updatedAtUtcMs}
          label="Last updated (your local time):"
        />
      ) : null}

      {isCreateModal ? (
        <div
          aria-hidden
          className="fixed inset-0 z-40 bg-[color:color-mix(in_srgb,var(--bg-canvas)_34%,var(--text-primary)_66%)] backdrop-blur-[3px]"
        />
      ) : null}

      <form
        onSubmit={onSubmit}
        className={[
          "village-card flex flex-col gap-6 p-5 sm:p-6",
          !isCreateMode ? "village-reveal village-reveal-delay-2" : "",
          isCreateMode && !isCreateModal ? "overflow-hidden p-0 sm:p-0" : "",
          isCreateModal
            ? [
                "fixed z-50 flex min-h-0 w-full flex-col gap-0 overflow-hidden border border-[color:color-mix(in_srgb,var(--accent)_28%,var(--line-strong))] bg-[linear-gradient(180deg,var(--bg-elevated)_0%,var(--bg-elevated)_58%,color-mix(in_srgb,var(--accent)_5%,var(--bg-elevated))_100%)] p-0 pt-[env(safe-area-inset-top,0px)] shadow-[0_40px_120px_-48px_color-mix(in_srgb,var(--text-primary)_72%,transparent)] max-sm:inset-x-0 max-sm:bottom-0 max-sm:left-0 max-sm:right-0 max-sm:top-0 max-sm:h-[100dvh] max-sm:max-h-[100dvh] max-sm:rounded-none",
                "sm:left-1/2 sm:top-1/2 sm:h-auto sm:max-h-[min(92dvh,880px)] sm:w-[calc(100%-2rem)] sm:max-w-[min(44rem,92vw)] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-[var(--radius-xl)] sm:pt-0 md:w-[min(44rem,92vw)]",
                "touch-manipulation",
              ].join(" ")
            : "",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        {mode === "create" ? (
          <div className="relative overflow-hidden rounded-t-[var(--radius-xl)] border-b border-[color:color-mix(in_srgb,var(--accent)_18%,var(--line-subtle))] bg-[linear-gradient(135deg,color-mix(in_srgb,var(--accent)_14%,var(--bg-elevated)),var(--bg-elevated)_48%,color-mix(in_srgb,var(--accent)_8%,var(--bg-elevated)))] px-4 py-4 sm:px-6 sm:py-5">
            <div
              aria-hidden
              className="absolute inset-y-0 right-0 w-1/2 bg-[radial-gradient(circle_at_top_right,color-mix(in_srgb,var(--accent)_18%,transparent),transparent_55%)]"
            />
            <div className="relative flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1 pr-2">
                <p className="text-[0.68rem] font-bold uppercase tracking-[0.2em] text-[var(--accent)]">
                  Guided admission
                </p>
                <h2 className="mt-1 font-display text-xl font-semibold tracking-tight text-[var(--text-primary)] sm:text-2xl">
                  New resident
                </h2>
                <p className="mt-1 text-sm text-[var(--text-secondary)]">
                  {homeName}
                </p>
              </div>
              <button
                type="button"
                onClick={handleCloseCreate}
                className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-full border border-[color:color-mix(in_srgb,var(--accent)_22%,var(--line-strong))] bg-[color:color-mix(in_srgb,var(--bg-elevated)_90%,transparent)] px-4 text-sm font-semibold text-[var(--text-secondary)] shadow-sm transition hover:border-[var(--accent)] hover:text-[var(--accent)]"
              >
                Close
              </button>
            </div>
            <div className="relative mt-5 h-1.5 overflow-hidden rounded-full bg-[color:color-mix(in_srgb,var(--accent)_10%,var(--line-subtle))]">
              <div
                className="h-full rounded-full bg-[var(--accent)] transition-[width] duration-200"
                style={{
                  width: `${((createStepIndex + 1) / wizardSteps.length) * 100}%`,
                }}
              />
            </div>
            <div className="relative mt-3 flex items-center justify-between gap-3">
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-[var(--accent)]">
                Step {createStepIndex + 1} of {wizardSteps.length}
              </p>
              <p className="hidden text-xs text-[var(--text-muted)] sm:block">
                {wizardSteps[createStepIndex].label}
              </p>
            </div>
            <ol className="relative mt-3 flex max-sm:-mx-1 max-sm:snap-x max-sm:snap-mandatory max-sm:gap-2 max-sm:overflow-x-auto max-sm:overflow-y-hidden max-sm:px-1 max-sm:pb-2 max-sm:[-webkit-overflow-scrolling:touch] sm:mt-4 sm:grid sm:grid-cols-5 sm:gap-2 sm:overflow-visible sm:px-0 sm:pb-0">
              {wizardSteps.map((step, index) => {
                const active = step.id === createStep;
                const complete = index < createStepIndex && isStepComplete(step.id);
                return (
                  <li
                    key={step.id}
                    className="max-sm:w-[min(42vw,11rem)] max-sm:shrink-0 max-sm:snap-start sm:w-auto"
                  >
                    <button
                      type="button"
                      onClick={() => goToStep(step.id)}
                      className={[
                        "w-full rounded-2xl border px-3 py-2.5 text-left text-sm shadow-sm transition max-sm:min-h-[3.25rem] sm:min-h-0",
                        active
                          ? "border-[var(--accent)] bg-[var(--accent)] text-[var(--bg-elevated)] shadow-[0_12px_26px_-18px_var(--accent)]"
                          : complete
                            ? "border-[color:color-mix(in_srgb,var(--accent)_35%,var(--line-subtle))] bg-[color:color-mix(in_srgb,var(--accent)_8%,var(--bg-elevated))] text-[var(--text-primary)] hover:border-[var(--accent)]"
                            : "border-[color:color-mix(in_srgb,var(--line-subtle)_82%,transparent)] bg-[color:color-mix(in_srgb,var(--bg-elevated)_74%,transparent)] text-[var(--text-muted)] hover:border-[color:color-mix(in_srgb,var(--accent)_32%,var(--line-subtle))]",
                      ].join(" ")}
                    >
                      <span
                        className={[
                          "block text-[0.68rem] uppercase tracking-[0.14em]",
                          active
                            ? "text-[color:color-mix(in_srgb,var(--bg-elevated)_72%,transparent)]"
                            : "text-[var(--text-muted)]",
                        ].join(" ")}
                      >
                        {index + 1}
                      </span>
                      <span className="mt-0.5 block font-medium">{step.label}</span>
                    </button>
                  </li>
                );
              })}
            </ol>
          </div>
        ) : null}
        <div
            className={
              mode === "create"
                ? "flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
                : "contents"
            }
        >
          <div
            className={
              mode === "create"
                ? "flex min-h-0 min-w-0 flex-1 flex-col gap-6 overflow-y-auto overscroll-y-contain sm:[scrollbar-gutter:stable]"
                : "contents"
            }
          >
        {mode === "edit" || (mode === "create" && createStep === "home") ? (
        <div className={mode === "create" ? "px-5 sm:px-6" : ""}>
          <h2 className="village-section-title">
            {mode === "create" ? "Placement" : "Profile details"}
          </h2>
          <p className="village-muted mt-1">
            {mode === "create"
              ? "Ward is required for admission. Room is optional—you can refine placement later."
              : "Capture the details care and billing teams need to place this resident correctly."}
          </p>
        </div>
        ) : null}

        <div
          className={[
            "grid gap-4 md:grid-cols-2",
            mode === "create" ? "px-5 sm:px-6" : "",
            mode === "create" && createStep !== "home" ? "hidden" : "",
          ]
            .filter(Boolean)
            .join(" ")}
        >
          {mode === "create" ? (
            <div className="md:col-span-2 rounded-2xl border border-[color:color-mix(in_srgb,var(--accent)_18%,var(--line-subtle))] bg-[color:color-mix(in_srgb,var(--accent)_5%,var(--bg-elevated))] p-3 text-sm text-ink/80">
              Home is fixed for this onboarding: <strong>{homeName}</strong>.
            </div>
          ) : null}
          {mode === "create" ? null : (
            <label className={`${fieldLabelClass} md:col-span-2`}>
              <span className={fieldTextClass}>Full name</span>
              <input
                className={inputClass}
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                required
                autoComplete="name"
              />
            </label>
          )}
          {mode === "create" ? null : (
            <>
              <label className={fieldLabelClass}>
                <span className={fieldTextClass}>Date of birth</span>
                <input
                  type="date"
                  className={inputClass}
                  value={dob}
                  onChange={(e) => setDob(e.target.value)}
                  required
                />
              </label>
              <label className={fieldLabelClass}>
                <span className={fieldTextClass}>Admission date</span>
                <input
                  type="date"
                  className={inputClass}
                  value={admissionDate}
                  onChange={(e) => setAdmissionDate(e.target.value)}
                  required
                />
              </label>
            </>
          )}
          {mode === "create" ? null : isDeparted ? (
            <p className="village-muted md:col-span-2">
              Ward and room were cleared when this resident departed.
            </p>
          ) : (
            <>
              <label className={fieldLabelClass}>
                <span className={fieldTextClass}>Ward (optional)</span>
                <VillageSelect
                  className="w-full"
                  value={wardId}
                  onChange={setWardId}
                  options={[
                    { value: "", label: "—" },
                    ...wards.map((w) => ({ value: w.id, label: w.label })),
                  ]}
                />
              </label>
              <label className={fieldLabelClass}>
                <span className={fieldTextClass}>Room / bed (optional)</span>
                <input
                  className={inputClass}
                  value={roomText}
                  onChange={(e) => setRoomText(e.target.value)}
                  autoComplete="off"
                />
              </label>
            </>
          )}
          {mode === "create" ? (
            <>
              <label className={fieldLabelClass}>
                <span className={fieldTextClass}>Ward</span>
                <VillageSelect
                  className="w-full"
                  value={wardId}
                  onChange={setWardId}
                  disabled={wards.length === 0}
                  ariaRequired={createStep === "home"}
                  options={[
                    { value: "", label: "Select ward…" },
                    ...wards.map((w) => ({ value: w.id, label: w.label })),
                  ]}
                />
              </label>
              <label className={fieldLabelClass}>
                <span className={fieldTextClass}>Room / bed (optional)</span>
                <input
                  className={inputClass}
                  value={roomText}
                  onChange={(e) => setRoomText(e.target.value)}
                  autoComplete="off"
                />
              </label>
            </>
          ) : null}
        </div>

        {mode === "create" ? (
          <section
            className={[
              "px-5 sm:px-6",
              createStep === "demographics" ? "" : "hidden",
            ].join(" ")}
          >
            <h2 className="village-section-title">Demographics</h2>
            <p className="village-muted mt-1">
              Capture resident identity and admission date before adding contacts.
            </p>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <label className={`${fieldLabelClass} md:col-span-2`}>
                <span className={fieldTextClass}>Full name</span>
                <input
                  className={inputClass}
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  required={createStep === "demographics"}
                  autoComplete="name"
                />
              </label>
              <label className={fieldLabelClass}>
                <span className={fieldTextClass}>Date of birth</span>
                <input
                  type="date"
                  className={inputClass}
                  value={dob}
                  onChange={(e) => setDob(e.target.value)}
                  required={createStep === "demographics"}
                />
              </label>
              <label className={fieldLabelClass}>
                <span className={fieldTextClass}>Admission date</span>
                <input
                  type="date"
                  className={inputClass}
                  value={admissionDate}
                  onChange={(e) => setAdmissionDate(e.target.value)}
                  required={createStep === "demographics"}
                />
              </label>
            </div>
          </section>
        ) : null}

        {mode === "create" ? (
          <section
            className={[
              "px-5 sm:px-6",
              createStep === "contacts" ? "" : "hidden",
            ].join(" ")}
          >
            <h2 className="village-section-title">Next of kin and POA</h2>
            <p className="village-muted mt-1 text-sm">
              Next of kin details are required to complete admission.
            </p>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <label className={fieldLabelClass}>
                <span className={fieldTextClass}>NOK name</span>
                <input
                  className={inputClass}
                  value={nokName}
                  onChange={(e) => setNokName(e.target.value)}
                  required={createStep === "contacts"}
                  autoComplete="name"
                />
              </label>
              <label className={fieldLabelClass}>
                <span className={fieldTextClass}>NOK contact</span>
                <input
                  className={inputClass}
                  value={nokContact}
                  onChange={(e) => setNokContact(e.target.value)}
                  required={createStep === "contacts"}
                  autoComplete="tel"
                />
              </label>
              <label className={fieldLabelClass}>
                <span className={fieldTextClass}>NOK relationship</span>
                <input
                  className={inputClass}
                  value={nokRelationship}
                  onChange={(e) => setNokRelationship(e.target.value)}
                  required={createStep === "contacts"}
                  autoComplete="off"
                />
              </label>
            </div>
            <label className="mt-4 flex cursor-pointer items-start gap-3 text-sm text-ink/75">
              <input
                type="checkbox"
                className="village-checkbox"
                checked={poaSameAsNok}
                onChange={(e) => setPoaSameAsNok(e.target.checked)}
              />
              <span>POA is the same person as next of kin.</span>
            </label>
            {poaSameAsNok ? null : (
              <div className="mt-4 grid gap-4 md:grid-cols-3">
                <label className={fieldLabelClass}>
                  <span className={fieldTextClass}>POA name (optional)</span>
                  <input
                    className={inputClass}
                    value={poaName}
                    onChange={(e) => setPoaName(e.target.value)}
                    autoComplete="name"
                  />
                </label>
                <label className={fieldLabelClass}>
                  <span className={fieldTextClass}>POA contact (optional)</span>
                  <input
                    className={inputClass}
                    value={poaContact}
                    onChange={(e) => setPoaContact(e.target.value)}
                    autoComplete="tel"
                  />
                </label>
                <label className={fieldLabelClass}>
                  <span className={fieldTextClass}>POA relationship (optional)</span>
                  <input
                    className={inputClass}
                    value={poaRelationship}
                    onChange={(e) => setPoaRelationship(e.target.value)}
                    autoComplete="off"
                  />
                </label>
              </div>
            )}
          </section>
        ) : null}

        {mode === "create" ? (
          <section
            className={[
              "px-5 sm:px-6",
              createStep === "clinical" ? "" : "hidden",
            ].join(" ")}
          >
            <h2 className="village-section-title">Clinical (optional)</h2>
            <p className="village-muted mt-1">
              Leave this blank if you only want to complete demographics now.
            </p>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <label className={fieldLabelClass}>
                <span className={fieldTextClass}>Assigned nurse (optional)</span>
                <VillageSelect
                  className="w-full"
                  value={assignedNurseUserId}
                  onChange={setAssignedNurseUserId}
                  options={[
                    { value: "", label: "— None —" },
                    ...(careStaffOptions ?? []).map((u) => ({
                      value: u.id,
                      label: u.email,
                    })),
                  ]}
                />
              </label>
              <label className={fieldLabelClass}>
                <span className={fieldTextClass}>
                  Nurse display override (optional)
                </span>
                <input
                  className={inputClass}
                  value={assignedNurseDisplayOverride}
                  onChange={(e) => setAssignedNurseDisplayOverride(e.target.value)}
                  placeholder="e.g. Agency Nursing Ltd"
                  autoComplete="off"
                />
              </label>
            </div>
            <div className="mt-4 grid gap-4 md:grid-cols-3">
              <label className={fieldLabelClass}>
                <span className={fieldTextClass}>
                  Allergies (optional, one per line)
                </span>
                <textarea
                  className={`${inputClass} min-h-28`}
                  value={clinicalAllergiesText}
                  onChange={(e) => setClinicalAllergiesText(e.target.value)}
                  placeholder={"Peanuts\nPenicillin"}
                />
              </label>
              <label className={fieldLabelClass}>
                <span className={fieldTextClass}>
                  Conditions (optional, one per line)
                </span>
                <textarea
                  className={`${inputClass} min-h-28`}
                  value={clinicalConditionsText}
                  onChange={(e) => setClinicalConditionsText(e.target.value)}
                  placeholder={"Type 2 diabetes\nHypertension"}
                />
              </label>
            </div>
          </section>
        ) : null}

        {mode === "create" ? (
          <section
            className={[
              "px-5 sm:px-6",
              createStep === "done" ? "" : "hidden",
            ].join(" ")}
          >
            <h2 className="village-section-title">Review &amp; create</h2>
            <p className="village-muted mt-1">
              Check placement and identity, then set registration and deposit if
              needed.
            </p>
            <div className="mt-4 rounded-2xl border border-[color:color-mix(in_srgb,var(--accent)_14%,var(--line-subtle))] bg-[color:color-mix(in_srgb,var(--bg-elevated)_80%,transparent)] p-4 shadow-sm">
              <dl className="grid gap-4 text-sm sm:grid-cols-2">
                <div className="min-w-0 sm:col-span-2">
                  <dt className="village-field-label">Home</dt>
                  <dd className="mt-1 font-semibold text-[var(--text-primary)]">
                    {homeName}
                  </dd>
                </div>
                <div className="min-w-0">
                  <dt className="village-field-label">Ward</dt>
                  <dd className="mt-1 text-[var(--text-primary)]">
                    {selectedWardLabel ??
                      (wardId.trim() ? "Unknown ward" : "Not assigned")}
                  </dd>
                </div>
                <div className="min-w-0">
                  <dt className="village-field-label">Room / bed</dt>
                  <dd className="mt-1 text-[var(--text-primary)]">
                    {roomText.trim() ? roomText.trim() : "—"}
                  </dd>
                </div>
                <div className="min-w-0">
                  <dt className="village-field-label">Resident</dt>
                  <dd className="mt-1 font-semibold text-[var(--text-primary)]">
                    {fullName.trim() ? fullName.trim() : "—"}
                  </dd>
                </div>
                <div className="min-w-0">
                  <dt className="village-field-label">DOB / admission</dt>
                  <dd className="mt-1 text-[var(--text-primary)]">
                    {dob || "—"} / {admissionDate || "—"}
                  </dd>
                </div>
                {(nokName.trim() ||
                  nokContact.trim() ||
                  nokRelationship.trim()) ? (
                  <div className="min-w-0 sm:col-span-2">
                    <dt className="village-field-label">Next of kin</dt>
                    <dd className="mt-1 text-[var(--text-primary)]">
                      {[nokName.trim(), nokRelationship.trim(), nokContact.trim()]
                        .filter(Boolean)
                        .join(" · ") || "—"}
                    </dd>
                  </div>
                ) : null}
                {!poaSameAsNok &&
                (poaName.trim() ||
                  poaContact.trim() ||
                  poaRelationship.trim()) ? (
                  <div className="min-w-0 sm:col-span-2">
                    <dt className="village-field-label">Power of attorney</dt>
                    <dd className="mt-1 text-[var(--text-primary)]">
                      {[poaName.trim(), poaRelationship.trim(), poaContact.trim()]
                        .filter(Boolean)
                        .join(" · ") || "—"}
                    </dd>
                  </div>
                ) : poaSameAsNok &&
                  (nokName.trim() || nokContact.trim()) ? (
                  <div className="min-w-0 sm:col-span-2">
                    <dt className="village-field-label">Power of attorney</dt>
                    <dd className="mt-1 text-[var(--text-muted)]">
                      Same as next of kin
                    </dd>
                  </div>
                ) : null}
                {selectedNurseLabel || assignedNurseDisplayOverride.trim() ? (
                  <div className="min-w-0 sm:col-span-2">
                    <dt className="village-field-label">Assigned nurse</dt>
                    <dd className="mt-1 text-[var(--text-primary)]">
                      {[
                        selectedNurseLabel,
                        assignedNurseDisplayOverride.trim() || null,
                      ]
                        .filter(Boolean)
                        .join(" · ") || "—"}
                    </dd>
                  </div>
                ) : null}
              </dl>
            </div>

            <div className="mt-6 flex flex-col gap-4 border-t border-[color:color-mix(in_srgb,var(--line-subtle)_85%,transparent)] pt-6">
              <div>
                <h3 className="village-section-title text-base">
                  Registration &amp; deposit
                </h3>
                <p className="village-muted mt-1 text-sm">
                  Optional one-off charges for this admission. Edit later on
                  Billing. Amounts are minor units (e.g. cents).
                </p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="flex flex-col gap-3 rounded-xl border border-pine/12 bg-cream/75 p-4">
                  <h4 className={subsectionTitleClass}>Registration fee</h4>
                  <label className={fieldLabelClass}>
                    <span className={fieldTextClass}>Amount (minor)</span>
                    <input
                      className={inputClass}
                      inputMode="numeric"
                      value={regAmount}
                      onChange={(e) => setRegAmount(e.target.value)}
                    />
                  </label>
                  <label className="flex w-fit cursor-pointer items-center gap-2 text-sm text-ink/75">
                    <input
                      type="checkbox"
                      className="village-checkbox"
                      checked={regReceived}
                      onChange={(e) => {
                        const next = e.target.checked;
                        setRegReceived(next);
                        if (next) {
                          setRegPaidOn((p) =>
                            p.trim() === "" ? admissionDate : p,
                          );
                        }
                      }}
                    />
                    <span>Received</span>
                  </label>
                  {regReceived ? (
                    <label className={fieldLabelClass}>
                      <span className={fieldTextClass}>
                        Paid on (optional default)
                      </span>
                      <input
                        type="date"
                        className={inputClass}
                        value={regPaidOn}
                        onChange={(e) => setRegPaidOn(e.target.value)}
                      />
                    </label>
                  ) : null}
                </div>
                <div className="flex flex-col gap-3 rounded-xl border border-pine/12 bg-cream/75 p-4">
                  <h4 className={subsectionTitleClass}>Deposit</h4>
                  <label className={fieldLabelClass}>
                    <span className={fieldTextClass}>Amount (minor)</span>
                    <input
                      className={inputClass}
                      inputMode="numeric"
                      value={depAmount}
                      onChange={(e) => setDepAmount(e.target.value)}
                    />
                  </label>
                  <label className="flex w-fit cursor-pointer items-center gap-2 text-sm text-ink/75">
                    <input
                      type="checkbox"
                      className="village-checkbox"
                      checked={depReceived}
                      onChange={(e) => {
                        const next = e.target.checked;
                        setDepReceived(next);
                        if (next) {
                          setDepPaidOn((p) =>
                            p.trim() === "" ? admissionDate : p,
                          );
                        }
                      }}
                    />
                    <span>Received</span>
                  </label>
                  {depReceived ? (
                    <label className={fieldLabelClass}>
                      <span className={fieldTextClass}>
                        Paid on (optional default)
                      </span>
                      <input
                        type="date"
                        className={inputClass}
                        value={depPaidOn}
                        onChange={(e) => setDepPaidOn(e.target.value)}
                      />
                    </label>
                  ) : null}
                </div>
              </div>
            </div>
          </section>
        ) : null}

        {mode === "edit" ? (
          <>
            <section className="village-card-soft flex flex-col gap-4">
              <h2 className="village-section-title">Next of kin</h2>
              <div className="grid gap-4 md:grid-cols-3">
                <label className={fieldLabelClass}>
                  <span className={fieldTextClass}>Name (optional)</span>
                  <input
                    className={inputClass}
                    value={nokName}
                    onChange={(e) => setNokName(e.target.value)}
                    autoComplete="name"
                  />
                </label>
                <label className={fieldLabelClass}>
                  <span className={fieldTextClass}>Contact (optional)</span>
                  <input
                    className={inputClass}
                    value={nokContact}
                    onChange={(e) => setNokContact(e.target.value)}
                    autoComplete="tel"
                  />
                </label>
                <label className={fieldLabelClass}>
                  <span className={fieldTextClass}>
                    Relationship (optional)
                  </span>
                  <input
                    className={inputClass}
                    value={nokRelationship}
                    onChange={(e) => setNokRelationship(e.target.value)}
                    autoComplete="off"
                  />
                </label>
              </div>
            </section>

            <section className="village-card-soft flex flex-col gap-4">
              <h2 className="village-section-title">Power of attorney</h2>
              <label className="flex cursor-pointer items-start gap-3 text-sm text-ink/75">
                <input
                  type="checkbox"
                  className="village-checkbox"
                  checked={poaSameAsNok}
                  onChange={(e) => setPoaSameAsNok(e.target.checked)}
                />
                <span>
                  POA same as next of kin (do not store separate POA contact
                  details)
                </span>
              </label>
              {poaSameAsNok ? (
                <p className="village-muted">
                  Legal representation matches the next of kin above; separate
                  POA name and contact are not saved.
                </p>
              ) : (
                <div className="grid gap-4 md:grid-cols-3">
                  <label className={fieldLabelClass}>
                    <span className={fieldTextClass}>POA name (optional)</span>
                    <input
                      className={inputClass}
                      value={poaName}
                      onChange={(e) => setPoaName(e.target.value)}
                      autoComplete="name"
                    />
                  </label>
                  <label className={fieldLabelClass}>
                    <span className={fieldTextClass}>
                      POA contact (optional)
                    </span>
                    <input
                      className={inputClass}
                      value={poaContact}
                      onChange={(e) => setPoaContact(e.target.value)}
                      autoComplete="tel"
                    />
                  </label>
                  <label className={fieldLabelClass}>
                    <span className={fieldTextClass}>
                      POA relationship / notes (optional)
                    </span>
                    <input
                      className={inputClass}
                      value={poaRelationship}
                      onChange={(e) => setPoaRelationship(e.target.value)}
                      autoComplete="off"
                    />
                  </label>
                </div>
              )}
            </section>

            <section className="village-card-soft flex flex-col gap-4">
              <div>
                <h2 className="village-section-title">Assigned nurse</h2>
                <p className="village-muted mt-1">
                  Link an on-site Care user and optionally add a display line
                  (e.g. agency name).
                </p>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <label className={fieldLabelClass}>
                  <span className={fieldTextClass}>Care staff (optional)</span>
                  <VillageSelect
                    className="w-full"
                    value={assignedNurseUserId}
                    onChange={setAssignedNurseUserId}
                    options={[
                      { value: "", label: "— None —" },
                      ...(careStaffOptions ?? []).map((u) => ({
                        value: u.id,
                        label: u.email,
                      })),
                    ]}
                  />
                </label>
                <label className={fieldLabelClass}>
                  <span className={fieldTextClass}>
                    Display override (optional)
                  </span>
                  <input
                    className={inputClass}
                    value={assignedNurseDisplayOverride}
                    onChange={(e) =>
                      setAssignedNurseDisplayOverride(e.target.value)
                    }
                    placeholder="e.g. Agency Nursing Ltd"
                    autoComplete="off"
                  />
                </label>
              </div>
            </section>
          </>
        ) : null}

        {mode === "edit" && initial?.status === "departed" ? (
          <div className="rounded-lg border border-pine/12 bg-pine-soft px-3 py-2 text-sm text-ink/75">
            <p className="font-semibold text-pine-2">Departed</p>
            {initial.departureReason ? (
              <p className="mt-1">
                Reason: {initial.departureReason}
              </p>
            ) : null}
          </div>
        ) : null}

        </div>
        </div>

        {mode === "create" ? (
          <div className="sticky bottom-0 z-10 mt-auto flex flex-col gap-2 rounded-b-[var(--radius-xl)] border-t border-[color:color-mix(in_srgb,var(--accent)_13%,var(--line-subtle))] bg-[color:color-mix(in_srgb,var(--bg-elevated)_92%,var(--accent)_8%)] px-4 pb-[max(1rem,env(safe-area-inset-bottom,0px))] pt-3 shadow-[0_-16px_34px_-30px_color-mix(in_srgb,var(--text-primary)_45%,transparent)] sm:mt-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-3 sm:px-6 sm:py-4">
            <span className="text-center text-[0.7rem] leading-snug text-ink/65 max-sm:px-1 sm:flex-1 sm:text-left sm:text-xs">
              {createStep === "done"
                ? "Review details then create resident"
                : "Use Next to continue through onboarding"}
            </span>
            <div className="flex w-full shrink-0 justify-end gap-2 max-sm:[&>button]:min-h-11 max-sm:[&>button]:min-w-0 max-sm:[&>button]:flex-1 sm:w-auto sm:justify-end [&>button]:sm:flex-none">
            <button
              type="button"
              className="village-btn-secondary"
              onClick={goPreviousStep}
              disabled={createStepIndex === 0 || createSubmitting}
            >
              Back
            </button>
            <button
              type="submit"
              className="rounded-full bg-[var(--accent)] px-5 py-2.5 text-sm font-bold text-[var(--bg-elevated)] shadow-[0_14px_28px_-18px_var(--accent)] transition hover:bg-[var(--accent-strong)] disabled:cursor-not-allowed disabled:opacity-60"
              disabled={createSubmitting}
            >
              {createStep === "done"
                ? createSubmitting
                  ? "Creating…"
                  : "Create resident"
                : "Next"}
            </button>
            </div>
          </div>
        ) : (
          <button
            type="submit"
            className="village-btn-primary inline-flex w-full justify-center sm:w-fit"
          >
            Save
          </button>
        )}
      </form>

      {mode === "edit" && initial ? (
        <>
          <hr className="village-divider" />
        </>
      ) : null}

      {mode === "edit" && initial ? (
        <DepartResidentModal
          open={departOpen}
          onClose={() => setDepartOpen(false)}
          homeId={homeId}
          residentId={initial.id}
          onDeparted={() => router.refresh()}
        />
      ) : null}
    </main>
  );

  if (isCreateModal) {
    if (typeof document === "undefined") {
      return null;
    }
    return createPortal(rendered, document.body);
  }

  if (isCreateMode) {
    return rendered;
  }

  return rendered;
}
