import { ThemeEngine, type ThemeDescriptor } from "./themeEngine";

export const ANTHROPIC_THEME_ID = "anthropic-strict";

const anthropicThemeDescriptor: ThemeDescriptor = {
  id: ANTHROPIC_THEME_ID,
  metadata: {
    strictBrand: true,
  },
  core: {
    "--accent": "#C96442",
    "--accent-strong": "#B45435",
    "--highlight": "#E08A62",
    "--bg-canvas": "#F6F3EE",
    "--bg-elevated": "#FFFCF8",
    "--bg-muted": "#EFE8DE",
    "--text-primary": "#1F1A15",
    "--text-secondary": "#4C433A",
    "--text-muted": "#6F665D",
    "--line-strong": "#CFC4B5",
    "--line-subtle": "#E4DBCE",
    "--success": "#3E8A63",
    "--danger": "#B85C4A",
    "--chart-categorical-1": "#C96442",
    "--chart-categorical-2": "#B45435",
    "--chart-categorical-3": "#8C6A4B",
    "--chart-categorical-4": "#D5A16D",
    "--chart-categorical-5": "#6F8A73",
    "--chart-categorical-6": "#A67C52",
    "--chart-positive": "#3E8A63",
    "--chart-negative": "#B85C4A",
    "--chart-neutral": "#8C7E70",
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
    "--warning": "#B67A3D",
    "--ring-focus": "0 0 0 3px color-mix(in srgb, var(--accent) 30%, transparent)",
    "--shadow-sm": "0 8px 18px -14px color-mix(in srgb, var(--text-primary) 28%, transparent)",
    "--shadow-md": "0 18px 38px -22px color-mix(in srgb, var(--text-primary) 24%, transparent)",
    "--shadow-lg": "0 28px 64px -30px color-mix(in srgb, var(--text-primary) 26%, transparent)",
  },
};

export const themeEngine = new ThemeEngine();
themeEngine.define(anthropicThemeDescriptor);

export function resolveAnthropicTheme() {
  return themeEngine.resolve({ themeId: ANTHROPIC_THEME_ID });
}

export function getAnthropicCssVars() {
  return themeEngine.toCssVars(resolveAnthropicTheme());
}

export function getAnthropicChartPalette(kind: "bar" | "pie") {
  return themeEngine.toChartPalette(resolveAnthropicTheme(), kind);
}
