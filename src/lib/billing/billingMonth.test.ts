import { describe, expect, it, vi } from "vitest";
import {
  resolveLedgerBillingMonthRange,
  utcBillingMonthFromMs,
  utcYearToDateBillingMonthRange,
} from "./billingMonth";

describe("billingMonth", () => {
  it("utcYearToDateBillingMonthRange spans January through the month of atUtcMs", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(Date.UTC(2026, 3, 15, 12, 0, 0)));
    expect(utcYearToDateBillingMonthRange(Date.now())).toEqual({
      billingMonthFrom: "2026-01",
      billingMonthTo: "2026-04",
    });
    vi.useRealTimers();
  });

  it("utcBillingMonthFromMs matches UTC calendar month", () => {
    const ms = Date.UTC(2026, 0, 31, 23, 59, 59);
    expect(utcBillingMonthFromMs(ms)).toBe("2026-01");
  });
});

describe("resolveLedgerBillingMonthRange", () => {
  it("returns year-to-date when either bound is missing", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(Date.UTC(2026, 3, 15, 12, 0, 0)));
    const ytd = utcYearToDateBillingMonthRange(Date.now());
    expect(resolveLedgerBillingMonthRange(undefined, undefined, Date.now())).toEqual(
      ytd,
    );
    expect(
      resolveLedgerBillingMonthRange("2025-01", undefined, Date.now()),
    ).toEqual(ytd);
    expect(
      resolveLedgerBillingMonthRange(undefined, "2025-03", Date.now()),
    ).toEqual(ytd);
    vi.useRealTimers();
  });

  it("uses the requested range when both bounds are valid and in order", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(Date.UTC(2026, 3, 15, 12, 0, 0)));
    expect(
      resolveLedgerBillingMonthRange("2025-01", "2025-03", Date.now()),
    ).toEqual({
      billingMonthFrom: "2025-01",
      billingMonthTo: "2025-03",
    });
    vi.useRealTimers();
  });

  it("returns year-to-date when from is after to, or a month is invalid, or span is too long", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(Date.UTC(2026, 3, 15, 12, 0, 0)));
    const ytd = utcYearToDateBillingMonthRange(Date.now());
    expect(
      resolveLedgerBillingMonthRange("2025-04", "2025-01", Date.now()),
    ).toEqual(ytd);
    expect(
      resolveLedgerBillingMonthRange("not-a-month", "2025-01", Date.now()),
    ).toEqual(ytd);
    /* 37 months: 2023-01 .. 2026-01 */
    expect(
      resolveLedgerBillingMonthRange("2023-01", "2026-01", Date.now()),
    ).toEqual(ytd);
    vi.useRealTimers();
  });

  it("treats whitespace-only as missing and falls back to YTD", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(Date.UTC(2026, 3, 15, 12, 0, 0)));
    const ytd = utcYearToDateBillingMonthRange(Date.now());
    expect(resolveLedgerBillingMonthRange("  ", "2025-01", Date.now())).toEqual(
      ytd,
    );
    expect(resolveLedgerBillingMonthRange("2025-01", "  ", Date.now())).toEqual(
      ytd,
    );
    vi.useRealTimers();
  });
});
