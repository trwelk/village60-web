"use client";

import { FlatBreadcrumbRegistration } from "@/components/FlatBreadcrumbRegistration";
import { VillageList, VillageListFilter } from "@/components/VillageList";
import { VillageSelect } from "@/components/VillageSelect";
import { buildFlatMarBreadcrumbTrail } from "@/lib/dashboard/nestedBreadcrumbs";
import type { MarDayView } from "@/lib/mar/service";
import type { SessionUserRole } from "@/lib/session";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo } from "react";
import { MarView } from "@/app/dashboard/homes/[id]/mar/MarView";

type HomeOption = { id: string; name: string };

type MarPageClientProps = {
  homes: HomeOption[];
  selectedHomeId: string;
  homeName: string;
  role: SessionUserRole;
  initialDate: string;
  initialMar: MarDayView;
};

export function MarPageClient({
  homes,
  selectedHomeId,
  homeName,
  role,
  initialDate,
  initialMar,
}: MarPageClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const crumbs = useMemo(
    () =>
      buildFlatMarBreadcrumbTrail({
        homeId: selectedHomeId,
        homeLabel: homeName,
        role,
      }),
    [selectedHomeId, homeName, role],
  );

  function onHomeChange(homeId: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("homeId", homeId);
    router.push(`/dashboard/mar?${params.toString()}`);
  }

  return (
    <div className="flex flex-col gap-6 text-ink">
      <FlatBreadcrumbRegistration crumbs={crumbs} />
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
              htmlFor="mar-home"
              minWidth="12rem"
            >
              <VillageSelect
                id="mar-home"
                value={selectedHomeId}
                onChange={onHomeChange}
                options={homes.map((h) => ({
                  value: h.id,
                  label: h.name,
                }))}
              />
            </VillageListFilter>
          ) : (
            <VillageListFilter label="Home" htmlFor="mar-home-ro">
              <input
                id="mar-home-ro"
                readOnly
                className="village-input bg-[color:color-mix(in_srgb,var(--bg-muted)_55%,transparent)]"
                value={homeName}
              />
            </VillageListFilter>
          )
        }
      >
        <MarView
          key={selectedHomeId}
          homeId={selectedHomeId}
          homeName={homeName}
          initialDate={initialDate}
          initialMar={initialMar}
        />
      </VillageList>
    </div>
  );
}
