"use client";

import type { NavCrumb } from "@/lib/dashboard/nestedBreadcrumbs";
import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type DashboardWayfindingValue = {
  homeBreadcrumbs: NavCrumb[] | null;
  setHomeBreadcrumbs: (c: NavCrumb[] | null) => void;
  residentBreadcrumbs: NavCrumb[] | null;
  setResidentBreadcrumbs: (c: NavCrumb[] | null) => void;
  activeBreadcrumbs: NavCrumb[] | null;
};



const defaultWayfinding: DashboardWayfindingValue = {
  homeBreadcrumbs: null,
  setHomeBreadcrumbs: () => {
    // No provider: nested breadcrumbs in tests or edge cases
  },
  residentBreadcrumbs: null,
  setResidentBreadcrumbs: () => {},
  activeBreadcrumbs: null,
};

const DashboardWayfindingContext =
  createContext<DashboardWayfindingValue>(defaultWayfinding);

export function DashboardWayfindingProvider({ children }: { children: ReactNode }) {
  const [homeBreadcrumbs, setHomeBreadcrumbs] = useState<NavCrumb[] | null>(null);
  const [residentBreadcrumbs, setResidentBreadcrumbs] = useState<
    NavCrumb[] | null
  >(null);
  const activeBreadcrumbs = residentBreadcrumbs ?? homeBreadcrumbs;
  const value = useMemo(
    () => ({
      homeBreadcrumbs,
      setHomeBreadcrumbs,
      residentBreadcrumbs,
      setResidentBreadcrumbs,
      activeBreadcrumbs,
    }),
    [homeBreadcrumbs, residentBreadcrumbs],
  );
  return (
    <DashboardWayfindingContext.Provider value={value}>
      {children}
    </DashboardWayfindingContext.Provider>
  );
}

export function useDashboardWayfinding(): DashboardWayfindingValue {
  return useContext(DashboardWayfindingContext);
}
