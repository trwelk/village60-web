export const MAR_TIME_SLOTS = [
  "morning",
  "afternoon",
  "evening",
  "night",
] as const;

export type MarTimeSlot = (typeof MAR_TIME_SLOTS)[number];
export type MarSlot = MarTimeSlot | "prn";

export const MAR_SLOT_LABELS: Record<MarTimeSlot, string> = {
  morning: "Morning",
  afternoon: "Afternoon",
  evening: "Evening",
  night: "Night",
};

export function isMarTimeSlot(value: string): value is MarTimeSlot {
  return (MAR_TIME_SLOTS as readonly string[]).includes(value);
}

export function isMarSlot(value: string): value is MarSlot {
  return value === "prn" || isMarTimeSlot(value);
}

export function serializeScheduledSlots(slots: MarTimeSlot[]): string {
  return JSON.stringify(slots);
}

export function parseScheduledSlots(raw: string | null | undefined): MarTimeSlot[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (entry): entry is MarTimeSlot =>
        typeof entry === "string" && isMarTimeSlot(entry),
    );
  } catch {
    return [];
  }
}

/** Default slot assignment when legacy rows have servingsPerDay but no schedule. */
export function defaultSlotsForServingsPerDay(
  servingsPerDay: number | null,
): MarTimeSlot[] {
  if (servingsPerDay === 1) return ["morning"];
  if (servingsPerDay === 2) return ["morning", "evening"];
  if (servingsPerDay === 3) return ["morning", "afternoon", "evening"];
  return [...MAR_TIME_SLOTS];
}

export function resolveMedicationSlots(input: {
  scheduledSlots: string | null;
  servingsPerDay: number | null;
  prn: boolean;
}): MarTimeSlot[] {
  if (input.prn) return [];
  const explicit = parseScheduledSlots(input.scheduledSlots);
  if (explicit.length > 0) return explicit;
  return defaultSlotsForServingsPerDay(input.servingsPerDay);
}

export function normalizeScheduledSlotsInput(
  raw: unknown,
  prn: boolean,
): MarTimeSlot[] | null {
  if (prn) return null;
  if (raw === undefined || raw === null) {
    return null;
  }
  if (!Array.isArray(raw)) {
    throw new Error("scheduledSlots must be an array.");
  }
  const slots: MarTimeSlot[] = [];
  for (const entry of raw) {
    if (typeof entry !== "string" || !isMarTimeSlot(entry)) {
      throw new Error("scheduledSlots contains an invalid slot.");
    }
    if (!slots.includes(entry)) {
      slots.push(entry);
    }
  }
  if (slots.length === 0) {
    throw new Error("Select at least one time slot for scheduled medications.");
  }
  return slots;
}
