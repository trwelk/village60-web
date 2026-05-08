import { redirect } from "next/navigation";

type PageParams = { params: Promise<{ id: string; invoiceId: string }> };

/** Legacy URL; invoices live under /dashboard/invoices. */
export default async function LegacyHomeInvoiceDetailPage({ params }: PageParams) {
  const { id: homeId, invoiceId } = await params;
  redirect(
    `/dashboard/invoices/${encodeURIComponent(invoiceId)}?homeId=${encodeURIComponent(homeId)}`,
  );
}
