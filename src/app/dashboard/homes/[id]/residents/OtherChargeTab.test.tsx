// @vitest-environment jsdom
import {
  cleanup,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RECORDED_OTHER_CHARGE_MESSAGE } from "@/lib/billing/otherCharges";
import { OtherChargeTab } from "./OtherChargeTab";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("OtherChargeTab", () => {
  it("lists registration and deposit from the billing API with edit actions", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        charges: [],
        otherCharges: [
          {
            id: "oc-reg",
            type: "registration",
            amountMinor: 250_00,
            received: true,
            paidOn: "2026-01-10",
            createdAtUtcMs: 0,
            updatedAtUtcMs: 0,
          },
          {
            id: "oc-dep",
            type: "deposit",
            amountMinor: 500_00,
            received: false,
            paidOn: null,
            createdAtUtcMs: 0,
            updatedAtUtcMs: 0,
          },
        ],
      }),
    });
    vi.stubGlobal("fetch", mockFetch);

    render(
      <OtherChargeTab
        homeId="h1"
        residentId="r1"
        defaultCurrencyCode="NZD"
        admissionDate="2024-01-15"
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId("resident-other-charges")).toBeInTheDocument();
    });
    expect(
      screen.queryByTestId("other-charges-set-up"),
    ).not.toBeInTheDocument();

    expect(screen.getByText("Registration fee")).toBeInTheDocument();
    expect(screen.getByText("Deposit")).toBeInTheDocument();
    expect(screen.getAllByText(/Received:/i).length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText("Yes")).toBeInTheDocument();
    expect(screen.getByText("No")).toBeInTheDocument();
    expect(screen.getByText("2026-01-10")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /^Edit$/i }).length).toBe(1);
    expect(screen.getByText(RECORDED_OTHER_CHARGE_MESSAGE)).toBeInTheDocument();

    expect(mockFetch).toHaveBeenCalledWith(
      "/api/homes/h1/residents/r1/monthly-charges",
    );
  });

  it("shows an empty state and set-up when there are no other charges", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ charges: [], otherCharges: [] }),
    });
    vi.stubGlobal("fetch", mockFetch);

    render(
      <OtherChargeTab
        homeId="h1"
        residentId="r1"
        defaultCurrencyCode="NZD"
        admissionDate="2024-01-15"
      />,
    );

    await waitFor(() => {
      expect(
        screen.getByText(/No registration or deposit on file yet/i),
      ).toBeInTheDocument();
    });
    expect(screen.getByTestId("other-charges-set-up")).toBeInTheDocument();
  });

  it("calls initialize then reloads when set-up is clicked from an empty state", async () => {
    const twoRows = [
      {
        id: "oc-reg",
        type: "registration" as const,
        amountMinor: 0,
        received: false,
        paidOn: null,
        createdAtUtcMs: 0,
        updatedAtUtcMs: 0,
      },
      {
        id: "oc-dep",
        type: "deposit" as const,
        amountMinor: 0,
        received: false,
        paidOn: null,
        createdAtUtcMs: 0,
        updatedAtUtcMs: 0,
      },
    ];
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ charges: [], otherCharges: [] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          otherCharges: twoRows,
          createdTypes: ["registration", "deposit"],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ charges: [], otherCharges: twoRows }),
      });
    vi.stubGlobal("fetch", mockFetch);

    render(
      <OtherChargeTab
        homeId="h1"
        residentId="r1"
        defaultCurrencyCode="NZD"
        admissionDate="2024-01-15"
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId("other-charges-set-up")).toBeInTheDocument();
    });
    await userEvent.click(screen.getByTestId("other-charges-set-up"));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        "/api/homes/h1/residents/r1/other-charges/initialize",
        { method: "POST" },
      );
    });
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });
});
