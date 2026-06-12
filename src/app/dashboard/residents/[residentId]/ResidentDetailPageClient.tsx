"use client";

import {
  FlatResidentBreadcrumbRegistration,
} from "@/components/FlatBreadcrumbRegistration";
import { VillageList, VillageListFilter } from "@/components/VillageList";
import { VillageSelect } from "@/components/VillageSelect";
import {
  dashboardResidentHref,
  dashboardResidentsHref,
} from "@/lib/dashboard/dashboardRoutes";
import { buildResidentDetailBreadcrumbTrail } from "@/lib/dashboard/nestedBreadcrumbs";
import type { SessionUserRole } from "@/lib/session";
import type { ResidentPublic } from "@/lib/residents/service";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo } from "react";
import { ResidentDetailShell } from "@/app/dashboard/homes/[id]/residents/ResidentDetailShell";

type HomeOption = { id: string; name: string };
type ResidentOption = { id: string; name: string };
type WardOption = { id: string; label: string };
type CareStaffOption = { id: string; email: string };

type ResidentDetailPageClientProps = {
  homes: HomeOption[];
  homeId: string;
  homeName: string;
  homeDefaultCurrencyCode: string;
  userRole: SessionUserRole;
  resident: ResidentPublic;
  homeResidents: ResidentOption[];
  wards: WardOption[];
  careStaffOptions: CareStaffOption[];
};

export function ResidentDetailPageClient({
  homes,
  homeId,
  homeName,
  homeDefaultCurrencyCode,
  userRole,
  resident,
  homeResidents,
  wards,
  careStaffOptions,
}: ResidentDetailPageClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const crumbs = useMemo(
    () =>
      buildResidentDetailBreadcrumbTrail({
        role: userRole,
        homeId,
        homeLabel: homeName,
        residentId: resident.id,
        residentLabel: resident.fullName,
      }),
    [userRole, homeId, homeName, resident.id, resident.fullName],
  );

  function onHomeChange(nextHomeId: string) {
    if (nextHomeId === homeId) {
      return;
    }
    router.push(dashboardResidentsHref(nextHomeId));
  }

  function onResidentChange(nextResidentId: string) {
    if (nextResidentId === resident.id) {
      return;
    }
    const params = new URLSearchParams(searchParams.toString());
    const tab = params.get("tab");
    router.push(dashboardResidentHref(nextResidentId, tab ?? undefined));
  }

  return (
    <div className="flex flex-col gap-6 text-ink">
      <FlatResidentBreadcrumbRegistration crumbs={crumbs} />
      <VillageList
        rootElement="div"
        wrapBody="none"
        listTitle={null}
        filtersCollapsible
        activeFilterCount={0}
        filters={
          <>
            {homes.length > 1 ? (
              <VillageListFilter
                label="Home"
                htmlFor="resident-detail-home"
                minWidth="12rem"
              >
                <VillageSelect
                  id="resident-detail-home"
                  value={homeId}
                  onChange={onHomeChange}
                  options={homes.map((h) => ({
                    value: h.id,
                    label: h.name,
                  }))}
                />
              </VillageListFilter>
            ) : (
              <VillageListFilter label="Home" htmlFor="resident-detail-home-ro">
                <input
                  id="resident-detail-home-ro"
                  readOnly
                  className="village-input bg-[color:color-mix(in_srgb,var(--bg-muted)_55%,transparent)]"
                  value={homeName}
                />
              </VillageListFilter>
            )}
            <VillageListFilter
              label="Resident"
              htmlFor="resident-detail-resident"
              minWidth="12rem"
            >
              <VillageSelect
                id="resident-detail-resident"
                value={resident.id}
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
        <ResidentDetailShell
          homeId={homeId}
          homeDefaultCurrencyCode={homeDefaultCurrencyCode}
          userRole={userRole}
          resident={resident}
          wards={wards}
          careStaffOptions={careStaffOptions}
        />
      </VillageList>
    </div>
  );
}
