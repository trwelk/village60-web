"use client";

import { useEffect, useState } from "react";

type DashboardBriefingLeadProps = {
  firstName: string;
  weekdayUtcLong: string;
};

function greetingForLocalHour(hour: number): string {
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

export function DashboardBriefingLead({
  firstName,
  weekdayUtcLong,
}: DashboardBriefingLeadProps) {
  const [greeting, setGreeting] = useState("Welcome back");

  useEffect(() => {
    const id = requestAnimationFrame(() => {
      setGreeting(greetingForLocalHour(new Date().getHours()));
    });
    return () => cancelAnimationFrame(id);
  }, []);

  return (
    <div className="min-w-0">
      <p className="font-display text-[1.35rem] font-normal tracking-tight text-[var(--text-primary)] sm:text-[1.5rem]">
        {greeting}, {firstName}
        <span className="text-[var(--text-muted)]"> — </span>
        <span className="text-[1.05rem] font-normal text-[var(--text-secondary)] sm:text-[1.1rem]">
          here&apos;s your {weekdayUtcLong} snapshot
        </span>
      </p>
      <p className="village-muted mt-2 max-w-2xl text-xs leading-relaxed">
        Calendar counts below use UTC dates (same rules as tasks and birthday
        reminders).
      </p>
    </div>
  );
}
