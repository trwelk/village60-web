// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MonthEndCensusTooltip } from "./MonthEndCensusChart";

describe("MonthEndCensusTooltip", () => {
  it("shows the month label and exact per-home counts", () => {
    render(
      <MonthEndCensusTooltip
        active
        label="Jan"
        payload={[
          {
            dataKey: "home-1",
            name: "Alpha House",
            value: 3,
            color: "#2f6f57",
          },
          {
            dataKey: "home-2",
            name: "Beta House",
            value: 0,
            color: "#b56a4a",
          },
        ]}
      />,
    );

    expect(screen.getByText("Jan")).toBeInTheDocument();
    expect(screen.getByText("Alpha House")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText("Beta House")).toBeInTheDocument();
    expect(screen.getByText("0")).toBeInTheDocument();
  });
});
