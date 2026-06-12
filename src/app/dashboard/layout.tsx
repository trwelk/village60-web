import { getDb } from "@/db/client";
import { DEFAULT_LOCALE } from "@/lib/i18n/locales";
import { I18nProvider } from "@/lib/i18n/I18nProvider";
import { getSessionOptions, type SessionData } from "@/lib/session";
import { getOwnProfile } from "@/lib/users/service";
import { getIronSession } from "iron-session";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { DashboardWayfindingProvider } from "./DashboardWayfinding";
import { DashboardAppShell } from "./DashboardAppShell";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getIronSession<SessionData>(
    await cookies(),
    getSessionOptions(),
  );
  if (!session.userId) {
    redirect("/login");
  }
  const email = session.email?.trim() || "Signed in";
  const role = session.role ?? "care";
  const profile = getOwnProfile(getDb(), session.userId);
  const preferredLocale = profile?.preferredLocale ?? DEFAULT_LOCALE;

  return (
    <div className="village-app-bg relative min-h-screen">
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 -z-10 opacity-[0.06] village-grain"
      />
      <I18nProvider initialLocale={preferredLocale}>
        <DashboardWayfindingProvider>
          <DashboardAppShell email={email} role={role}>
            {children}
          </DashboardAppShell>
        </DashboardWayfindingProvider>
      </I18nProvider>
    </div>
  );
}
