"use client";

import { VillageList, VillageListFilter } from "@/components/VillageList";
import { VillageSelect } from "@/components/VillageSelect";
import { useRouter, useSearchParams } from "next/navigation";
import type { ReactNode } from "react";

type HomeOption = { id: string; name: string };

type NewResidentHomePickerProps = {
  homes: HomeOption[];
  selectedHomeId: string;
  homeName: string;
  children?: ReactNode;
};

export function NewResidentHomePicker({
  homes,
  selectedHomeId,
  homeName,
  children,
}: NewResidentHomePickerProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function onHomeChange(homeId: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("homeId", homeId);
    router.push(`/dashboard/residents/new?${params.toString()}`);
  }

  return (
    <VillageList
      rootElement="div"
      wrapBody="none"
      listTitle={null}
      filtersCollapsible
      activeFilterCount={0}
      filters={
        homes.length > 1 ? (
          <VillageListFilter
            label="Home"
            htmlFor="new-resident-home"
            minWidth="12rem"
          >
            <VillageSelect
              id="new-resident-home"
              value={selectedHomeId}
              onChange={onHomeChange}
              options={homes.map((h) => ({
                value: h.id,
                label: h.name,
              }))}
            />
          </VillageListFilter>
        ) : (
          <VillageListFilter label="Home" htmlFor="new-resident-home-ro">
            <input
              id="new-resident-home-ro"
              readOnly
              className="village-input bg-[color:color-mix(in_srgb,var(--bg-muted)_55%,transparent)]"
              value={homeName}
            />
          </VillageListFilter>
        )
      }
    >
      {children}
    </VillageList>
  );
}
