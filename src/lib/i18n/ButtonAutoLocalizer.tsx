"use client";

import { useLayoutEffect } from "react";
import type { AppLocale } from "./locales";
import { localizeDomButtons } from "./localizeDomButtons";

type ButtonAutoLocalizerProps = {
  locale: AppLocale;
};

export function ButtonAutoLocalizer({ locale }: ButtonAutoLocalizerProps) {
  useLayoutEffect(() => {
    let frame = 0;

    const run = () => {
      localizeDomButtons(document.body, locale);
    };

    run();

    const observer = new MutationObserver(() => {
      if (frame) cancelAnimationFrame(frame);
      frame = requestAnimationFrame(run);
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
    });

    return () => {
      observer.disconnect();
      if (frame) cancelAnimationFrame(frame);
    };
  }, [locale]);

  return null;
}
