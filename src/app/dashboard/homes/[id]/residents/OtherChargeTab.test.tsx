// @vitest-environment jsdom
import {
  cleanup,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
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
        rows: [
          {
            id: "oc-reg",
            residentId: "r1",
            type: "registration",
            amountMinor: 250_00,
          },
          {
            id: "oc-dep",
            residentId: "r1",
            type: "deposit",
            amountMinor: 500_00,
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
    expect(screen.getAllByRole("button", { name: /^Edit$/i }).length).toBe(2);

    const url = String(mockFetch.mock.calls[0][0]);
    expect(url).toContain("/api/homes/h1/other-charges");
    expect(url).toContain("residentId=r1");
    expect(url).toContain("status=all");
  });

  it("shows an empty state and set-up when there are no other charges", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ rows: [] }),
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
        residentId: "r1",
        type: "registration" as const,
        amountMinor: 0,
      },
      {
        id: "oc-dep",
        residentId: "r1",
        type: "deposit" as const,
        amountMinor: 0,
      },
    ];
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ rows: [] }),
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
        json: async () => ({ rows: twoRows }),
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
