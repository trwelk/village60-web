import { describe, expect, it } from "vitest";
import {
  ProductionConfigError,
  assertSafeProductionConfig,
} from "./productionConfig";

describe("assertSafeProductionConfig", () => {
  it("no-ops when NODE_ENV is not production", () => {
    expect(() =>
      assertSafeProductionConfig({
        NODE_ENV: "development",
        ALLOW_INSECURE_SESSION_PASSWORD: "1",
      }),
    ).not.toThrow();
  });

  it("throws when production uses the insecure session password escape hatch", () => {
    expect(() =>
      assertSafeProductionConfig({
        NODE_ENV: "production",
        ALLOW_INSECURE_SESSION_PASSWORD: "1",
        SESSION_PASSWORD: "x".repeat(32),
      }),
    ).toThrow(ProductionConfigError);
  });

  it("throws when production has no SESSION_PASSWORD", () => {
    expect(() =>
      assertSafeProductionConfig({
        NODE_ENV: "production",
      }),
    ).toThrow(ProductionConfigError);
  });

  it("throws when production SESSION_PASSWORD is too short", () => {
    expect(() =>
      assertSafeProductionConfig({
        NODE_ENV: "production",
        SESSION_PASSWORD: "short",
      }),
    ).toThrow(ProductionConfigError);
  });

  it("allows production with a long SESSION_PASSWORD and no insecure flag", () => {
    expect(() =>
      assertSafeProductionConfig({
        NODE_ENV: "production",
        SESSION_PASSWORD: "a".repeat(32),
      }),
    ).not.toThrow();
  });
});
