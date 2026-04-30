import { afterEach, describe, expect, it, vi } from "vitest";
import { getAppTimezone, lastInstantOfMonthUtcMs } from "./appTimezone";

describe("getAppTimezone", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("defaults to UTC when APP_TIMEZONE is unset", () => {
    vi.stubEnv("APP_TIMEZONE", "");
    expect(getAppTimezone()).toBe("UTC");
  });

  it("computes the last instant of a month in UTC", () => {
    expect(lastInstantOfMonthUtcMs(2024, 2, "UTC")).toBe(
      Date.UTC(2024, 2, 1) - 1,
    );
  });

  it("computes the last instant of a month in a non-UTC timezone", () => {
    expect(lastInstantOfMonthUtcMs(2024, 2, "Pacific/Auckland")).toBe(
      Date.parse("2024-02-29T10:59:59.999Z"),
    );
  });
});
