"use client";

import { useLayoutEffect } from "react";
import { getAnthropicCssVars } from "@/lib/theme/anthropicTheme";

export function ThemeBootstrap() {
  useLayoutEffect(() => {
    const root = document.documentElement;
    const cssVars = getAnthropicCssVars();
    for (const [name, value] of Object.entries(cssVars)) {
      root.style.setProperty(name, value);
    }
    root.classList.add("light");
    root.classList.remove("dark");
  }, []);

  return null;
}
