"use client";

import {
  FlatResidentBreadcrumbRegistration,
} from "@/components/FlatBreadcrumbRegistration";
import { VillageList, VillageListFilter } from "@/components/VillageList";
import { VillageSelect } from "@/components/VillageSelect";
import {
  dashboardResidentHref,
  dashboardResidentMedicationsHref,
  dashboardResidentsHref,
} from "@/lib/dashboard/dashboardRoutes";
import { buildFlatResidentMedicationsBreadcrumbTrail } from "@/lib/dashboard/nestedBreadcrumbs";
import type { SessionUserRole } from "@/lib/session";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { AddMedicationModal } from "@/app/dashboard/homes/[id]/residents/[residentId]/medications/AddMedicationModal";
import {
  EditMedicationModal,
  type EditMedicationTarget,
} from "@/app/dashboard/homes/[id]/residents/[residentId]/medications/EditMedicationModal";
import type { MarTimeSlot } from "@/lib/mar/constants";

type HomeOption = { id: string; name: string };
type ResidentOption = { id: string; name: string };

type MedicationRow = {
  id: string;
  itemId: string;
  name: string;
  directions: string;
  quantityPerServing: number;
  unit: string;
  prn: boolean;
  servingsPerDay: number | null;
  scheduledSlots: MarTimeSlot[];
  status: string;
  onHandBaseUnits: number;
};

type ResidentMedicationsPageClientProps = {
  homes: HomeOption[];
  homeId: string;
  homeName: string;
  role: SessionUserRole;
  residentId: string;
  residentName: string;
  homeResidents: ResidentOption[];
  medications: MedicationRow[];
};

function servingsLabel(servingsPerDay: number | null): string {
  if (servingsPerDay == null) {
    return "As directed";
  }
  return `${servingsPerDay} / day`;
}

function formatOnHand(quantity: number, unit: string): string {
  const rounded = Number.isInteger(quantity)
    ? String(quantity)
    : quantity.toFixed(3).replace(/\.?0+$/, "");
  return `${rounded} ${unit}`;
}

async function parseError(res: Response): Promise<string> {
  try {
    const data: unknown = await res.json();
    if (typeof data === "object" && data && "error" in data) {
      const err = (data as { error?: unknown }).error;
      if (typeof err === "string") return err;
    }
  } catch {
    // ignore
  }
  return "Request failed.";
}

