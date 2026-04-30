"use client";

import { useDashboardWayfinding } from "@/app/dashboard/DashboardWayfinding";
import { buildResidentDetailBreadcrumbTrail } from "@/lib/dashboard/nestedBreadcrumbs";
import type { SessionUserRole } from "@/lib/session";
import { useLayoutEffect } from "react";

type ResidentBreadcrumbRegistrationProps = {
  homeId: string;
  homeLabel: string;
  residentId: string;
  residentLabel: string;
  role: SessionUserRole;
};

export function ResidentBreadcrumbRegistration({
  homeId,
  homeLabel,
  residentId,
  residentLabel,
  role,
}: ResidentBreadcrumbRegistrationProps) {
  const { setResidentBreadcrumbs } = useDashboardWayfinding();
  useLayoutEffect(() => {
    setResidentBreadcrumbs(
      buildResidentDetailBreadcrumbTrail({
        homeId,
        homeLabel,
        residentId,
        residentLabel,
        role,
      }),
    );
    return () => {
      setResidentBreadcrumbs(null);
    };
  }, [
    homeId,
    homeLabel,
    residentId,
    residentLabel,
    role,
    setResidentBreadcrumbs,
  ]);
  return null;
}
