import { describe, expect, it } from "vitest";
import {
  postedMsWithinRangeInclusive,
  resolvePostedLedgerDateRange,
  utcYearToDatePostedDateRange,
} from "./postedDateRange";

describe("utcYearToDatePostedDateRange", () => {
  it("spans January 1 through the UTC calendar day of atUtcMs", () => {
    const ms = Date.UTC(2026, 4, 9, 12, 0, 0); // May 9
    expect(utcYearToDatePostedDateRange(ms)).toEqual({
      postedFrom: "2026-01-01",
      postedTo: "2026-05-09",
    });
  });
});

describe("resolvePostedLedgerDateRange", () => {
  it("returns YTD when params are blank", () => {
    const at = Date.UTC(2026, 4, 9);
    expect(resolvePostedLedgerDateRange(undefined, "", at)).toEqual(
      utcYearToDatePostedDateRange(at),
    );
  });

  it("returns custom range when valid", () => {
    const at = Date.UTC(2026, 4, 9);
    expect(
      resolvePostedLedgerDateRange("2026-02-01", "2026-04-30", at),
    ).toEqual({ postedFrom: "2026-02-01", postedTo: "2026-04-30" });
  });

  it("falls back to YTD when from is after to", () => {
    const at = Date.UTC(2026, 4, 9);
    expect(resolvePostedLedgerDateRange("2026-06-01", "2026-01-01", at)).toEqual(
      utcYearToDatePostedDateRange(at),
    );
  });

  it("respects inclusivity helper", () => {
    expect(
      postedMsWithinRangeInclusive(
        Date.UTC(2026, 1, 15, 8, 0, 0),
        "2026-02-01",
        "2026-02-28",
      ),
    ).toBe(true);
    expect(
      postedMsWithinRangeInclusive(
        Date.UTC(2026, 0, 31, 23, 0, 0),
        "2026-02-01",
        "2026-02-28",
      ),
    ).toBe(false);
  });
});
