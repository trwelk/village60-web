"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { VillageSelect } from "@/components/VillageSelect";
import { MedicationsTab } from "../homes/[id]/residents/MedicationsTab";

type ResidentOption = { id: string; fullName: string };

type Props = {
  homes: Array<{ homeId: string; homeName: string }>;
  selectedHomeId: string;
  selectedResidentId: string;
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

export function GlobalResidentMedicationsClient({
  homes,
  selectedHomeId,
  selectedResidentId,
}: Props) {
  const router = useRouter();

  const [residents, setResidents] = useState<ResidentOption[] | null>(null);
  const [residentsError, setResidentsError] = useState<string | null>(null);

  const loadResidents = useCallback(async () => {
    if (!selectedHomeId) {
      setResidents([]);
      return;
    }
    setResidentsError(null);
    setResidents(null);
    const res = await fetch(
      `/api/homes/${selectedHomeId}/residents?status=active&pageSize=100`,
    );
    if (!res.ok) {
      setResidentsError(await parseError(res));
      return;
    }
    const json = (await res.json()) as {
      residents: Array<{ id: string; fullName: string }>;
    };
    setResidents(
      json.residents.map((r) => ({ id: r.id, fullName: r.fullName })),
    );
  }, [selectedHomeId]);

  useEffect(() => {
    void loadResidents();
  }, [loadResidents]);

  const activeResidentId = useMemo(() => {
    if (!selectedResidentId || residents === null) {
      return null;
    }
    return residents.some((r) => r.id === selectedResidentId)
      ? selectedResidentId
      : null;
  }, [selectedResidentId, residents]);

  function onHomeChange(nextId: string) {
    if (!nextId) return;
    // Clear resident ID when home changes
    router.push(`/dashboard/resident-medications?homeId=${encodeURIComponent(nextId)}`);
  }

  function onResidentChange(nextId: string) {
    if (!selectedHomeId) return;
    if (nextId === "") {
      router.push(`/dashboard/resident-medications?homeId=${encodeURIComponent(selectedHomeId)}`);
    } else {
      router.push(
        `/dashboard/resident-medications?homeId=${encodeURIComponent(selectedHomeId)}&residentId=${encodeURIComponent(nextId)}`,
      );
    }
  }

  if (homes.length === 0) {
    return (
      <div className="village-card p-8 text-center text-[var(--text-secondary)]">
        You don&apos;t have access to any homes.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <div className="village-reveal village-reveal-delay-1 flex flex-col gap-4 sm:flex-row sm:items-end">
        <div className="w-full max-w-xs">
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="village-field-label">Home</span>
            <VillageSelect
              value={selectedHomeId}
              onChange={onHomeChange}
              options={homes.map((h) => ({
                value: h.homeId,
                label: h.homeName,
              }))}
            />
          </label>
        </div>

        {selectedHomeId && (
          <div className="w-full max-w-xs">
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="village-field-label">Resident</span>
              <VillageSelect
                className="w-full"
                ariaLabel="Resident"
                value={activeResidentId ?? ""}
                onChange={onResidentChange}
                placeholder={
                  residents === null ? "Loading…" : "Choose a resident…"
                }
                disabled={residents === null}
                options={(residents ?? []).map((r) => ({
                  value: r.id,
                  label: r.fullName,
                }))}
              />
            </label>
          </div>
        )}
      </div>

      {residentsError ? (
        <p className="village-alert-error">{residentsError}</p>
      ) : null}

      <div className="village-reveal village-reveal-delay-2">
        {!activeResidentId ? (
          <div className="village-card p-8 text-center text-[var(--text-secondary)]">
            Choose a resident to view and edit their medications.
          </div>
        ) : (
          <div className="village-card min-h-[12rem] p-6 sm:p-8">
            <MedicationsTab
              homeId={selectedHomeId}
              residentId={activeResidentId}
              hideSectionTitle
              tableLayout
              unitPresets
            />
          </div>
        )}
      </div>
    </div>
  );
}
