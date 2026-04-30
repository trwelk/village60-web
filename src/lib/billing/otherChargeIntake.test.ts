import { describe, expect, it } from "vitest";
import { ValidationError } from "@/lib/homes/errors";
import { parseCreateIntakeLine } from "./otherChargeIntake";

describe("parseCreateIntakeLine (17c)", () => {
  const adm = "2025-06-01";

  it("accepts zero amount and not received without paid on", () => {
    expect(
      parseCreateIntakeLine(
        "registration",
        { amountMinor: 0, received: false },
        adm,
      ),
    ).toEqual({
      amountMinor: 0,
      received: false,
      paidOn: null,
    });
  });

  it("defaults paid on to admission date when received and paid on omitted", () => {
    expect(
      parseCreateIntakeLine(
        "deposit",
        { amountMinor: 100, received: true },
        adm,
      ),
    ).toEqual({
      amountMinor: 100,
      received: true,
      paidOn: "2025-06-01",
    });
  });

  it("uses explicit paid on when received", () => {
    expect(
      parseCreateIntakeLine(
        "registration",
        { amountMinor: 50, received: true, paidOn: "2024-12-31" },
        adm,
      ),
    ).toEqual({
      amountMinor: 50,
      received: true,
      paidOn: "2024-12-31",
    });
  });

  it("rejects paid on when not received", () => {
    expect(() =>
      parseCreateIntakeLine(
        "deposit",
        { amountMinor: 0, received: false, paidOn: "2024-01-01" },
        adm,
      ),
    ).toThrow(ValidationError);
  });

  it("rejects explicit null paid on when received", () => {
    expect(() =>
      parseCreateIntakeLine(
        "registration",
        { amountMinor: 0, received: true, paidOn: null },
        adm,
      ),
    ).toThrow(ValidationError);
  });
});
