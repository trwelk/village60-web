"use client";

import { FlatBreadcrumbRegistration } from "@/components/FlatBreadcrumbRegistration";
import { VillageList, VillageListFilter } from "@/components/VillageList";
import { VillageSelect } from "@/components/VillageSelect";
import { buildFlatWardsBreadcrumbTrail } from "@/lib/dashboard/nestedBreadcrumbs";
import type { Home } from "@/lib/homes/service";
import type { SessionUserRole } from "@/lib/session";
import type { WardListItem } from "@/lib/wards/service";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { WardsAdminUI } from "@/app/dashboard/homes/[id]/wards/WardsAdminUI";

type HomeOption = { id: string; name: string };

type WardsPageClientProps = {
  homes: HomeOption[];
  selectedHomeId: string;
  home: Home;
  role: SessionUserRole;
  initialWards: WardListItem[];
};

export function WardsPageClient({
  homes,
  selectedHomeId,
  home,
  role,
  initialWards,
}: WardsPageClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [createModalOpen, setCreateModalOpen] = useState(false);

  const crumbs = useMemo(
    () =>
      buildFlatWardsBreadcrumbTrail({
        homeId: selectedHomeId,
        homeLabel: home.name,
        role,
      }),
    [selectedHomeId, home.name, role],
  );

  function onHomeChange(homeId: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("homeId", homeId);
    router.push(`/dashboard/wards?${params.toString()}`);
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
        toolbar={
          <div className="flex w-full min-w-0 flex-1 flex-wrap items-center justify-end gap-2">
            <button
              type="button"
              className="village-btn-primary shrink-0 px-3 py-1.5 text-sm"
              onClick={() => setCreateModalOpen(true)}
            >
              Add a ward
            </button>
          </div>
        }
        filters={
          homes.length > 1 ? (
            <VillageListFilter
              label="Home"
              htmlFor="wards-home"
              minWidth="12rem"
            >
              <VillageSelect
                id="wards-home"
                value={selectedHomeId}
                onChange={onHomeChange}
                options={homes.map((h) => ({
                  value: h.id,
                  label: h.name,
                }))}
              />
            </VillageListFilter>
          ) : (
            <VillageListFilter label="Home" htmlFor="wards-home-ro">
              <input
                id="wards-home-ro"
                readOnly
                className="village-input bg-[color:color-mix(in_srgb,var(--bg-muted)_55%,transparent)]"
                value={home.name}
              />
            </VillageListFilter>
          )
        }
      >
        <WardsAdminUI
          home={home}
          initialWards={initialWards}
          createModalOpen={createModalOpen}
          onCloseCreateModal={() => setCreateModalOpen(false)}
        />
      </VillageList>
    </div>
  );
}
