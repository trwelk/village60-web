// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ResidentsPerHomeTooltip } from "./analytics/occupancy/ResidentsPerHomeChart";

describe("ResidentsPerHomeTooltip", () => {
  it("shows the exact integer resident count", () => {
    render(
      <ResidentsPerHomeTooltip
        active
        totalResidents={14}
        payload={[
          {
            payload: {
              homeId: "home-1",
              homeName: "Alpha House",
              residentCount: 7,
            },
          },
        ]}
      />,
    );

    expect(screen.getByText("Alpha House")).toBeInTheDocument();
    expect(screen.getByText(/7 residents/)).toBeInTheDocument();
    expect(screen.getByText(/\(50%\)/)).toBeInTheDocument();
  });
});
