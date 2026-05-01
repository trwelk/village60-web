/**
 * When UI already shows a "Room" label, strip a leading "Room " from stored text
 * so we do not render "Room" twice (e.g. label + "Room 134").
 */
export function roomValueWithoutLeadingRoomLabel(roomText: string): string {
  const trimmed = roomText.trim();
  if (!trimmed) return trimmed;
  return trimmed.replace(/^\s*room\s+/i, "").trim() || trimmed;
}

/** Fragment for "Ward / Room …" summaries; returns null when empty. */
export function roomPlacementSegment(roomText: string): string | null {
  const t = roomText.trim();
  if (!t) return null;
  const inner = t.replace(/^\s*room\s+/i, "").trim();
  return inner.length > 0 ? inner : t;
}
