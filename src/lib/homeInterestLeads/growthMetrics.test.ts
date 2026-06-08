import { describe, expect, it } from "vitest";
import { buildLeadGrowthSnapshot, leadsInKanbanColumn } from "./growthMetrics";
import type { AdminInterestLeadListItem, PublicInterestHomeOption } from "./service";

const baseLead = (
  overrides: Partial<AdminInterestLeadListItem> &
    Pick<AdminInterestLeadListItem, "id" | "status" | "homeId">,
): AdminInterestLeadListItem => ({
  createdAtUtcMs: 1,
  updatedAtUtcMs: 1,
  contactName: "X",
  phone: "0",
  email: null,
  note: null,
  homeNameSnapshot: "H",
  homeAddressSnapshot: null,
  source: "web",
  ...overrides,
});

describe("buildLeadGrowthSnapshot", () => {
  const homes: PublicInterestHomeOption[] = [
    { id: "h1", name: "Maple", address: null, configuredBeds: 10 },
    { id: "h2", name: "Oak", address: null, configuredBeds: 8 },
  ];

  it("counts pipeline, terminal outcomes, and win rate", () => {
    const leads: AdminInterestLeadListItem[] = [
      baseLead({ id: "a", homeId: "h1", status: "new", createdAtUtcMs: 300 }),
      baseLead({ id: "b", homeId: "h1", status: "contacted", createdAtUtcMs: 200 }),
      baseLead({ id: "c", homeId: "h2", status: "closed", createdAtUtcMs: 100 }),
      baseLead({ id: "d", homeId: "h2", status: "cancelled", createdAtUtcMs: 50 }),
    ];
    const snap = buildLeadGrowthSnapshot(leads, homes, {
      h1: 6,
      h2: 8,
    });
    expect(snap.pipelineTotal).toBe(2);
    expect(snap.closedWon).toBe(1);
    expect(snap.cancelledLost).toBe(1);
    expect(snap.winRatePercent).toBe(50);
    expect(snap.countsByStatus).toEqual({
      new: 1,
      contacted: 1,
      closed: 1,
      cancelled: 1,
    });
  });

  it("returns null win rate when there are no terminal enquiries", () => {
    const leads: AdminInterestLeadListItem[] = [
      baseLead({ id: "a", homeId: "h1", status: "new" }),
    ];
    const snap = buildLeadGrowthSnapshot(leads, homes, { h1: 0, h2: 0 });
    expect(snap.winRatePercent).toBeNull();
  });

  it("sorts home rows by open pipeline then name", () => {
    const leads: AdminInterestLeadListItem[] = [
      baseLead({ id: "a", homeId: "h2", status: "new" }),
      baseLead({ id: "b", homeId: "h2", status: "contacted" }),
      baseLead({ id: "c", homeId: "h1", status: "new" }),
    ];
    const snap = buildLeadGrowthSnapshot(leads, homes, { h1: 1, h2: 2 });
    expect(snap.homeRows.map((r) => r.homeId)).toEqual(["h2", "h1"]);
    const oak = snap.homeRows.find((r) => r.homeId === "h2")!;
    expect(oak.openPipelineCount).toBe(2);
    expect(oak.spareBeds).toBe(6);
  });
});

describe("leadsInKanbanColumn", () => {
  it("filters and sorts newest first", () => {
    const leads: AdminInterestLeadListItem[] = [
      baseLead({
        id: "old",
        homeId: "h1",
        status: "new",
        createdAtUtcMs: 100,
      }),
      baseLead({
        id: "new",
        homeId: "h1",
        status: "new",
        createdAtUtcMs: 400,
      }),
    ];
    const col = leadsInKanbanColumn(leads, "new");
    expect(col.map((l) => l.id)).toEqual(["new", "old"]);
  });
});
