import { redirect } from "next/navigation";

type PageParams = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ date?: string }>;
};

/** Legacy URL; MAR lives under /dashboard/mar. */
export default async function LegacyHomeMarPage({
  params,
  searchParams,
}: PageParams) {
  const { id: homeId } = await params;
  const sp = await searchParams;
  const qs = new URLSearchParams({ homeId });
  if (sp.date) {
    qs.set("date", sp.date);
  }
  redirect(`/dashboard/mar?${qs.toString()}`);
}
