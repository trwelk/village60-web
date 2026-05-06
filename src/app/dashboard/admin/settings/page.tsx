import { getDb } from "@/db/client";
import { readMedicationOrderCoverageMonths } from "@/lib/medicationOrderSettings/service";
import { getSessionOptions, type SessionData } from "@/lib/session";
import { getIronSession } from "iron-session";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { MedicationOrderCoverageCard } from "./MedicationOrderCoverageCard";

export default async function DashboardAdminSettingsPage() {
  const session = await getIronSession<SessionData>(
    await cookies(),
    getSessionOptions(),
  );
  if (!session.userId) {
    redirect("/login");
  }
  if (session.role !== "admin") {
    redirect("/dashboard");
  }
  const initialMonths = readMedicationOrderCoverageMonths(getDb());
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 py-8 sm:px-6">
      <header className="flex flex-col gap-2">
        <h1 className="font-serif text-2xl font-semibold tracking-tight text-[var(--text-primary)]">
          Admin settings
        </h1>
        <p className="text-sm text-[var(--text-secondary)]">
          Global options that affect how the app behaves across all homes.
        </p>
      </header>
      <MedicationOrderCoverageCard initialMonths={initialMonths} />
    </div>
  );
}
