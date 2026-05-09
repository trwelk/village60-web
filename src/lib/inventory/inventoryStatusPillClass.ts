/**
 * Tailwind class strings for purchase-order header and line status pills.
 * Kept in one place so list and detail views stay visually consistent.
 */
export function inventoryStatusPillClass(status: string): string {
  const normalized = status.trim().toUpperCase();
  if (normalized === "DRAFT") {
    return "border-amber-500/55 bg-amber-50 text-amber-800";
  }
  if (normalized === "APPROVED") {
    return "border-sky-500/55 bg-sky-50 text-sky-800";
  }
  if (normalized === "SENT") {
    return "border-indigo-500/55 bg-indigo-50 text-indigo-800";
  }
  if (normalized === "CLOSED") {
    return "border-emerald-500/55 bg-emerald-50 text-emerald-800";
  }
  if (normalized === "OPEN") {
    return "border-slate-400/55 bg-slate-50 text-slate-800";
  }
  if (normalized === "CANCELED") {
    return "border-rose-500/55 bg-rose-50 text-rose-800";
  }
  if (normalized === "RECEIVED") {
    return "border-teal-500/55 bg-teal-50 text-teal-800";
  }
  if (normalized === "PARTIALLY_RECEIVED") {
    return "border-violet-500/55 bg-violet-50 text-violet-800";
  }
  return "border-[color:color-mix(in_srgb,var(--line-strong)_54%,transparent)] bg-[color:color-mix(in_srgb,var(--bg-muted)_88%,transparent)] text-[var(--text-secondary)]";
}
