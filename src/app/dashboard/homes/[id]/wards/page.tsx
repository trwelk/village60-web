import { redirect } from "next/navigation";

type PageParams = { params: Promise<{ id: string }> };

/** Legacy URL; wards live under /dashboard/wards. */
export default async function LegacyHomeWardsPage({ params }: PageParams) {
  const { id: homeId } = await params;
  redirect(`/dashboard/wards?homeId=${encodeURIComponent(homeId)}`);
}
