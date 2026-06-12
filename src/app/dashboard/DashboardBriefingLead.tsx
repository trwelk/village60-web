"use client";

import { useI18n } from "@/lib/i18n/I18nProvider";
import { useEffect, useState } from "react";

type DashboardBriefingLeadProps = {
  firstName: string;
  weekdayUtcLong: string;
};

function greetingKeyForLocalHour(hour: number): string {
  if (hour < 12) return "dashboard.goodMorning";
  if (hour < 17) return "dashboard.goodAfternoon";
  return "dashboard.goodEvening";
}

export function DashboardBriefingLead({
  firstName,
  weekdayUtcLong,
}: DashboardBriefingLeadProps) {
  const { t } = useI18n();
  const [greetingKey, setGreetingKey] = useState("dashboard.welcomeBack");

  useEffect(() => {
    const id = requestAnimationFrame(() => {
      setGreetingKey(greetingKeyForLocalHour(new Date().getHours()));
    });
    return () => cancelAnimationFrame(id);
  }, []);

  return (
    <div className="min-w-0">
      <p className="font-display text-[1.35rem] font-normal tracking-tight text-[var(--text-primary)] sm:text-[1.5rem]">
        {t(greetingKey)}, {firstName}
        <span className="text-[var(--text-muted)]"> — </span>
        <span className="text-[1.05rem] font-normal text-[var(--text-secondary)] sm:text-[1.1rem]">
          {t("dashboard.snapshotLead")} {weekdayUtcLong}{" "}
          {t("dashboard.snapshotTail")}
        </span>
      </p>
      <p className="village-muted mt-2 max-w-2xl text-xs leading-relaxed">
        {t("dashboard.utcCalendarHint")}
      </p>
    </div>
  );
}
