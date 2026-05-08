// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  residentDetailTabsForRole,
  RESIDENT_CORE_TABS,
} from "@/lib/residents/tabs";
import { ResidentTabs } from "./ResidentTabs";

afterEach(cleanup);

const ALL_TAB_LABELS = [
  "Next of Kin",
  "POA",
  "Assigned Nurse",
  "Conditions",
  "Allergies",
];

describe("ResidentTabs", () => {
  it("renders all clinical tabs", () => {
    render(
      <ResidentTabs
        tabs={RESIDENT_CORE_TABS}
        activeTab="nok"
        onTabChange={vi.fn()}
      />,
    );
    for (const label of ALL_TAB_LABELS) {
      expect(screen.getByRole("tab", { name: label })).toBeInTheDocument();
    }
    expect(
      screen.queryByRole("tab", { name: "Payment" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("tab", { name: "Monthly billing" }),
    ).not.toBeInTheDocument();
  });

  it("includes Other charges tab for admin tab list", () => {
    const tabs = residentDetailTabsForRole("admin");
    render(<ResidentTabs tabs={tabs} activeTab="other-charge" onTabChange={vi.fn()} />);
    expect(
      screen.getByRole("tab", { name: "Other charges" }),
    ).toBeInTheDocument();
  });

  it("marks the active tab with aria-selected=true", () => {
    render(
      <ResidentTabs
        tabs={RESIDENT_CORE_TABS}
        activeTab="allergies"
        onTabChange={vi.fn()}
      />,
    );
    expect(
      screen.getByRole("tab", { name: "Allergies" }),
    ).toHaveAttribute("aria-selected", "true");
    expect(
      screen.getByRole("tab", { name: "Next of Kin" }),
    ).toHaveAttribute("aria-selected", "false");
  });

  it("calls onTabChange with the tab id when a tab is clicked", async () => {
    const onTabChange = vi.fn();
    render(
      <ResidentTabs
        tabs={RESIDENT_CORE_TABS}
        activeTab="nok"
        onTabChange={onTabChange}
      />,
    );
    await userEvent.click(screen.getByRole("tab", { name: "Conditions" }));
    expect(onTabChange).toHaveBeenCalledWith("conditions");
  });
});
