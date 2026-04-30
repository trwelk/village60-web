import { getSessionOptions, type SessionData } from "@/lib/session";
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

  return (
    <div className="village-app-bg relative min-h-screen">
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 -z-10 opacity-[0.06] village-grain"
      />
      <DashboardWayfindingProvider>
        <DashboardAppShell email={email} role={role}>
          {children}
        </DashboardAppShell>
      </DashboardWayfindingProvider>
    </div>
  );
}
