"use client";

import { VillageSelect } from "@/components/VillageSelect";
import { useRouter } from "next/navigation";
import { HomeFormularySection } from "../homes/[id]/medications/HomeFormularySection";

type Props = {
  homes: Array<{ homeId: string; homeName: string }>;
  selectedHomeId: string;
};

export function GlobalMedicationsClient({ homes, selectedHomeId }: Props) {
  const router = useRouter();

  function onHomeChange(nextId: string) {
    if (!nextId) return;
    router.push(`/dashboard/medications?homeId=${encodeURIComponent(nextId)}`);
  }

  if (homes.length === 0) {
    return (
      <div className="village-card p-8 text-center text-[var(--text-secondary)]">
        You don&apos;t have access to any homes.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-10">
      <div className="village-reveal village-reveal-delay-1 relative z-20 flex flex-col gap-4 overflow-visible sm:flex-row sm:items-center sm:justify-between">
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
      </div>

      {selectedHomeId ? (
        <div className="village-reveal village-reveal-delay-2 relative z-0">
          <HomeFormularySection homeId={selectedHomeId} />
        </div>
      ) : null}
    </div>
  );
}
