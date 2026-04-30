import { describe, expect, it } from "vitest";
import {
  buildOccupancyHeatmapWardResidentsQueryString,
  buildResidentsDirectoryQueryString,
  residentsDirectoryStateFromSearchParams,
} from "./directoryPath";

describe("occupancy heatmap → residents directory (26b)", () => {
  it("builds query string with homeId, wardId, status=active, and no page (first page)", () => {
    expect(
      buildOccupancyHeatmapWardResidentsQueryString("home-1", "ward-2"),
    ).toBe("homeId=home-1&wardId=ward-2&status=active");
  });

  it("parses back into directory URL state on page 1 with active status", () => {
    const qs = buildOccupancyHeatmapWardResidentsQueryString("h-a", "w-b");
    const sp = new URLSearchParams(qs);
    const state = residentsDirectoryStateFromSearchParams(sp, undefined);
    expect(state.homeId).toBe("h-a");
    expect(state.wardId).toBe("w-b");
    expect(state.status).toBe("active");
    expect(state.page).toBe(1);
    const rebuilt = buildResidentsDirectoryQueryString(state);
    expect(rebuilt).toContain("homeId=h-a");
    expect(rebuilt).toContain("wardId=w-b");
    expect(rebuilt).not.toContain("page=");
  });

  it("preserves newResident=1 when parsing and rebuilding directory URLs", () => {
    const sp = new URLSearchParams("newResident=1&query=Jane");
    const fixedHomeState = residentsDirectoryStateFromSearchParams(sp, "home-1");
    expect(fixedHomeState.newResident).toBe(true);
    expect(buildResidentsDirectoryQueryString(fixedHomeState)).toContain(
      "newResident=1",
    );

    const adminState = residentsDirectoryStateFromSearchParams(sp, undefined);
    expect(adminState.newResident).toBe(true);
    expect(buildResidentsDirectoryQueryString(adminState)).toContain(
      "newResident=1",
    );
  });
});
