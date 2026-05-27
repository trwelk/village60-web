import type {
  AdminInterestLeadListItem,
  InterestLeadStatus,
  PublicInterestHomeOption,
} from "./service";
import { INTEREST_LEAD_STATUSES } from "./service";

/** UI labels for persisted status enums (Kanban + table selects). */
export const INTEREST_LEAD_STATUS_LABELS: Record<
  InterestLeadStatus,
  string
> = {
  new: "New",
  contacted: "Contacted",
  closed: "Completed",
  cancelled: "Disqualified",
};

/** Kanban column order: active pipeline first, then outcomes (won before lost). */
export const KANBAN_STAGE_ORDER = [
  "new",
  "contacted",
  "closed",
  "cancelled",
] as const satisfies readonly InterestLeadStatus[];

export type KanbanStageStatus = (typeof KANBAN_STAGE_ORDER)[number];

const STATUS_SET = new Set<string>(INTEREST_LEAD_STATUSES);

export type LeadGrowthHomeRow = {
  homeId: string;
  homeName: string;
  configuredBeds: number;
  residentCount: number;
  spareBeds: number;
  openPipelineCount: number;
};

export type LeadGrowthSnapshot = {
  countsByStatus: Record<InterestLeadStatus, number>;
  pipelineTotal: number;
  closedWon: number;
  cancelledLost: number;
  /** `closed` ÷ (`closed` + `cancelled`); null when there are no terminal enquiries. */
  winRatePercent: number | null;
  homeRows: LeadGrowthHomeRow[];
};

export function buildLeadGrowthSnapshot(
  leads: AdminInterestLeadListItem[],
  homes: PublicInterestHomeOption[],
  residentCountByHomeId: Record<string, number>,
): LeadGrowthSnapshot {
  const countsByStatus: Record<InterestLeadStatus, number> = {
    new: 0,
    contacted: 0,
    closed: 0,
    cancelled: 0,
  };

  const pipelineHomeCounts = new Map<string, number>();

  for (const lead of leads) {
    if (STATUS_SET.has(lead.status)) {
      countsByStatus[lead.status as InterestLeadStatus] += 1;
    }
    if (lead.status === "new" || lead.status === "contacted") {
      pipelineHomeCounts.set(
        lead.homeId,
        (pipelineHomeCounts.get(lead.homeId) ?? 0) + 1,
      );
    }
  }

  const pipelineTotal = countsByStatus.new + countsByStatus.contacted;
  const closedWon = countsByStatus.closed;
  const cancelledLost = countsByStatus.cancelled;
  const terminal = closedWon + cancelledLost;
  const winRatePercent =
    terminal > 0 ? Math.round((closedWon / terminal) * 100) : null;

  const homeRows: LeadGrowthHomeRow[] = homes
    .map((h) => {
      const residentCount = residentCountByHomeId[h.id] ?? 0;
      const spareBeds = Math.max(0, h.configuredBeds - residentCount);
      const openPipelineCount = pipelineHomeCounts.get(h.id) ?? 0;
      return {
        homeId: h.id,
        homeName: h.name,
        configuredBeds: h.configuredBeds,
        residentCount,
        spareBeds,
        openPipelineCount,
      };
    })
    .sort((a, b) => {
      if (b.openPipelineCount !== a.openPipelineCount) {
        return b.openPipelineCount - a.openPipelineCount;
      }
      return a.homeName.localeCompare(b.homeName);
    });

  return {
    countsByStatus,
    pipelineTotal,
    closedWon,
    cancelledLost,
    winRatePercent,
    homeRows,
  };
}

export function leadsInKanbanColumn(
  leads: AdminInterestLeadListItem[],
  status: InterestLeadStatus,
): AdminInterestLeadListItem[] {
  return [...leads]
    .filter((l) => l.status === status)
    .sort((a, b) => b.createdAtUtcMs - a.createdAtUtcMs);
}
