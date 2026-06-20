import type { TranslateFn } from "./messages";

export function translateInvoiceStatus(
  t: TranslateFn,
  status: string,
): string {
  const key = status.trim().toLowerCase();
  if (key === "draft") return t("common.draft");
  if (key === "finalized") return t("common.finalized");
  if (key === "paid") return t("common.paid");
  return status;
}
