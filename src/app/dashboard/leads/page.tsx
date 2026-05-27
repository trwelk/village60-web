import { redirect } from "next/navigation";

/** Old URL — canonical route is `/dashboard/waiting-list`. */
export default function DashboardLeadsRedirectPage() {
  redirect("/dashboard/waiting-list");
}
