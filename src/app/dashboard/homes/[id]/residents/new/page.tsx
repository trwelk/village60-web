import { redirect } from "next/navigation";

type PageParams = { params: Promise<{ id: string }> };

/** Legacy URL; new resident lives under /dashboard/residents/new. */
export default async function LegacyNewResidentPage({ params }: PageParams) {
  const { id: homeId } = await params;
  redirect(`/dashboard/residents/new?homeId=${encodeURIComponent(homeId)}`);
}
