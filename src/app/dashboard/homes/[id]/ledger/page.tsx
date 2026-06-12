import { redirect } from "next/navigation";

type PageParams = { params: Promise<{ id: string }> };

/** Legacy URL; ledger lives under /dashboard/ledger. */
export default async function LegacyHomeLedgerPage({ params }: PageParams) {
  const { id: homeId } = await params;
  redirect(`/dashboard/ledger?homeId=${encodeURIComponent(homeId)}`);
}
