import { describe, expect, it } from "vitest";
import { buildDashboardLedgerPath } from "./dashboardLedgerPath";

describe("buildDashboardLedgerPath", () => {
  it("omits posted date params when the range matches YTD", () => {
    expect(
      buildDashboardLedgerPath(
        "h1",
        "2026-01-01",
        "2026-05-09",
        "2026-01-01",
        "2026-05-09",
      ),
    ).toBe("/dashboard/ledger?homeId=h1");
  });

  it("includes both date params for a custom range", () => {
    expect(
      buildDashboardLedgerPath(
        "h1",
        "2024-01-01",
        "2024-12-31",
        "2026-01-01",
        "2026-05-09",
      ),
    ).toBe(
      "/dashboard/ledger?homeId=h1&postedFrom=2024-01-01&postedTo=2024-12-31",
    );
  });

  it("adds resident param when resident is selected", () => {
    expect(
      buildDashboardLedgerPath(
        "h1",
        "2026-01-01",
        "2026-05-09",
        "2026-01-01",
        "2026-05-09",
        { residentId: "r2" },
      ),
    ).toBe("/dashboard/ledger?homeId=h1&resident=r2");
  });
});
