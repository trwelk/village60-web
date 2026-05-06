// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BillingTab } from "./BillingTab";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("BillingTab", () => {
  it("loads monthly charges and does not render other-charge controls", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ charges: [], otherCharges: [] }),
    });
    vi.stubGlobal("fetch", mockFetch);

    render(
      <BillingTab homeId="h1" residentId="r1" defaultCurrencyCode="NZD" />,
    );

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /Pay multiple months/i }),
      ).toBeInTheDocument();
    });

    expect(screen.queryByTestId("resident-other-charges")).not.toBeInTheDocument();
    expect(screen.queryByText("Registration fee")).not.toBeInTheDocument();

    expect(mockFetch).toHaveBeenCalledWith(
      "/api/homes/h1/residents/r1/monthly-charges",
    );
  });

  it("batch pay opens panel, POSTs selected months, reloads, and shows success", async () => {
    const unpaid = {
      id: "c-un",
      billingMonth: "2026-03",
      wardIdSnapshot: "w1",
      wardLabel: "North",
      amountMinorSnapshot: 800,
      paid: false,
      payment: null,
    };
    const paidRow = {
      id: "c-pd",
      billingMonth: "2026-04",
      wardIdSnapshot: "w1",
      wardLabel: "North",
      amountMinorSnapshot: 800,
      paid: true,
      payment: {
        id: "p1",
        amountMinor: 800,
        paidOn: "2026-04-01",
        notes: null,
        recordedByUserId: "u1",
        createdAtUtcMs: 0,
        updatedAtUtcMs: 0,
      },
    };
    const mockFetch = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      if (typeof url === "string" && url.endsWith("/pay-billing-months")) {
        expect(init?.method).toBe("POST");
        return Promise.resolve({
          ok: true,
          json: async () => ({ charges: [unpaid] }),
        });
      }
      return Promise.resolve({
        ok: true,
        json: async () => ({ charges: [unpaid, paidRow], otherCharges: [] }),
      });
    });
    vi.stubGlobal("fetch", mockFetch);

    render(
      <BillingTab homeId="h1" residentId="r1" defaultCurrencyCode="NZD" />,
    );

    await waitFor(() => {
      expect(screen.getByText("2026-03")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /Pay multiple months/i }));

    await waitFor(() => {
      expect(screen.getByTestId("billing-batch-panel")).toBeInTheDocument();
    });

    const march = screen.getByRole("checkbox", { name: /2026-03/i });
    expect(march).toBeChecked();

    fireEvent.click(screen.getByRole("button", { name: /Show paid months/i }));

    const april = await screen.findByRole("checkbox", { name: /2026-04/i });
    expect(april).toBeDisabled();

    expect(screen.getByTestId("billing-batch-total")).toHaveTextContent(/\$8\.00/);

    fireEvent.click(screen.getByRole("button", { name: /Record batch payment/i }));

    await waitFor(() => {
      expect(screen.getByTestId("billing-batch-success")).toHaveTextContent(
        /Payments recorded/,
      );
    });

    expect(mockFetch).toHaveBeenCalledWith(
      "/api/homes/h1/residents/r1/monthly-charges/pay-billing-months",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
      }),
    );
    const postCall = mockFetch.mock.calls.find(
      (c) => typeof c[0] === "string" && c[0].includes("pay-billing-months"),
    );
    expect(postCall).toBeDefined();
    const body = JSON.parse((postCall![1] as { body: string }).body) as {
      billingMonths: string[];
    };
    expect(body.billingMonths).toEqual(["2026-03"]);
  });

  it("batch total includes extra months at current ward rate when not on file yet", async () => {
    const unpaid = {
      id: "c-un",
      billingMonth: "2026-03",
      wardIdSnapshot: "w1",
      wardLabel: "North",
      amountMinorSnapshot: 800,
      paid: false,
      payment: null,
    };
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        charges: [unpaid],
        otherCharges: [],
        residentStatus: "active",
        wardMonthlyRatePerPersonMinor: 1000,
      }),
    });
    vi.stubGlobal("fetch", mockFetch);

    render(
      <BillingTab homeId="h1" residentId="r1" defaultCurrencyCode="NZD" />,
    );

    await waitFor(() => {
      expect(screen.getByText("2026-03")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /Pay multiple months/i }));

    await waitFor(() => {
      expect(screen.getByTestId("billing-batch-panel")).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText(/^From$/i), {
      target: { value: "2026-05" },
    });
    fireEvent.change(screen.getByLabelText(/^To$/i), {
      target: { value: "2026-05" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^Add range$/i }));

    await waitFor(() => {
      expect(screen.getByTestId("billing-batch-total")).toHaveTextContent(
        /\$18\.00/,
      );
    });
  });

  it("filters the monthly table to unpaid rows when Unpaid is selected", async () => {
    const unpaid = {
      id: "c-un",
      billingMonth: "2026-03",
      wardIdSnapshot: "w1",
      wardLabel: "North",
      amountMinorSnapshot: 800,
      paid: false,
      payment: null,
    };
    const paidRow = {
      id: "c-pd",
      billingMonth: "2026-04",
      wardIdSnapshot: "w1",
      wardLabel: "North",
      amountMinorSnapshot: 800,
      paid: true,
      payment: {
        id: "p1",
        amountMinor: 800,
        paidOn: "2026-04-01",
        notes: null,
        recordedByUserId: "u1",
        createdAtUtcMs: 0,
        updatedAtUtcMs: 0,
      },
    };
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ charges: [unpaid, paidRow], otherCharges: [] }),
    });
    vi.stubGlobal("fetch", mockFetch);

    render(
      <BillingTab homeId="h1" residentId="r1" defaultCurrencyCode="NZD" />,
    );

    await waitFor(() => {
      expect(
        screen.getByTestId("billing-monthly-charges-table"),
      ).toBeInTheDocument();
    });

    const table = screen.getByTestId("billing-monthly-charges-table");
    expect(within(table).getByText("2026-03")).toBeInTheDocument();
    expect(within(table).getByText("2026-04")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("radio", { name: /^Unpaid$/i }));

    await waitFor(() => {
      expect(within(table).getByText("2026-03")).toBeInTheDocument();
    });
    expect(within(table).queryByText("2026-04")).not.toBeInTheDocument();
  });

  it("filters the monthly table to paid rows when Paid is selected", async () => {
    const unpaid = {
      id: "c-un",
      billingMonth: "2026-03",
      wardIdSnapshot: "w1",
      wardLabel: "North",
      amountMinorSnapshot: 800,
      paid: false,
      payment: null,
    };
    const paidRow = {
      id: "c-pd",
      billingMonth: "2026-04",
      wardIdSnapshot: "w1",
      wardLabel: "North",
      amountMinorSnapshot: 800,
      paid: true,
      payment: {
        id: "p1",
        amountMinor: 800,
        paidOn: "2026-04-01",
        notes: null,
        recordedByUserId: "u1",
        createdAtUtcMs: 0,
        updatedAtUtcMs: 0,
      },
    };
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ charges: [unpaid, paidRow], otherCharges: [] }),
    });
    vi.stubGlobal("fetch", mockFetch);

    render(
      <BillingTab homeId="h1" residentId="r1" defaultCurrencyCode="NZD" />,
    );

    await waitFor(() => {
      expect(
        screen.getByTestId("billing-monthly-charges-table"),
      ).toBeInTheDocument();
    });

    const table = screen.getByTestId("billing-monthly-charges-table");
    fireEvent.click(screen.getByRole("radio", { name: /^Paid$/i }));

    await waitFor(() => {
      expect(within(table).getByText("2026-04")).toBeInTheDocument();
    });
    expect(within(table).queryByText("2026-03")).not.toBeInTheDocument();
  });

  it("shows a filter empty message when no months match the selected filter", async () => {
    const paidRow = {
      id: "c-pd",
      billingMonth: "2026-04",
      wardIdSnapshot: "w1",
      wardLabel: "North",
      amountMinorSnapshot: 800,
      paid: true,
      payment: {
        id: "p1",
        amountMinor: 800,
        paidOn: "2026-04-01",
        notes: null,
        recordedByUserId: "u1",
        createdAtUtcMs: 0,
        updatedAtUtcMs: 0,
      },
    };
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ charges: [paidRow], otherCharges: [] }),
    });
    vi.stubGlobal("fetch", mockFetch);

    render(
      <BillingTab homeId="h1" residentId="r1" defaultCurrencyCode="NZD" />,
    );

    await waitFor(() => {
      expect(
        screen.getByTestId("billing-monthly-charges-table"),
      ).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("radio", { name: /^Unpaid$/i }));

    await waitFor(() => {
      expect(
        screen.getByTestId("billing-monthly-filter-empty"),
      ).toBeInTheDocument();
    });
    expect(
      screen.getByText(/No months match this filter/i),
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId("billing-monthly-charges-table"),
    ).not.toBeInTheDocument();
  });
});
