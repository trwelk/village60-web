import { DEFAULT_SALARY_PAGE_SIZE, MAX_SALARY_PAGE_SIZE } from "./service";

export type SalariesDirectoryUrlState = {
  homeId: string;
  query: string;
  status: "active" | "inactive" | "";
  page: number;
  pageSize: number;
};

function parsePage(raw: string | null): number {
  if (!raw) return 1;
  const n = Number.parseInt(raw, 10);
  return Number.isNaN(n) || n < 1 ? 1 : n;
}

function parsePageSize(raw: string | null): number {
  if (!raw) return DEFAULT_SALARY_PAGE_SIZE;
  const n = Number.parseInt(raw, 10);
  if (Number.isNaN(n) || n < 1) return DEFAULT_SALARY_PAGE_SIZE;
  return Math.min(MAX_SALARY_PAGE_SIZE, n);
}

export function salariesDirectoryStateFromSearchParams(
  sp: URLSearchParams,
): SalariesDirectoryUrlState {
  const rawStatus = sp.get("status");
  let status: "active" | "inactive" | "" = "";
  if (rawStatus === "active" || rawStatus === "inactive") {
    status = rawStatus;
  }

  return {
    homeId: sp.get("homeId") ?? "",
    query: sp.get("query") ?? "",
    status,
    page: parsePage(sp.get("page")),
    pageSize: parsePageSize(sp.get("pageSize")),
  };
}

export function buildSalariesDirectoryQueryString(
  s: SalariesDirectoryUrlState,
): string {
  const p = new URLSearchParams();
  if (s.homeId) p.set("homeId", s.homeId);
  if (s.query.trim()) p.set("query", s.query.trim());
  if (s.status) p.set("status", s.status);
  if (s.page > 1) p.set("page", String(s.page));
  if (s.pageSize !== DEFAULT_SALARY_PAGE_SIZE) p.set("pageSize", String(s.pageSize));
  return p.toString();
}
