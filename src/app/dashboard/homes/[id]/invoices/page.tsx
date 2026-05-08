import { redirect } from "next/navigation";

type PageParams = { params: Promise<{ id: string }> };

/** Legacy URL; invoices live under /dashboard/invoices. */
export default async function LegacyHomeInvoicesPage({ params }: PageParams) {
  const { id: homeId } = await params;
  redirect(`/dashboard/invoices?homeId=${encodeURIComponent(homeId)}`);
}
