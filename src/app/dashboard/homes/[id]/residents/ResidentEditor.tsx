"use client";

import { LocalTime } from "@/components/LocalTime";
import type {
  Resident,
  ResidentWithoutFee,
} from "@/lib/residents/service";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { DepartResidentModal } from "./DepartResidentModal";

type WardOption = { id: string; label: string };

type ResidentInitial = Resident | ResidentWithoutFee;

type Props = {
  homeId: string;
  homeName: string;
  wards: WardOption[];
  mode: "create" | "edit";
  initial?: ResidentInitial;
  careStaffOptions?: { id: string; email: string }[];
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
const selectClass = "village-select w-full";
const subsectionTitleClass =
  "text-sm font-semibold uppercase tracking-[0.18em] text-pine/75";

export function ResidentEditor({
  homeId,
  homeName,
  wards,
  mode,
  initial,
  careStaffOptions = [],
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

  const isDeparted = mode === "edit" && initial?.status === "departed";

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (mode === "create") {
      const regMinor = Number.parseInt(regAmount, 10);
      const depMinor = Number.parseInt(depAmount, 10);
      if (
        Number.isNaN(regMinor) ||
        regMinor < 0 ||
        Number.isNaN(depMinor) ||
        depMinor < 0
      ) {
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
          wardId: wardId || null,
          roomText: roomText || null,
          otherCharges: { registration, deposit },
        }),
      });
      if (!res.ok) {
        setError(await parseError(res));
        return;
      }
      const data: unknown = await res.json();
      const id =
        typeof data === "object" &&
        data !== null &&
        "resident" in data &&
        typeof (data as { resident: { id?: unknown } }).resident ===
          "object" &&
        (data as { resident: { id?: string } }).resident.id
          ? (data as { resident: { id: string } }).resident.id
          : null;
      if (id) {
        router.push(`/dashboard/homes/${homeId}/residents/${id}`);
        router.refresh();
      }
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

  return (
    <main className="flex max-w-5xl flex-col gap-8 text-ink">
      <header className="village-reveal">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="font-display text-3xl font-normal tracking-tight text-pine-2">
              {mode === "create" ? "New resident" : "Resident"}
            </h1>
            <p className="mt-2 text-sm text-ink/70">{homeName}</p>
          </div>
          {mode === "edit" && initial && initial.status === "active" ? (
            <button
              type="button"
              onClick={() => setDepartOpen(true)}
              className="rounded-lg border border-danger/35 bg-cream px-4 py-2 text-sm font-semibold text-danger shadow-sm transition hover:bg-danger/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger/35"
            >
              Depart
            </button>
          ) : null}
        </div>
        <div className="mt-4 flex flex-wrap gap-4 text-sm">
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
      </header>

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

      <form
        onSubmit={onSubmit}
        className="village-reveal village-reveal-delay-2 village-card flex flex-col gap-6 p-5 sm:p-6"
      >
        <div>
          <h2 className="village-section-title">
            {mode === "create" ? "Resident details" : "Profile details"}
          </h2>
          <p className="village-muted mt-1">
            Capture the details care and billing teams need to place this resident
            correctly.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
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
          {isDeparted ? (
            <p className="village-muted md:col-span-2">
              Ward and room were cleared when this resident departed.
            </p>
          ) : (
            <>
              <label className={fieldLabelClass}>
                <span className={fieldTextClass}>Ward (optional)</span>
                <select
                  className={selectClass}
                  value={wardId}
                  onChange={(e) => setWardId(e.target.value)}
                >
                  <option value="">—</option>
                  {wards.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.label}
                    </option>
                  ))}
                </select>
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
        </div>

        {mode === "create" ? (
          <div className="village-card-soft flex flex-col gap-4">
            <div>
              <h2 className="village-section-title">
                Registration &amp; deposit
              </h2>
              <p className="village-muted mt-1">
                One-off fees recorded with this admission. You can change these
                later on the Billing tab. Amounts are in minor units (e.g.
                cents). When you mark a line as received, paid on defaults to the
                admission date above if you leave the date blank.
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-3 rounded-xl border border-pine/12 bg-cream/75 p-4">
                <h3 className={subsectionTitleClass}>
                  Registration fee
                </h3>
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
                <h3 className={subsectionTitleClass}>
                  Deposit
                </h3>
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
                  <select
                    className={selectClass}
                    value={assignedNurseUserId}
                    onChange={(e) => setAssignedNurseUserId(e.target.value)}
                  >
                    <option value="">— None —</option>
                    {careStaffOptions.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.email}
                      </option>
                    ))}
                  </select>
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

        <button
          type="submit"
          className="village-btn-primary inline-flex w-full justify-center sm:w-fit"
        >
          {mode === "create" ? "Create" : "Save"}
        </button>
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
}
