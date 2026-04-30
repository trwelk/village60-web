import {
  DEFAULT_RESIDENTS_DIRECTORY_PAGE_SIZE,
  MAX_RESIDENTS_DIRECTORY_PAGE_SIZE,
} from "./service";

export type ResidentsDirectoryUrlState = {
  fixedHome: boolean;
  homeId: string;
  query: string;
  status: "active" | "departed" | "all";
  wardId: string;
  page: number;
  pageSize: number;
};

function parseResidentsPage(raw: string | null): number {
  if (raw === null || raw === "") {
    return 1;
  }
  const n = Number.parseInt(raw, 10);
  if (Number.isNaN(n) || n < 1) {
    return 1;
  }
  return n;
}

function parseResidentsPageSize(raw: string | null): number {
  if (raw === null || raw === "") {
    return DEFAULT_RESIDENTS_DIRECTORY_PAGE_SIZE;
  }
  const n = Number.parseInt(raw, 10);
  if (Number.isNaN(n) || n < 1) {
    return DEFAULT_RESIDENTS_DIRECTORY_PAGE_SIZE;
  }
  return Math.min(MAX_RESIDENTS_DIRECTORY_PAGE_SIZE, n);
}

export function residentsDirectoryStateFromSearchParams(
  sp: URLSearchParams,
  fixedHomeId: string | undefined,
): ResidentsDirectoryUrlState {
  const fixedHome = !!fixedHomeId;
  const rawStatus = sp.get("status");
  let status: "active" | "departed" | "all" = "active";
  if (rawStatus === "departed" || rawStatus === "all") {
    status = rawStatus;
  }

  return {
    fixedHome,
    homeId: fixedHome ? "" : (sp.get("homeId") ?? ""),
    query: sp.get("query") ?? "",
    status,
    wardId: sp.get("wardId") ?? "",
    page: parseResidentsPage(sp.get("page")),
    pageSize: parseResidentsPageSize(sp.get("pageSize")),
  };
}

/**
 * Deep link from admin occupancy heatmap ward tiles → residents directory.
 * Omits `page` so the directory defaults to the first page.
 */
export function buildOccupancyHeatmapWardResidentsQueryString(
  homeId: string,
  wardId: string,
): string {
  const p = new URLSearchParams();
  p.set("homeId", homeId);
  p.set("wardId", wardId);
  p.set("status", "active");
  return p.toString();
}

export function buildResidentsDirectoryQueryString(
  s: ResidentsDirectoryUrlState,
): string {
  const p = new URLSearchParams();
  if (!s.fixedHome && s.homeId) {
    p.set("homeId", s.homeId);
  }
  if (s.query.trim()) {
    p.set("query", s.query.trim());
  }
  if (s.status !== "active") {
    p.set("status", s.status);
  }
  if (s.wardId) {
    p.set("wardId", s.wardId);
  }
  if (s.page > 1) {
    p.set("page", String(s.page));
  }
  if (s.pageSize !== DEFAULT_RESIDENTS_DIRECTORY_PAGE_SIZE) {
    p.set("pageSize", String(s.pageSize));
  }
  return p.toString();
}
