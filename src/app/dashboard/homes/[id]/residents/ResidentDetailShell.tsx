"use client";

import {
  residentDetailTabsForRole,
  resolveActiveTab,
  type TabId,
} from "@/lib/residents/tabs";
import type { SessionUserRole } from "@/lib/session";
import type { ResidentPublic } from "@/lib/residents/service";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { ResidentHeader } from "./ResidentHeader";
import { ResidentTabs } from "./ResidentTabs";
import { NokTab } from "./NokTab";
import { PoaTab } from "./PoaTab";
import { AssignedNurseTab } from "./AssignedNurseTab";
import { ConditionsTab } from "./ConditionsTab";
import { AllergiesTab } from "./AllergiesTab";
import { BillingTab } from "./BillingTab";
import { OtherChargeTab } from "./OtherChargeTab";

type WardOption = { id: string; label: string };
type CareStaffOption = { id: string; email: string };

type Props = {
  homeId: string;
  homeName: string;
  homeDefaultCurrencyCode: string;
  userRole: SessionUserRole;
  resident: ResidentPublic;
  wards: WardOption[];
  careStaffOptions: CareStaffOption[];
};

export function ResidentDetailShell({
  homeId,
  homeName,
  homeDefaultCurrencyCode,
  userRole,
  resident,
  wards,
  careStaffOptions,
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tabs = residentDetailTabsForRole(userRole);
  const activeTab = resolveActiveTab(searchParams.get("tab"), userRole);

  function handleTabChange(tab: TabId) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", tab);
    router.replace(`?${params.toString()}`);
  }

  const breadcrumbLinkClass =
    "font-semibold text-pine underline decoration-terracotta/35 underline-offset-[5px] transition hover:text-terracotta hover:decoration-terracotta/60";

  return (
    <main className="flex flex-col gap-8 text-ink">
      <div className="village-reveal flex flex-wrap items-center gap-2 text-sm text-ink/75">
        <Link
          href={`/dashboard/homes/${homeId}/residents`}
          className={breadcrumbLinkClass}
        >
          Residents at this home
        </Link>
        <span className="text-ink/30" aria-hidden>
          /
        </span>
        <span className="font-medium text-ink/85">{homeName}</span>
      </div>

      <div className="village-reveal village-reveal-delay-1">
        <ResidentHeader homeId={homeId} resident={resident} wards={wards} />
      </div>

      <div className="village-reveal village-reveal-delay-2">
        <ResidentTabs
          tabs={tabs}
          activeTab={activeTab}
          onTabChange={handleTabChange}
        />
      </div>

      <div
        role="tabpanel"
        className="village-reveal village-reveal-delay-3 village-card min-h-[12rem] p-6 sm:p-8"
      >
        {activeTab === "nok" && (
          <NokTab homeId={homeId} residentId={resident.id} resident={resident} />
        )}
        {activeTab === "poa" && (
          <PoaTab homeId={homeId} residentId={resident.id} resident={resident} />
        )}
        {activeTab === "assigned-nurse" && (
          <AssignedNurseTab
            homeId={homeId}
            residentId={resident.id}
            resident={resident}
            careStaffOptions={careStaffOptions}
          />
        )}
        {activeTab === "conditions" && (
          <ConditionsTab homeId={homeId} residentId={resident.id} />
        )}
        {activeTab === "allergies" && (
          <AllergiesTab homeId={homeId} residentId={resident.id} />
        )}
        {activeTab === "other-charge" && userRole === "admin" && (
          <OtherChargeTab
            homeId={homeId}
            residentId={resident.id}
            defaultCurrencyCode={homeDefaultCurrencyCode}
            admissionDate={resident.admissionDate}
          />
        )}
        {activeTab === "billing" && userRole === "admin" && (
          <BillingTab
            homeId={homeId}
            residentId={resident.id}
            defaultCurrencyCode={homeDefaultCurrencyCode}
          />
        )}
      </div>
    </main>
  );
}
