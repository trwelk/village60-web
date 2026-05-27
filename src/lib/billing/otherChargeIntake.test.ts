import { describe, expect, it } from "vitest";
import { ValidationError } from "@/lib/homes/errors";
import { parseCreateIntakeLine } from "./otherChargeIntake";

describe("parseCreateIntakeLine (17c)", () => {
  it("accepts zero amount", () => {
    expect(
      parseCreateIntakeLine(
        "registration",
        { amountMinor: 0 },
      ),
    ).toEqual({
      amountMinor: 0,
    });
  });

  it("accepts positive amount", () => {
    expect(
      parseCreateIntakeLine(
        "deposit",
        { amountMinor: 100 },
      ),
    ).toEqual({
      amountMinor: 100,
    });
  });

  it("rejects negative amount", () => {
    expect(() =>
      parseCreateIntakeLine(
        "deposit",
        { amountMinor: -100 },
      ),
    ).toThrow(ValidationError);
  });
});
