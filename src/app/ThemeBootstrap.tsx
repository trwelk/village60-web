"use client";

import { useLayoutEffect } from "react";
import { getVillage60CssVars } from "@/lib/theme/village60Theme";

export function ThemeBootstrap() {
  useLayoutEffect(() => {
    const root = document.documentElement;
    const cssVars = getVillage60CssVars();
    for (const [name, value] of Object.entries(cssVars)) {
      root.style.setProperty(name, value);
    }
    root.classList.add("light");
    root.classList.remove("dark");
  }, []);

  return null;
}
