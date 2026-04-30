import { describe, expect, it } from "vitest";
import {
  DASHBOARD_SIDEBAR_EXPANDED_KEY,
  readSidebarExpandedFromStorage,
  writeSidebarExpandedToStorage,
} from "./sidebarExpandedStorage";

describe("sidebarExpandedStorage", () => {
  it("uses the agreed localStorage key", () => {
    expect(DASHBOARD_SIDEBAR_EXPANDED_KEY).toBe(
      "village60.dashboard.sidebarExpanded",
    );
  });

  it("defaults to expanded when no value is stored", () => {
    expect(readSidebarExpandedFromStorage(null)).toBe(true);
  });

  it("round-trips false and true", () => {
    expect(readSidebarExpandedFromStorage(writeSidebarExpandedToStorage(false))).toBe(
      false,
    );
    expect(readSidebarExpandedFromStorage(writeSidebarExpandedToStorage(true))).toBe(
      true,
    );
  });

  it("defaults to expanded for unexpected stored values", () => {
    expect(readSidebarExpandedFromStorage("")).toBe(true);
    expect(readSidebarExpandedFromStorage("maybe")).toBe(true);
  });
});
