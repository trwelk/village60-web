"use client";

import { usePathname, useSearchParams } from "next/navigation";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

type Phase = "hidden" | "running" | "finishing";

/** Skip bar for external links, malformed hrefs, or same path+search as now. */
function shouldSkipProgressForHref(href: string): boolean {
  let url: URL;
  try {
    url = new URL(href, window.location.origin);
  } catch {
    return true;
  }
  if (url.origin !== window.location.origin) return true;
  const next = `${url.pathname}${url.search}`;
  const current = `${window.location.pathname}${window.location.search}`;
  return next === current;
}

export function NavigationProgress() {
  const pathname = usePathname() ?? "";
  const searchParams = useSearchParams();
  const routeKey = `${pathname}?${searchParams?.toString() ?? ""}`;

  const [phase, setPhase] = useState<Phase>("hidden");
  const [animKey, setAnimKey] = useState(0);
  const routeKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (routeKeyRef.current === null) {
      routeKeyRef.current = routeKey;
      return;
    }
    if (routeKeyRef.current === routeKey) return;
    routeKeyRef.current = routeKey;
    setPhase((p) => (p === "running" ? "finishing" : p));
  }, [routeKey]);

  useEffect(() => {
    if (phase !== "finishing") return;
    const t = window.setTimeout(() => setPhase("hidden"), 360);
    return () => window.clearTimeout(t);
  }, [phase]);

  const startIfInternalNav = useCallback((target: EventTarget | null) => {
    if (!(target instanceof Element)) return;
    const a = target.closest("a[href]");
    if (!(a instanceof HTMLAnchorElement)) return;
    if (a.hasAttribute("data-skip-nav-progress")) return;
    if (a.target === "_blank" || a.download) return;
    const href = a.getAttribute("href");
    if (!href || href.startsWith("#")) return;
    if (
      /^mailto:/i.test(href) ||
      /^tel:/i.test(href) ||
      /^javascript:/i.test(href)
    ) {
      return;
    }
    if (shouldSkipProgressForHref(href)) return;
    setAnimKey((k) => k + 1);
    setPhase("running");
  }, []);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented) return;
      if (e.button !== 0) return;
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      startIfInternalNav(e.target);
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [startIfInternalNav]);

  useEffect(() => {
    const onPop = () => {
      setAnimKey((k) => k + 1);
      setPhase("running");
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  if (phase === "hidden") {
    return null;
  }

  return (
    <div
      className="village-nav-progress-root"
      data-phase={phase}
      aria-hidden
    >
      <div className="village-nav-progress-root__track">
        <div
          key={animKey}
          className="village-nav-progress-root__bar"
        />
      </div>
    </div>
  );
}
