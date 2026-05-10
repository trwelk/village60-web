"use client";

import {
  VillageList,
  VillageListEmpty,
  VillageListFilter,
} from "@/components/VillageList";
import { VillageSelect } from "@/components/VillageSelect";
import {
  buildResidentsDirectoryQueryString,
  residentsDirectoryStateFromSearchParams,
} from "@/lib/residents/directoryPath";
import type { Resident } from "@/lib/residents/service";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

type HomeOption = { id: string; name: string };

type Props = {
  homes: HomeOption[];
  role: "admin" | "care";
  /** When set, list is scoped to this home (no home filter control). */
  fixedHomeId?: string;
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

export function ResidentsDirectoryUI({
  homes,
  role,
  fixedHomeId,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const urlState = residentsDirectoryStateFromSearchParams(
    searchParams,
    fixedHomeId,
  );

  const [wards, setWards] = useState<{ id: string; label: string }[]>([]);
  const [residents, setResidents] = useState<Resident[] | null>(null);
  const [totalCount, setTotalCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const homeNameById = Object.fromEntries(homes.map((h) => [h.id, h.name]));

  const effectiveHomeId = fixedHomeId ?? (urlState.homeId || undefined);

  const navigate = useCallback(
    (next: Partial<typeof urlState>) => {
      const merged: typeof urlState = { ...urlState, ...next };
      const qs = buildResidentsDirectoryQueryString(merged);
      router.replace(qs ? `${pathname}?${qs}` : pathname);
    },
    [
      pathname,
      router,
      urlState.fixedHome,
      urlState.homeId,
      urlState.query,
      urlState.status,
      urlState.wardId,
      urlState.page,
      urlState.pageSize,
      urlState.newResident,
    ],
  );

  const loadWards = useCallback(
    async (hid: string) => {
      if (!hid) {
        setWards([]);
        return;
      }
      const res = await fetch(`/api/homes/${hid}/wards`);
      if (!res.ok) {
        setWards([]);
        return;
      }
      const data: unknown = await res.json();
      if (
        typeof data === "object" &&
        data !== null &&
        "wards" in data &&
        Array.isArray((data as { wards: unknown }).wards)
      ) {
        const list = (data as { wards: { id: string; label: string }[] }).wards;
        setWards(list.map((w) => ({ id: w.id, label: w.label })));
      }
    },
    [],
  );

  useEffect(() => {
    void loadWards(effectiveHomeId ?? "");
  }, [effectiveHomeId, loadWards]);

  useEffect(() => {
    if (
      effectiveHomeId &&
      urlState.wardId &&
      wards.length > 0 &&
      !wards.some((w) => w.id === urlState.wardId)
    ) {
      navigate({ wardId: "", page: 1 });
    }
  }, [effectiveHomeId, navigate, urlState.wardId, wards]);

  const fetchResidents = useCallback(async () => {
    setLoading(true);
    setError(null);
    setResidents(null);
    const params = new URLSearchParams();
    if (effectiveHomeId) {
      params.set("homeId", effectiveHomeId);
    }
    if (urlState.query.trim()) {
      params.set("query", urlState.query.trim());
    }
    if (urlState.status !== "active") {
      params.set("status", urlState.status);
    }
    if (urlState.wardId) {
      params.set("wardId", urlState.wardId);
    }
    params.set("page", String(urlState.page));
    params.set("pageSize", String(urlState.pageSize));
    const res = await fetch(`/api/residents?${params.toString()}`);
    if (!res.ok) {
      setError(await parseError(res));
      setResidents(null);
      setTotalCount(0);
      setLoading(false);
      return;
    }
    const data: unknown = await res.json();
    if (
      typeof data === "object" &&
      data !== null &&
      "residents" in data &&
      Array.isArray((data as { residents: unknown }).residents)
    ) {
      setResidents((data as { residents: Resident[] }).residents);
      const tc = (data as { totalCount?: unknown }).totalCount;
      setTotalCount(typeof tc === "number" ? tc : 0);
    } else {
      setResidents([]);
      setTotalCount(0);
    }
    setLoading(false);
  }, [
    effectiveHomeId,
    urlState.query,
    urlState.status,
    urlState.wardId,
    urlState.page,
    urlState.pageSize,
  ]);

  useEffect(() => {
    void fetchResidents();
  }, [fetchResidents]);

  /** Legacy `?newResident=1`: go to explicit create URL. */
  useEffect(() => {
    if (!fixedHomeId || !urlState.newResident) return;
    router.replace(`/dashboard/homes/${fixedHomeId}/residents/new`);
  }, [fixedHomeId, urlState.newResident, router]);

  const showToolbar =
    fixedHomeId != null || (role === "admin" && urlState.homeId !== "");

  const activeFilterCount =
    (urlState.homeId && !fixedHomeId ? 1 : 0) +
    (urlState.query.trim() ? 1 : 0) +
    (urlState.status !== "active" ? 1 : 0) +
    (urlState.wardId ? 1 : 0);

  return (
    <VillageList
      toolbar={
        <div className="flex w-full min-w-0 flex-1 flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 flex-1 flex-wrap items-center justify-end gap-3">
            {showToolbar ? (
              fixedHomeId ? (
                <>
                  <Link
                    href={`/dashboard/homes/${fixedHomeId}/residents/departed`}
                    className="village-btn-secondary"
                  >
                    Departed residents
                  </Link>
                  <Link
                    href={`/dashboard/homes/${fixedHomeId}/residents/new`}
                    className="village-btn-primary inline-flex items-center justify-center"
                  >
                    Add resident
                  </Link>
                </>
              ) : (
                <Link
                  href={`/dashboard/homes/${urlState.homeId}/residents/new`}
                  className="village-btn-primary inline-flex items-center justify-center"
                >
                  Add resident
                </Link>
              )
            ) : null}
          </div>
          <button
            type="button"
            className="village-btn-secondary shrink-0"
            onClick={() => {
              void fetchResidents();
              router.refresh();
            }}
          >
            Refresh
          </button>
        </div>
      }
      filters={
        <>
          {!fixedHomeId && role === "admin" ? (
            <VillageListFilter
              label="Home"
              htmlFor="residents-directory-home"
              minWidth="12rem"
            >
              <VillageSelect
                id="residents-directory-home"
                value={urlState.homeId}
                onChange={(v) => {
                  navigate({ homeId: v, wardId: "", page: 1 });
                }}
                options={[
                  { value: "", label: "All homes" },
                  ...homes.map((h) => ({ value: h.id, label: h.name })),
                ]}
              />
            </VillageListFilter>
          ) : null}
          <VillageListFilter
            label="Name search"
            htmlFor="residents-directory-query"
          >
            <input
              id="residents-directory-query"
              className="village-input"
              value={urlState.query}
              onChange={(e) => {
                navigate({ query: e.target.value, page: 1 });
              }}
              placeholder="Partial name"
              autoComplete="off"
            />
          </VillageListFilter>
          <VillageListFilter
            label="Status"
            htmlFor="residents-directory-status"
            width="11rem"
          >
            <VillageSelect
              id="residents-directory-status"
              value={urlState.status}
              onChange={(v) =>
                navigate({
                  status: v as "active" | "departed" | "all",
                  page: 1,
                })
              }
              options={[
                { value: "active", label: "Active" },
                { value: "departed", label: "Departed" },
                { value: "all", label: "All" },
              ]}
            />
          </VillageListFilter>
          {effectiveHomeId ? (
            <VillageListFilter
              label="Ward"
              htmlFor="residents-directory-ward"
            >
              <VillageSelect
                id="residents-directory-ward"
                value={urlState.wardId}
                onChange={(v) => navigate({ wardId: v, page: 1 })}
                options={[
                  { value: "", label: "Any ward" },
                  ...wards.map((w) => ({ value: w.id, label: w.label })),
                ]}
              />
            </VillageListFilter>
          ) : null}
        </>
      }
      filtersCollapsible
      activeFilterCount={activeFilterCount}
      listTitle={null}
      loading={loading}
      error={error}
      pagination={
        residents != null
          ? {
              page: urlState.page,
              pageSize: urlState.pageSize,
              totalCount,
              onPrevious: () => navigate({ page: urlState.page - 1 }),
              onNext: () => navigate({ page: urlState.page + 1 }),
            }
          : undefined
      }
      paginationRangeTestId="residents-directory-range"
    >
      <table className="village-table" aria-label="Residents directory">
        <thead className="village-thead">
          <tr>
            <th className="village-th">Name</th>
            <th className="village-th">Home</th>
            <th className="village-th">DOB</th>
            <th className="village-th">Status</th>
            <th className="village-th">Detail</th>
          </tr>
        </thead>
        <tbody className="village-tbody">
          {!loading && residents && residents.length === 0 && totalCount === 0 ? (
            <VillageListEmpty
              colSpan={5}
              message="No residents match these filters."
            />
          ) : null}
          {!loading && residents && residents.length === 0 && totalCount > 0 ? (
            <VillageListEmpty
              colSpan={5}
              message="No residents on this page. Try another page."
            />
          ) : null}
          {residents?.map((r) => (
            <tr key={r.id}>
              <td className="village-td font-medium">{r.fullName}</td>
              <td className="village-td-muted">
                {homeNameById[r.homeId] ?? r.homeId}
              </td>
              <td className="village-td-muted">{r.dob}</td>
              <td className="village-td-muted">
                {r.status === "active" ? (
                  <span className="inline-flex items-center rounded-full bg-success-muted px-2 py-0.5 text-xs font-semibold text-success">
                    Active
                  </span>
                ) : (
                  <span className="inline-flex items-center rounded-full bg-[color-mix(in_srgb,var(--text-muted)_14%,transparent)] px-2 py-0.5 text-xs font-semibold text-[var(--text-secondary)]">
                    Departed
                  </span>
                )}
              </td>
              <td className="village-td">
                <Link
                  href={`/dashboard/homes/${r.homeId}/residents/${r.id}`}
                  className="village-link"
                >
                  Open
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </VillageList>
  );
}
