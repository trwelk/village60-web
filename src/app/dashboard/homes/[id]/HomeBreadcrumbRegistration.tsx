"use client";

import { useDashboardWayfinding } from "@/app/dashboard/DashboardWayfinding";
import { isHomeResidentDetailPath } from "@/lib/dashboard/dashboardPaths";
import { buildHomeAreaBreadcrumbTrail } from "@/lib/dashboard/nestedBreadcrumbs";
import type { SessionUserRole } from "@/lib/session";
import { usePathname } from "next/navigation";
import { useLayoutEffect } from "react";

type HomeBreadcrumbRegistrationProps = {
  homeId: string;
  homeLabel: string;
  role: SessionUserRole;
};

export function HomeBreadcrumbRegistration({
  homeId,
  homeLabel,
  role,
}: HomeBreadcrumbRegistrationProps) {
  const pathname = usePathname() ?? "";
  const { setHomeBreadcrumbs } = useDashboardWayfinding();
  useLayoutEffect(() => {
    if (isHomeResidentDetailPath(pathname)) {
      setHomeBreadcrumbs(null);
      return () => {
        setHomeBreadcrumbs(null);
      };
    }
    const trail = buildHomeAreaBreadcrumbTrail(pathname, {
      homeId,
      homeLabel,
      role,
    });
    setHomeBreadcrumbs(trail);
    return () => {
      setHomeBreadcrumbs(null);
    };
  }, [pathname, homeId, homeLabel, role, setHomeBreadcrumbs]);
  return null;
}
