import { describe, expect, it } from "vitest";
import {
  defaultSlotsForServingsPerDay,
  parseScheduledSlots,
  resolveMedicationSlots,
  serializeScheduledSlots,
} from "./constants";

describe("mar constants", () => {
  it("parses scheduled slot json", () => {
    expect(parseScheduledSlots('["morning","evening"]')).toEqual([
      "morning",
      "evening",
    ]);
    expect(parseScheduledSlots("not-json")).toEqual([]);
  });

  it("derives default slots from servings per day", () => {
    expect(defaultSlotsForServingsPerDay(1)).toEqual(["morning"]);
    expect(defaultSlotsForServingsPerDay(4)).toEqual([
      "morning",
      "afternoon",
      "evening",
      "night",
    ]);
  });

  it("round-trips scheduled slots", () => {
    const slots = ["morning", "night"] as const;
    expect(parseScheduledSlots(serializeScheduledSlots([...slots]))).toEqual([
      ...slots,
    ]);
  });

  it("prefers explicit schedule over servings fallback", () => {
    expect(
      resolveMedicationSlots({
        scheduledSlots: serializeScheduledSlots(["afternoon"]),
        servingsPerDay: 4,
        prn: false,
      }),
    ).toEqual(["afternoon"]);
  });
});
