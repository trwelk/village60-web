import { describe, expect, it } from "vitest";
import {
  REQUIRED_CHART_TOKENS,
  REQUIRED_SEMANTIC_TOKENS,
  ThemeEngine,
  type CoreToken,
} from "./themeEngine";

function fullCore(seed = "#111111"): Record<CoreToken, string> {
  return Object.fromEntries(
    [...REQUIRED_SEMANTIC_TOKENS, ...REQUIRED_CHART_TOKENS].map((token) => [
      token,
      seed,
    ]),
  ) as Record<CoreToken, string>;
}

describe("ThemeEngine", () => {
  it("throws when required tokens are missing", () => {
    const engine = new ThemeEngine();
    engine.define({
      id: "bad-theme",
      core: {
        "--accent": "#c96442",
      },
    });

    expect(() => engine.resolve({ themeId: "bad-theme" })).toThrow(
      /missing required tokens/i,
    );
  });

  it("resolves aliases and exposes stable css vars", () => {
    const engine = new ThemeEngine();
    engine.define({
      id: "ok-theme",
      core: {
        ...fullCore("#222222"),
        "--accent": "#c96442",
        "--bg-canvas": "#f6f3ee",
      },
      aliases: {
        "--paper": "--bg-canvas",
        "--pine": "--accent",
      },
    });

    const theme = engine.resolve({ themeId: "ok-theme" });
    const vars = engine.toCssVars(theme);

    expect(vars["--paper"]).toBe("#f6f3ee");
    expect(vars["--pine"]).toBe("#c96442");
  });

  it("creates deterministic chart palettes", () => {
    const engine = new ThemeEngine();
    engine.define({
      id: "chart-theme",
      core: {
        ...fullCore("#333333"),
        "--chart-categorical-1": "#111111",
        "--chart-categorical-2": "#222222",
        "--chart-categorical-3": "#333333",
        "--chart-categorical-4": "#444444",
        "--chart-categorical-5": "#555555",
        "--chart-categorical-6": "#666666",
        "--chart-positive": "#00aa00",
        "--chart-negative": "#aa0000",
        "--chart-neutral": "#999999",
      },
    });

    const resolved = engine.resolve({ themeId: "chart-theme" });
    const pie = engine.toChartPalette(resolved, "pie");
    const bar = engine.toChartPalette(resolved, "bar");

    expect(pie.series).toEqual([
      "#111111",
      "#222222",
      "#333333",
      "#444444",
      "#555555",
      "#666666",
    ]);
    expect(bar.series).toEqual(["#111111", "#222222", "#333333"]);
    expect(bar.positive).toBe("#00aa00");
    expect(bar.negative).toBe("#aa0000");
    expect(bar.neutral).toBe("#999999");
  });
});
