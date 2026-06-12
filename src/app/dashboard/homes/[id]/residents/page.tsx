import { redirect } from "next/navigation";

type PageParams = { params: Promise<{ id: string }> };

/** Legacy URL; residents directory is scoped via ?homeId= on /dashboard/residents. */
export default async function LegacyHomeResidentsPage({ params }: PageParams) {
  const { id: homeId } = await params;
  redirect(`/dashboard/residents?homeId=${encodeURIComponent(homeId)}`);
}
