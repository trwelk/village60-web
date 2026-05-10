import { ThemeEngine, type ThemeDescriptor } from "./themeEngine";

/** Default app theme id; change `themeId` in ThemeBootstrap to swap palettes. */
export const VILLAGE60_THEME_ID = "village60";

/**
 * Single source of truth for semantic + chart colors.
 * `globals.css` `:root` mirrors these values for SSR; keep them in sync when editing.
 *
 * Palette: high-contrast SaaS — white canvas, cool neutrals, violet brand, teal strip.
 */
export const village60ThemeDescriptor: ThemeDescriptor = {
  id: VILLAGE60_THEME_ID,
  metadata: {
    strictBrand: true,
  },
  core: {
    "--accent": "#6A3DE8",
    "--accent-strong": "#5429C9",
    "--highlight": "#8B5CF6",
    "--bg-canvas": "#FFFFFF",
    "--bg-elevated": "#FAFAFB",
    "--bg-muted": "#F4F4F6",
    "--text-primary": "#0F0F12",
    "--text-secondary": "#5C5C66",
    "--text-muted": "#8E8E98",
    "--line-strong": "#C8C8D0",
    "--line-subtle": "#E4E4E8",
    "--success": "#0D9F6E",
    "--danger": "#DC2626",
    "--chart-categorical-1": "#6A3DE8",
    "--chart-categorical-2": "#5B21B6",
    "--chart-categorical-3": "#0D9488",
    "--chart-categorical-4": "#7C6F9E",
    "--chart-categorical-5": "#94A3B8",
    "--chart-categorical-6": "#C4B5FD",
    "--chart-positive": "#0D9F6E",
    "--chart-negative": "#DC2626",
    "--chart-neutral": "#64748B",
  },
  aliases: {
    "--paper": "--bg-canvas",
    "--cream": "--bg-elevated",
    "--ink": "--text-primary",
    "--pine": "--accent",
    "--pine-2": "--text-primary",
    "--pine-soft": "--bg-muted",
    "--terracotta": "--accent-strong",
    "--terracotta-bright": "--highlight",
    "--sage": "--chart-categorical-5",
    "--warning": "#D97706",
    "--bg-soft": "#ECEDF0",
    "--partner-green": "#6366F1",
    "--card-accent-strip": "#0D9488",
    "--ring-focus": "0 0 0 3px color-mix(in srgb, var(--accent) 30%, transparent)",
    "--shadow-sm":
      "0 8px 18px -14px color-mix(in srgb, var(--text-primary) 28%, transparent)",
    "--shadow-md":
      "0 18px 38px -22px color-mix(in srgb, var(--text-primary) 24%, transparent)",
    "--shadow-lg":
      "0 28px 64px -30px color-mix(in srgb, var(--text-primary) 26%, transparent)",
  },
};

export const themeEngine = new ThemeEngine();
themeEngine.define(village60ThemeDescriptor);

export function resolveVillage60Theme() {
  return themeEngine.resolve({ themeId: VILLAGE60_THEME_ID });
}

export function getVillage60CssVars() {
  return themeEngine.toCssVars(resolveVillage60Theme());
}

export function getVillage60ChartPalette(kind: "bar" | "pie") {
  return themeEngine.toChartPalette(resolveVillage60Theme(), kind);
}
