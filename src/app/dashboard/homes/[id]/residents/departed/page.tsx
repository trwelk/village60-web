import { redirect } from "next/navigation";

type PageParams = { params: Promise<{ id: string }> };

/** Legacy URL; departed residents live under /dashboard/residents/departed. */
export default async function LegacyDepartedResidentsPage({ params }: PageParams) {
  const { id: homeId } = await params;
  redirect(
    `/dashboard/residents/departed?homeId=${encodeURIComponent(homeId)}`,
  );
}
