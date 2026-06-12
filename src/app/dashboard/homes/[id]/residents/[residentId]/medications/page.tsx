import { redirect } from "next/navigation";

type PageParams = {
  params: Promise<{ id: string; residentId: string }>;
};

/** Legacy URL; medications live under /dashboard/residents/[residentId]/medications. */
export default async function LegacyResidentMedicationsPage({
  params,
}: PageParams) {
  const { residentId } = await params;
  redirect(
    `/dashboard/residents/${encodeURIComponent(residentId)}/medications`,
  );
}
