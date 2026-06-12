import { redirect } from "next/navigation";

type PageParams = { params: Promise<{ id: string; residentId: string }> };

/** Legacy URL; resident detail lives under /dashboard/residents/[residentId]. */
export default async function LegacyResidentDetailPage({ params }: PageParams) {
  const { residentId } = await params;
  redirect(`/dashboard/residents/${encodeURIComponent(residentId)}`);
}
