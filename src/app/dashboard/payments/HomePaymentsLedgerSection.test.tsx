// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HomePaymentsLedgerSection } from "./HomePaymentsLedgerSection";

const mockPush = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

afterEach(() => {
  cleanup();
  mockPush.mockClear();
});

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

const sampleRow = {
  paymentId: "p1",
  paidOn: "2026-04-20",
  amountMinor: 12_00,
  notes: "Bank",
  billingMonth: "2026-04",
  amountMinorSnapshot: 12_00,
  residentId: "r1",
  residentFullName: "A Resident",
  residentStatus: "active",
  recordedByEmail: "a@b.com",
} as const;

describe("HomePaymentsLedgerSection (20a)", () => {
  it("stacks the home filter card above the ledger body so the Home menu is not covered", () => {
    render(
      <HomePaymentsLedgerSection
        homes={[{ homeId: "h1", homeName: "Home One" }]}
        selectedHomeId="h1"
        defaultCurrencyCode="NZD"
        ledger={{
          rows: [sampleRow],
          totalCount: 1,
          page: 1,
          pageSize: 25,
        }}
      />,
    );
    const panel = screen.getByTestId("payments-ledger-filters");
    expect(panel).toHaveClass("relative", "z-20");
  });

  it("renders the ledger table and range text", () => {
    render(
      <HomePaymentsLedgerSection
        homes={[{ homeId: "h1", homeName: "Home One" }]}
        selectedHomeId="h1"
        defaultCurrencyCode="NZD"
        ledger={{
          rows: [sampleRow],
          totalCount: 1,
          page: 1,
          pageSize: 25,
        }}
      />,
    );

    expect(screen.getByTestId("payments-ledger-table")).toBeInTheDocument();
    expect(screen.getByTestId("payments-ledger-range")).toHaveTextContent(
      "Showing 1–1 of 1",
    );
    expect(screen.getByText("A Resident")).toBeInTheDocument();
  });

  it("navigates to next page and selects another home (page resets to 1)", async () => {
    render(
      <HomePaymentsLedgerSection
        homes={[
          { homeId: "h1", homeName: "A" },
          { homeId: "h2", homeName: "B" },
        ]}
        selectedHomeId="h1"
        defaultCurrencyCode="NZD"
        ledger={{
          rows: [sampleRow],
          totalCount: 40,
          page: 1,
          pageSize: 25,
        }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Next/i }));
    expect(mockPush).toHaveBeenCalledWith(
      expect.stringMatching(/homeId=h1/),
    );
    expect(mockPush).toHaveBeenCalledWith(
      expect.stringMatching(/[?&]page=2/),
    );

    fireEvent.click(screen.getByLabelText("Home"));
    await waitFor(() => {
      expect(screen.getByRole("listbox")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole("option", { name: "B" }));
    const last = mockPush.mock.calls[mockPush.mock.calls.length - 1]![0] as string;
    expect(last).toContain("homeId=h2");
    expect(last).not.toMatch(/[?&]page=/);
  });
});
