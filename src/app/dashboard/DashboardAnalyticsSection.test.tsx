// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DashboardAnalyticsSection } from "./DashboardAnalyticsSection";

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
  }),
}));

describe("DashboardAnalyticsSection", () => {
  it("renders nothing for care users", () => {
    render(
      <DashboardAnalyticsSection
        role="care"
        residentsPerHome={[
          { homeId: "home-1", homeName: "Alpha House", residentCount: 3 },
        ]}
        monthEndCensus={[
          {
            monthKey: "2024-01",
            monthLabel: "Jan",
            homeCounts: [
              { homeId: "home-1", homeName: "Alpha House", residentCount: 3 },
            ],
          },
        ]}
        totalActiveResidentsAllHomes={0}
        configuredBedsAllSites={0}
        occupancyPercentAllSites={null}
      />,
    );

    expect(
      screen.queryByRole("heading", { name: /residents per home/i }),
    ).not.toBeInTheDocument();
  });

  it("renders the residents-per-home chart for admins", () => {
    render(
      <DashboardAnalyticsSection
        role="admin"
        residentsPerHome={[
          { homeId: "home-1", homeName: "Alpha House", residentCount: 3 },
          { homeId: "home-2", homeName: "Beta House", residentCount: 0 },
        ]}
        monthEndCensus={[
          {
            monthKey: "2024-01",
            monthLabel: "Jan",
            homeCounts: [
              { homeId: "home-1", homeName: "Alpha House", residentCount: 3 },
              { homeId: "home-2", homeName: "Beta House", residentCount: 0 },
            ],
          },
        ]}
        totalActiveResidentsAllHomes={3}
        configuredBedsAllSites={10}
        occupancyPercentAllSites={30}
      />,
    );

    expect(
      screen.getByRole("heading", { name: /residents per home/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: /month-end census by home/i }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: /payment volume/i }),
    ).not.toBeInTheDocument();
    expect(screen.getAllByText("Alpha House").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Beta House").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Jan").length).toBeGreaterThan(0);
  });
});