export function ResidentMedicationsPageClient({
  homes,
  homeId,
  homeName,
  role,
  residentId,
  residentName,
  homeResidents,
  medications,
}: ResidentMedicationsPageClientProps) {
  const router = useRouter();
  const [editingMedication, setEditingMedication] =
    useState<EditMedicationTarget | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [stoppingId, setStoppingId] = useState<string | null>(null);
  const crumbs = useMemo(
    () =>
      buildFlatResidentMedicationsBreadcrumbTrail({
        role,
        homeId,
        homeLabel: homeName,
        residentId,
        residentLabel: residentName,
      }),
    [role, homeId, homeName, residentId, residentName],
  );

  function onHomeChange(nextHomeId: string) {
    if (nextHomeId === homeId) {
      return;
    }
    router.push(dashboardResidentsHref(nextHomeId));
  }

  function onResidentChange(nextResidentId: string) {
    if (nextResidentId === residentId) {
      return;
    }
    router.push(dashboardResidentMedicationsHref(nextResidentId));
  }

  function openEditModal(med: MedicationRow) {
    setActionError(null);
    setEditingMedication({
      id: med.id,
      itemId: med.itemId,
      name: med.name,
      quantityPerServing: med.quantityPerServing,
      directions: med.directions,
      servingsPerDay: med.servingsPerDay,
      prn: med.prn,
      scheduledSlots: med.scheduledSlots,
    });
  }

  async function stopMedication(med: MedicationRow) {
    const confirmed = window.confirm(
      `Stop ${med.name} for this resident? This removes the medication assignment.`,
    );
    if (!confirmed) {
      return;
    }
    setActionError(null);
    setStoppingId(med.id);
    try {
      const res = await fetch(
        `/api/homes/${homeId}/residents/${residentId}/clinical/medications/${encodeURIComponent(med.id)}`,
        { method: "DELETE" },
      );
      if (!res.ok) {
        setActionError(await parseError(res));
        return;
      }
      router.refresh();
    } finally {
      setStoppingId(null);
    }
  }

  return (
    <main className="flex flex-col gap-6 text-ink">
      <FlatResidentBreadcrumbRegistration crumbs={crumbs} />
      <EditMedicationModal
        homeId={homeId}
        residentId={residentId}
        medication={editingMedication}
        onClose={() => setEditingMedication(null)}
      />
      <VillageList
        rootElement="div"
        wrapBody="none"
        listTitle={null}
        filtersCollapsible
        activeFilterCount={0}
        toolbar={
          <div className="flex w-full min-w-0 flex-1 flex-wrap items-center justify-end gap-2">
            <AddMedicationModal homeId={homeId} residentId={residentId} />
            <Link
              href={dashboardResidentHref(residentId)}
              className="village-btn-secondary shrink-0 px-3 py-1.5 text-sm"
            >
              Back to resident
            </Link>
          </div>
        }
        filters={
          <>
            {homes.length > 1 ? (
              <VillageListFilter
                label="Home"
                htmlFor="meds-home"
                minWidth="12rem"
              >
                <VillageSelect
                  id="meds-home"
                  value={homeId}
                  onChange={onHomeChange}
                  options={homes.map((h) => ({
                    value: h.id,
                    label: h.name,
                  }))}
                />
              </VillageListFilter>
            ) : (
              <VillageListFilter label="Home" htmlFor="meds-home-ro">
                <input
                  id="meds-home-ro"
                  readOnly
                  className="village-input bg-[color:color-mix(in_srgb,var(--bg-muted)_55%,transparent)]"
                  value={homeName}
                />
              </VillageListFilter>
            )}
            <VillageListFilter
              label="Resident"
              htmlFor="meds-resident"
              minWidth="12rem"
            >
              <VillageSelect
                id="meds-resident"
                value={residentId}
                onChange={onResidentChange}
                options={homeResidents.map((r) => ({
                  value: r.id,
                  label: r.name,
                }))}
              />
            </VillageListFilter>
          </>
        }
      >
        <section className="village-card village-reveal village-reveal-delay-1 p-6 sm:p-8">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="village-section-title mb-0">All medications</h2>
          </div>
          {actionError ? (
            <p className="mt-4 text-sm font-medium text-terracotta">{actionError}</p>
          ) : null}

          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-ink/70">
              Showing {medications.length} of {medications.length}
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled
                className="rounded border border-pine/25 bg-cream px-3 py-1.5 text-sm text-ink disabled:cursor-not-allowed disabled:opacity-40"
              >
                Previous
              </button>
              <button
                type="button"
                disabled
                className="rounded border border-pine/25 bg-cream px-3 py-1.5 text-sm text-ink disabled:cursor-not-allowed disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>

          <div className="village-table-wrap mt-5">
            <table className="village-table">
              <thead className="village-thead">
                <tr>
                  <th className="village-th">Medication</th>
                  <th className="village-th">Directions</th>
                  <th className="village-th">Dose</th>
                  <th className="village-th">On hand</th>
                  <th className="village-th">Frequency</th>
                  <th className="village-th">Status</th>
                  <th className="village-th">Actions</th>
                </tr>
              </thead>
              <tbody className="village-tbody">
                {medications.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="village-td-muted py-10 text-center">
                      No medications assigned yet.
                    </td>
                  </tr>
                ) : (
                  medications.map((med) => (
                    <tr key={med.id}>
                      <td className="village-td font-medium">{med.name}</td>
                      <td className="village-td-muted max-w-[20rem] text-sm">
                        {med.directions}
                      </td>
                      <td className="village-td-muted">
                        {med.quantityPerServing} {med.unit}
                      </td>
                      <td className="village-td-muted">
                        {formatOnHand(med.onHandBaseUnits, med.unit)}
                      </td>
                      <td className="village-td-muted">
                        {med.prn ? "PRN" : servingsLabel(med.servingsPerDay)}
                      </td>
                      <td className="village-td-muted capitalize">{med.status}</td>
                      <td className="village-td">
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                          <button
                            type="button"
                            className="village-link cursor-pointer border-0 bg-transparent p-0"
                            onClick={() => openEditModal(med)}
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            className="text-sm font-semibold text-danger underline decoration-danger/35 underline-offset-4 hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                            onClick={() => void stopMedication(med)}
                            disabled={stoppingId === med.id}
                          >
                            {stoppingId === med.id ? "Stopping…" : "Stop"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </VillageList>
    </main>
  );
}
