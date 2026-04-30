import { describe, expect, it } from "vitest";
import { calculateAge } from "./age";

describe("calculateAge", () => {
  it("returns age when birthday has already passed this year", () => {
    expect(calculateAge("2000-04-18", "2026-04-19")).toBe(26);
  });

  it("returns age when today is the birthday", () => {
    expect(calculateAge("2000-04-19", "2026-04-19")).toBe(26);
  });

  it("returns age minus one when birthday is still upcoming this year", () => {
    expect(calculateAge("2000-04-20", "2026-04-19")).toBe(25);
  });

  it("handles month boundary correctly", () => {
    expect(calculateAge("1990-12-31", "2026-01-01")).toBe(35);
    expect(calculateAge("1990-01-01", "2026-12-31")).toBe(36);
  });
});
