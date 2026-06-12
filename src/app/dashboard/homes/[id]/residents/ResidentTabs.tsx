"use client";

import { useI18n } from "@/lib/i18n/I18nProvider";
import type { Tab, TabId } from "@/lib/residents/tabs";

type Props = {
  tabs: Tab[];
  activeTab: TabId;
  onTabChange: (id: TabId) => void;
};

export function ResidentTabs({ tabs, activeTab, onTabChange }: Props) {
  const { t } = useI18n();

  return (
    <div
      className="village-tablist"
      role="tablist"
      aria-label={t("sections.residentSections")}
    >
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          data-testid={`resident-tab-${tab.id}`}
          aria-selected={activeTab === tab.id}
          className={
            activeTab === tab.id ? "village-tab village-tab-active" : "village-tab"
          }
          onClick={() => onTabChange(tab.id)}
        >
          {t(tab.labelKey)}
        </button>
      ))}
    </div>
  );
}
