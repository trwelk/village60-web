// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HomeOtherChargesSection } from "./HomeOtherChargesSection";

const mockPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

afterEach(() => {
  cleanup();
  mockPush.mockClear();
});

describe("HomeOtherChargesSection (21c)", () => {
  it("stacks the home filter card above the ledger body so the Home menu is not covered", () => {
    render(
      <HomeOtherChargesSection
        homes={[{ homeId: "h1", homeName: "Home One" }]}
        selectedHomeId="h1"
        defaultCurrencyCode="NZD"
        selectedResidentId=""
        residentsInHome={[]}
        ledger={{
          rows: [],
          totalCount: 0,
          page: 1,
          pageSize: 25,
          summary: {
            totalAmountMinor: 0,
            outstandingAmountMinor: 0,
            receivedLineCount: 0,
          },
        }}
      />,
    );
    const panel = screen.getByTestId("other-charges-ledger-filters");
    expect(panel).toHaveClass("relative", "z-20");
  });

  it("renders the ledger table and an Open link to the other-charge tab", () => {
    render(
      <HomeOtherChargesSection
        homes={[{ homeId: "h1", homeName: "Home One" }]}
        selectedHomeId="h1"
        defaultCurrencyCode="NZD"
        selectedResidentId=""
        residentsInHome={[{ id: "r1", fullName: "A Resident" }]}
        ledger={{
          rows: [
            {
              id: "oc1",
              type: "registration",
              amountMinor: 100_00,
              received: false,
              paidOn: null,
              residentId: "r1",
              residentFullName: "A Resident",
              residentStatus: "active",
            },
          ],
          totalCount: 1,
          page: 1,
          pageSize: 25,
          summary: {
            totalAmountMinor: 100_00,
            outstandingAmountMinor: 100_00,
            receivedLineCount: 0,
          },
        }}
      />,
    );
    expect(screen.getByTestId("other-charges-ledger")).toBeInTheDocument();
    const open = screen.getByRole("link", { name: "Open" });
    expect(open.getAttribute("href")).toBe(
      "/dashboard/homes/h1/residents/r1?tab=other-charge",
    );
  });
});
