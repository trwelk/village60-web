"use client";

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

export function ResidentsDirectoryUI({ homes, role, fixedHomeId }: Props) {
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

  const from =
    totalCount === 0
      ? 0
      : (urlState.page - 1) * urlState.pageSize + 1;
  const to = Math.min(urlState.page * urlState.pageSize, totalCount);
  const canPrev = urlState.page > 1;
  const canNext = urlState.page * urlState.pageSize < totalCount;

  return (
    <main className="flex flex-col gap-8 text-ink">
      <header className="flex flex-wrap items-start justify-between gap-6">
        <div>
          <h1 className="font-display text-3xl font-normal tracking-tight text-pine-2">
            Residents
          </h1>
          <p className="mt-2 max-w-3xl text-sm text-ink/70">
            Search and filter the directory. Default shows active residents only.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {fixedHomeId ? (
            <>
              <Link
                href={`/dashboard/homes/${fixedHomeId}/residents/departed`}
                className="village-btn-secondary"
              >
                Departed residents
              </Link>
              <Link
                href={`/dashboard/homes/${fixedHomeId}/residents?newResident=1`}
                className="village-btn-primary"
              >
                Add resident
              </Link>
            </>
          ) : role === "admin" && urlState.homeId ? (
            <Link
              href={`/dashboard/homes/${urlState.homeId}/residents?newResident=1`}
              className="village-btn-primary"
            >
              Add resident
            </Link>
          ) : null}
        </div>
      </header>

      <section className="village-card p-6 sm:p-8">
        <h2 className="village-section-title">Filters</h2>
        <div className="mt-5 flex flex-col gap-4 md:flex-row md:flex-wrap md:items-end">
          {!fixedHomeId && role === "admin" ? (
            <label className="flex min-w-[12rem] flex-1 flex-col gap-1.5 text-sm">
              <span className="village-field-label">Home</span>
              <VillageSelect
                value={urlState.homeId}
                onChange={(v) => {
                  navigate({ homeId: v, wardId: "", page: 1 });
                }}
                options={[
                  { value: "", label: "All homes" },
                  ...homes.map((h) => ({ value: h.id, label: h.name })),
                ]}
              />
            </label>
          ) : null}
          <label className="flex min-w-[10rem] flex-1 flex-col gap-1.5 text-sm">
            <span className="village-field-label">Name search</span>
            <input
              className="village-input"
              value={urlState.query}
              onChange={(e) => {
                navigate({ query: e.target.value, page: 1 });
              }}
              placeholder="Partial name"
              autoComplete="off"
            />
          </label>
          <label className="flex w-full flex-col gap-1.5 text-sm sm:w-44">
            <span className="village-field-label">Status</span>
            <VillageSelect
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
          </label>
          {effectiveHomeId ? (
            <label className="flex min-w-[10rem] flex-1 flex-col gap-1.5 text-sm">
              <span className="village-field-label">Ward</span>
              <VillageSelect
                value={urlState.wardId}
                onChange={(v) => navigate({ wardId: v, page: 1 })}
                options={[
                  { value: "", label: "Any ward" },
                  ...wards.map((w) => ({ value: w.id, label: w.label })),
                ]}
              />
            </label>
          ) : null}
          <button
            type="button"
            className="village-btn-secondary"
            onClick={() => {
              void fetchResidents();
              router.refresh();
            }}
          >
            Refresh
          </button>
        </div>
      </section>

      {error ? <p className="village-alert-error">{error}</p> : null}

      <section aria-busy={loading}>
        <h2 className="village-section-title">
          {loading ? "Loading…" : "Directory"}
        </h2>
        {!loading && residents ? (
          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p
              className="text-sm text-ink/70"
              data-testid="residents-directory-range"
            >
              {totalCount === 0
                ? "Showing 0 of 0"
                : `Showing ${from}–${to} of ${totalCount}`}
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="rounded border border-pine/25 bg-cream px-3 py-1.5 text-sm text-ink hover:bg-cream/80 disabled:cursor-not-allowed disabled:opacity-40"
                disabled={!canPrev || loading}
                aria-label="Previous page of residents"
                onClick={() => navigate({ page: urlState.page - 1 })}
              >
                Previous
              </button>
              <button
                type="button"
                className="rounded border border-pine/25 bg-cream px-3 py-1.5 text-sm text-ink hover:bg-cream/80 disabled:cursor-not-allowed disabled:opacity-40"
                disabled={!canNext || loading}
                aria-label="Next page of residents"
                onClick={() => navigate({ page: urlState.page + 1 })}
              >
                Next
              </button>
            </div>
          </div>
        ) : null}
        <div className="village-table-wrap mt-4">
          <table
            className="village-table"
            aria-label="Residents directory"
          >
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
              {!loading &&
              residents &&
              residents.length === 0 &&
              totalCount === 0 ? (
                <tr>
                  <td colSpan={5} className="village-td-muted py-10 text-center">
                    No residents match these filters.
                  </td>
                </tr>
              ) : null}
              {!loading && residents && residents.length === 0 && totalCount > 0 ? (
                <tr>
                  <td colSpan={5} className="village-td-muted py-10 text-center">
                    No residents on this page. Try another page.
                  </td>
                </tr>
              ) : null}
              {residents?.map((r) => (
                <tr key={r.id}>
                  <td className="village-td font-medium">{r.fullName}</td>
                  <td className="village-td-muted">
                    {homeNameById[r.homeId] ?? r.homeId}
                  </td>
                  <td className="village-td-muted">{r.dob}</td>
                  <td className="village-td-muted">
                    {r.status === "active" ? "Active" : "Departed"}
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
        </div>
      </section>
    </main>
  );
}
