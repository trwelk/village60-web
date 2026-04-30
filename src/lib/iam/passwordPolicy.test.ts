import { describe, expect, it } from "vitest";
import { ValidationError } from "@/lib/homes/errors";
import { validatePasswordPolicy } from "./passwordPolicy";

describe("validatePasswordPolicy", () => {
  it("accepts a strong password", () => {
    expect(() =>
      validatePasswordPolicy("ChangeMeNow!1"),
    ).not.toThrow();
  });

  it("rejects short passwords", () => {
    expect(() => validatePasswordPolicy("Short!1a")).toThrow(ValidationError);
  });
});
