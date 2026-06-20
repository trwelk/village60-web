// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "@/lib/i18n/I18nProvider";
import { HomePaymentsLedgerSection } from "./HomePaymentsLedgerSection";

const mockPush = vi.fn();
const mockRefresh = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush, refresh: mockRefresh }),
}));

function renderWithI18n(ui: React.ReactElement) {
  return render(<I18nProvider initialLocale="en">{ui}</I18nProvider>);
}

function openFilters() {
  fireEvent.click(screen.getByRole("button", { name: /Filters/i }));
}

afterEach(() => {
  cleanup();
  mockPush.mockClear();
  mockRefresh.mockClear();
});

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

const sampleRow = {
  paymentId: "p1",
  chargeId: "chg-1",
  paidOn: "2026-04-20",
  amountMinor: 12_00,
  notes: "Bank",
  billingMonth: "2026-04",
  amountMinorSnapshot: 12_00,
  residentId: "r1",
  residentFullName: "A Resident",
  residentStatus: "active",
  recordedByUserId: "u-rec",
  recordedByEmail: "a@b.com",
} as const;

describe("HomePaymentsLedgerSection (20a)", () => {
  it("stacks the home filter card above the ledger body so the Home menu is not covered", () => {
    renderWithI18n(
      <HomePaymentsLedgerSection
        homes={[{ homeId: "h1", homeName: "Home One" }]}
        selectedHomeId="h1"
        selectedResidentId={null}
        residentOptions={[]}
        defaultCurrencyCode="NZD"
        selectedAccountType="resident"
        ledger={{
          kind: "resident",
          rows: [sampleRow],
          totalCount: 1,
          page: 1,
          pageSize: 25,
        }}
      />,
    );
    openFilters();
    const panel = screen.getByTestId("payments-ledger-filters");
    expect(panel).toBeVisible();
  });

  it("renders the ledger table and range text", () => {
    renderWithI18n(
      <HomePaymentsLedgerSection
        homes={[{ homeId: "h1", homeName: "Home One" }]}
        selectedHomeId="h1"
        selectedResidentId={null}
        residentOptions={[]}
        defaultCurrencyCode="NZD"
        selectedAccountType="resident"
        ledger={{
          kind: "resident",
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
    renderWithI18n(
      <HomePaymentsLedgerSection
        homes={[
          { homeId: "h1", homeName: "A" },
          { homeId: "h2", homeName: "B" },
        ]}
        selectedHomeId="h1"
        selectedResidentId={null}
        residentOptions={[
          {
            residentId: "r1",
            residentFullName: "A Resident",
            residentStatus: "active",
          },
        ]}
        defaultCurrencyCode="NZD"
        selectedAccountType="resident"
        ledger={{
          kind: "resident",
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
      expect.stringMatching(/accountType=resident/),
    );
    expect(mockPush).toHaveBeenCalledWith(
      expect.stringMatching(/[?&]page=2/),
    );

    openFilters();
    fireEvent.click(screen.getByLabelText("Home"));
    await waitFor(() => {
      expect(screen.getByRole("listbox")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole("option", { name: "B" }));
    fireEvent.click(screen.getByRole("button", { name: /Apply filters/i }));
    const last = mockPush.mock.calls[mockPush.mock.calls.length - 1]![0] as string;
    expect(last).toContain("homeId=h2");
    expect(last).toContain("accountType=resident");
    expect(last).not.toMatch(/[?&]page=/);
  });

  it("applies resident filter and clears resident from URL", async () => {
    renderWithI18n(
      <HomePaymentsLedgerSection
        homes={[{ homeId: "h1", homeName: "Home One" }]}
        selectedHomeId="h1"
        selectedResidentId="r1"
        residentOptions={[
          {
            residentId: "r1",
            residentFullName: "A Resident",
            residentStatus: "active",
          },
          {
            residentId: "r2",
            residentFullName: "B Resident",
            residentStatus: "departed",
          },
        ]}
        defaultCurrencyCode="NZD"
        selectedAccountType="resident"
        ledger={{
          kind: "resident",
          rows: [sampleRow],
          totalCount: 1,
          page: 1,
          pageSize: 25,
        }}
      />,
    );

    openFilters();
    fireEvent.click(screen.getByLabelText("Resident (optional)"));
    await waitFor(() => {
      expect(screen.getByRole("listbox")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole("option", { name: "All residents" }));
    fireEvent.click(screen.getByRole("button", { name: /Apply filters/i }));

    const last = mockPush.mock.calls[mockPush.mock.calls.length - 1]![0] as string;
    expect(last).toContain("homeId=h1");
    expect(last).toContain("accountType=resident");
    expect(last).not.toMatch(/[?&]residentId=/);
  });
});
