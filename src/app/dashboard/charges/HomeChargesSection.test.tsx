// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HomeChargesSection } from "./HomeChargesSection";

const mockPush = vi.fn();
const mockFetch = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

beforeEach(() => {
  mockFetch.mockReset();
  vi.stubGlobal("fetch", mockFetch);
});

afterEach(() => {
  cleanup();
  mockPush.mockClear();
  vi.unstubAllGlobals();
});

const emptySummary = {
  totalBilledMinor: 0,
  chargeCount: 0,
  paidCount: 0,
  unpaidCount: 0,
  unpaidBalanceMinor: 0,
};

const base = {
  homes: [{ homeId: "h1", homeName: "Home One" }],
  selectedHomeId: "h1",
  selectedResidentId: null,
  residentOptions: [
    {
      residentId: "r1",
      residentFullName: "Unpaid U.",
      residentStatus: "active",
    },
    {
      residentId: "r2",
      residentFullName: "Paid P.",
      residentStatus: "active",
    },
  ],
  defaultCurrencyCode: "NZD" as const,
  billingMonthFrom: "2026-01",
  billingMonthTo: "2026-04",
  ytdBillingMonthFrom: "2026-01",
  ytdBillingMonthTo: "2026-04",
  rangeIsDefaultYtd: true,
  ledger: {
    rows: [],
    totalCount: 0,
    page: 1,
    pageSize: 25,
    summary: emptySummary,
  },
};

describe("HomeChargesSection (18c month range)", () => {
  it("stacks the home filter card above the ledger body so the Home menu is not covered", () => {
    render(<HomeChargesSection {...base} />);
    const panel = screen.getByTestId("charges-ledger-filters");
    expect(panel).toHaveClass("relative", "z-20");
  });

  it("describes the active range; default YTD shows that copy", () => {
    render(<HomeChargesSection {...base} />);
    const paras = screen.getAllByText(/Showing billing months/i);
    expect(paras[0].textContent).toMatch(/2026-01/);
    expect(paras[0].textContent).toMatch(/2026-04/);
    expect(screen.getByText(/calendar year-to-date, UTC/)).toBeInTheDocument();
  });

  it("uses selected range in the summary when not default YTD", () => {
    render(
      <HomeChargesSection
        {...base}
        billingMonthFrom="2024-01"
        billingMonthTo="2024-12"
        rangeIsDefaultYtd={false}
      />,
    );
    expect(screen.getByText(/selected range, UTC/)).toBeInTheDocument();
  });

  it("Apply range navigates to a custom billing window", () => {
    render(<HomeChargesSection {...base} />);
    const from = screen.getByLabelText("From", { exact: true });
    const to = screen.getByLabelText("To", { exact: true });
    fireEvent.change(from, { target: { value: "2024-01" } });
    fireEvent.change(to, { target: { value: "2024-06" } });
    fireEvent.click(screen.getByRole("button", { name: /Apply range/i }));
    expect(mockPush).toHaveBeenCalledWith(
      "/dashboard/charges?homeId=h1&billingMonthFrom=2024-01&billingMonthTo=2024-06",
    );
  });
});

const paymentNull = {
  id: "c-un",
  chargeId: "chg-un",
  residentId: "r1",
  residentFullName: "Unpaid U.",
  residentStatus: "active" as const,
  billingMonth: "2026-01",
  invoiceLineDescription: "January board",
  invoiceLineCategory: "monthly_fee",
  invoiceStatus: "finalized",
  wardIdSnapshot: "w1",
  wardLabel: "North",
  wardLabelSnapshot: "North",
  amountMinorSnapshot: 800_00,
  paid: false,
  paidOn: null,
  payment: null,
};

const paymentWithRecord = {
  id: "c-pd",
  chargeId: "chg-pd",
  residentId: "r2",
  residentFullName: "Paid P.",
  residentStatus: "active" as const,
  billingMonth: "2026-02",
  invoiceLineDescription: "February board",
  invoiceLineCategory: "monthly_fee",
  invoiceStatus: "paid",
  wardIdSnapshot: "w1",
  wardLabel: "North",
  wardLabelSnapshot: "North",
  amountMinorSnapshot: 900_00,
  paid: true,
  paidOn: "2026-02-01",
  payment: {
    id: "p1",
    amountMinor: 900_00,
    paidOn: "2026-02-01",
    notes: null,
    recordedByUserId: "u1",
    createdAtUtcMs: 0,
    updatedAtUtcMs: 0,
  },
};

function ledgerFromRows(rows: (typeof paymentNull | typeof paymentWithRecord)[]) {
  const totalBilledMinor = rows.reduce((s, r) => s + r.amountMinorSnapshot, 0);
  const paidCount = rows.filter((r) => r.paid).length;
  const unpaidCount = rows.length - paidCount;
  const unpaidBalanceMinor = rows
    .filter((r) => !r.paid)
    .reduce((s, r) => s + r.amountMinorSnapshot, 0);
  return {
    rows,
    totalCount: rows.length,
    page: 1,
    pageSize: 25,
    summary: {
      totalBilledMinor,
      chargeCount: rows.length,
      paidCount,
      unpaidCount,
      unpaidBalanceMinor,
    },
  };
}

