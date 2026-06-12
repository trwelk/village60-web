"use client";

import { FlatBreadcrumbRegistration } from "@/components/FlatBreadcrumbRegistration";
import { VillageList, VillageListFilter } from "@/components/VillageList";
import { VillageSelect } from "@/components/VillageSelect";
import {
  dashboardResidentHref,
  dashboardResidentsHref,
} from "@/lib/dashboard/dashboardRoutes";
import { buildFlatDepartedBreadcrumbTrail } from "@/lib/dashboard/nestedBreadcrumbs";
import { getAppTimezone } from "@/lib/config/appTimezone";
import type { SessionUserRole } from "@/lib/session";
import type { ResidentPublic } from "@/lib/residents/service";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo } from "react";

type HomeOption = { id: string; name: string };

const REASON_PREVIEW_CHARS = 120;

function formatDepartureLocal(utcMs: number): string {
  return new Intl.DateTimeFormat("en-NZ", {
    timeZone: getAppTimezone(),
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(utcMs));
}

function DepartedRow({
  resident,
}: {
  resident: ResidentPublic;
}) {
  const reason = resident.departureReason ?? "—";
  const truncated =
    reason.length > REASON_PREVIEW_CHARS
      ? `${reason.slice(0, REASON_PREVIEW_CHARS)}…`
      : reason;
  const at = resident.departureAtUtcMs;
  return (
    <tr>
      <td className="village-td font-medium">
        <Link
          href={dashboardResidentHref(resident.id)}
          className="village-link"
        >
          {resident.fullName}
        </Link>
      </td>
      <td className="village-td-muted">
        {at != null ? formatDepartureLocal(at) : "—"}
      </td>
      <td className="village-td-muted max-w-md">
        <span title={reason.length > REASON_PREVIEW_CHARS ? reason : undefined}>
          {truncated}
        </span>
      </td>
    </tr>
  );
}

type DepartedResidentsPageClientProps = {
  homes: HomeOption[];
  selectedHomeId: string;
  homeName: string;
  role: SessionUserRole;
  residents: ResidentPublic[];
};

export function DepartedResidentsPageClient({
  homes,
  selectedHomeId,
  homeName,
  role,
  residents,
}: DepartedResidentsPageClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const crumbs = useMemo(
    () =>
      buildFlatDepartedBreadcrumbTrail({
        homeId: selectedHomeId,
        homeLabel: homeName,
        role,
      }),
    [selectedHomeId, homeName, role],
  );

  function onHomeChange(homeId: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("homeId", homeId);
    router.push(`/dashboard/residents/departed?${params.toString()}`);
  }

  return (
    <main className="flex flex-col gap-6 text-ink">
      <FlatBreadcrumbRegistration crumbs={crumbs} />
      <VillageList
        rootElement="div"
        wrapBody="none"
        listTitle={null}
        filtersCollapsible
        activeFilterCount={0}
        toolbar={
          <div className="flex w-full min-w-0 flex-1 flex-wrap items-center justify-end gap-2">
            <Link
              href={dashboardResidentsHref(selectedHomeId)}
              className="village-btn-secondary shrink-0 px-3 py-1.5 text-sm"
            >
              ← Active residents
            </Link>
          </div>
        }
        filters={
          homes.length > 1 ? (
            <VillageListFilter
              label="Home"
              htmlFor="departed-home"
              minWidth="12rem"
            >
              <VillageSelect
                id="departed-home"
                value={selectedHomeId}
                onChange={onHomeChange}
                options={homes.map((h) => ({
                  value: h.id,
                  label: h.name,
                }))}
              />
            </VillageListFilter>
          ) : (
            <VillageListFilter label="Home" htmlFor="departed-home-ro">
              <input
                id="departed-home-ro"
                readOnly
                className="village-input bg-[color:color-mix(in_srgb,var(--bg-muted)_55%,transparent)]"
                value={homeName}
              />
            </VillageListFilter>
          )
        }
      >
        <section>
          <h2 className="village-section-title">Directory</h2>
          <div className="village-table-wrap mt-4">
            <table className="village-table">
              <thead className="village-thead">
                <tr>
                  <th className="village-th">Name</th>
                  <th className="village-th">Departure</th>
                  <th className="village-th">Reason</th>
                </tr>
              </thead>
              <tbody className="village-tbody">
                {residents.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="village-td-muted py-10 text-center">
                      No departed residents for this home yet.
                    </td>
                  </tr>
                ) : (
                  residents.map((r) => <DepartedRow key={r.id} resident={r} />)
                )}
              </tbody>
            </table>
          </div>
        </section>
      </VillageList>
    </main>
  );
}
