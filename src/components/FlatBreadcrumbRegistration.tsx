"use client";

import { useDashboardWayfinding } from "@/app/dashboard/DashboardWayfinding";
import type { NavCrumb } from "@/lib/dashboard/nestedBreadcrumbs";
import { useLayoutEffect } from "react";

type FlatBreadcrumbRegistrationProps = {
  crumbs: NavCrumb[];
};

export function FlatBreadcrumbRegistration({
  crumbs,
}: FlatBreadcrumbRegistrationProps) {
  const { setHomeBreadcrumbs } = useDashboardWayfinding();
  useLayoutEffect(() => {
    setHomeBreadcrumbs(crumbs);
    return () => {
      setHomeBreadcrumbs(null);
    };
  }, [crumbs, setHomeBreadcrumbs]);
  return null;
}

type ResidentBreadcrumbRegistrationProps = {
  crumbs: NavCrumb[];
};

export function FlatResidentBreadcrumbRegistration({
  crumbs,
}: ResidentBreadcrumbRegistrationProps) {
  const { setResidentBreadcrumbs } = useDashboardWayfinding();
  useLayoutEffect(() => {
    setResidentBreadcrumbs(crumbs);
    return () => {
      setResidentBreadcrumbs(null);
    };
  }, [crumbs, setResidentBreadcrumbs]);
  return null;
}