function mockMonthlyChargesResponse(
  rows: (typeof paymentNull | typeof paymentWithRecord)[],
) {
  const ledger = ledgerFromRows(rows);
  return Promise.resolve({
    ok: true,
    text: async () => "",
    json: async () => ({
      charges: ledger.rows,
      totalCount: ledger.totalCount,
      page: ledger.page,
      pageSize: ledger.pageSize,
      summary: ledger.summary,
    }),
  } as unknown as Response);
}

describe("HomeChargesSection (18d payment status filter, client fetch)", () => {
  it("default All shows every billing month in the table", () => {
    const { rows, totalCount, page, pageSize, summary } = ledgerFromRows([
      paymentNull,
      paymentWithRecord,
    ]);
    render(
      <HomeChargesSection
        {...base}
        ledger={{ rows, totalCount, page, pageSize, summary }}
      />,
    );
    const table = screen.getByRole("table", { name: /monthly charge ledger/i });
    expect(within(table).getByText("2026-01")).toBeInTheDocument();
    expect(within(table).getByText("2026-02")).toBeInTheDocument();
    expect(within(table).getAllByText("monthly_fee").length).toBeGreaterThanOrEqual(
      1,
    );
  });

  it("Unpaid only shows API-filtered rows", async () => {
    mockFetch.mockImplementation(() =>
      mockMonthlyChargesResponse([paymentNull]),
    );
    const all = ledgerFromRows([paymentNull, paymentWithRecord]);
    render(<HomeChargesSection {...base} ledger={all} />);
    fireEvent.click(screen.getByRole("radio", { name: /^Unpaid only$/i }));
    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalled();
    });
    const table = screen.getByRole("table", { name: /monthly charge ledger/i });
    expect(within(table).getByText("2026-01")).toBeInTheDocument();
    expect(within(table).queryByText("2026-02")).not.toBeInTheDocument();
    const url = String(mockFetch.mock.calls[0][0]);
    expect(url).toContain("paymentStatus=unpaid");
  });

  it("Paid only shows API-filtered rows", async () => {
    mockFetch.mockImplementation(() =>
      mockMonthlyChargesResponse([paymentWithRecord]),
    );
    const all = ledgerFromRows([paymentNull, paymentWithRecord]);
    render(<HomeChargesSection {...base} ledger={all} />);
    fireEvent.click(screen.getByRole("radio", { name: /^Paid only$/i }));
    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalled();
    });
    const table = screen.getByRole("table", { name: /monthly charge ledger/i });
    expect(within(table).queryByText("2026-01")).not.toBeInTheDocument();
    expect(within(table).getByText("2026-02")).toBeInTheDocument();
    const url = String(mockFetch.mock.calls[0][0]);
    expect(url).toContain("paymentStatus=paid");
  });

  it("when the filter matches nothing, shows a message distinct from an empty range", async () => {
    mockFetch.mockImplementation(() => mockMonthlyChargesResponse([]));
    const all = ledgerFromRows([paymentWithRecord]);
    render(<HomeChargesSection {...base} ledger={all} />);
    fireEvent.click(screen.getByRole("radio", { name: /^Unpaid only$/i }));
    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalled();
    });
    const table = screen.getByRole("table", { name: /monthly charge ledger/i });
    expect(
      within(table).getByText(/no rows match this filter/i),
    ).toBeInTheDocument();
  });

  it("choosing Unpaid only fetches filtered data without changing the route", async () => {
    mockFetch.mockImplementation(() =>
      mockMonthlyChargesResponse([paymentNull]),
    );
    const all = ledgerFromRows([paymentNull, paymentWithRecord]);
    render(<HomeChargesSection {...base} ledger={all} />);
    fireEvent.click(screen.getByRole("radio", { name: /^Unpaid only$/i }));
    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalled();
    });
    expect(mockPush).not.toHaveBeenCalled();
  });

  it("resident filter navigates with residentId and resets to all", () => {
    render(<HomeChargesSection {...base} />);
    fireEvent.click(screen.getByRole("combobox", { name: /resident/i }));
    fireEvent.click(screen.getByRole("option", { name: /Paid P\./i }));
    expect(mockPush).toHaveBeenCalledWith(
      "/dashboard/charges?homeId=h1&residentId=r2",
    );
  });
});

describe("HomeChargesSection (22c pagination)", () => {
  it("shows range-of-total copy and disables Previous on first page", () => {
    render(
      <HomeChargesSection
        {...base}
        ledger={{
          rows: [paymentNull],
          totalCount: 40,
          page: 1,
          pageSize: 25,
          summary: {
            totalBilledMinor: 800_00,
            chargeCount: 40,
            paidCount: 0,
            unpaidCount: 40,
            unpaidBalanceMinor: 800_00 * 40,
          },
        }}
      />,
    );
    expect(screen.getByTestId("charges-ledger-range")).toHaveTextContent(
      "Showing 1–25 of 40",
    );
    expect(screen.getByRole("button", { name: /^Previous$/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /^Next$/i })).not.toBeDisabled();
  });
});
