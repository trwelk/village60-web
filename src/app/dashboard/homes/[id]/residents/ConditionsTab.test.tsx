// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ConditionsTab } from "./ConditionsTab";

afterEach(cleanup);

const SNAPSHOT = {
  conditions: [
    { id: "c1", label: "Hypertension" },
    { id: "c2", label: "Type 2 Diabetes" },
  ],
  allergies: [],
  medications: [],
};

function mockFetchOnce(body: unknown, ok = true) {
  return vi.fn().mockResolvedValue({
    ok,
    status: ok ? 200 : 400,
    json: async () => body,
  });
}

describe("ConditionsTab", () => {
  it("shows conditions fetched from API on mount", async () => {
    vi.stubGlobal("fetch", mockFetchOnce(SNAPSHOT));
    render(<ConditionsTab homeId="h1" residentId="r1" />);
    await waitFor(() => {
      expect(screen.getByText("Hypertension")).toBeInTheDocument();
      expect(screen.getByText("Type 2 Diabetes")).toBeInTheDocument();
    });
    vi.unstubAllGlobals();
  });

  it("shows loading state before fetch resolves", () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockReturnValue(new Promise(() => {})),
    );
    render(<ConditionsTab homeId="h1" residentId="r1" />);
    expect(screen.getByText(/loading/i)).toBeInTheDocument();
    vi.unstubAllGlobals();
  });

  it("Add button POSTs to /conditions and refreshes the list", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => SNAPSHOT })
      .mockResolvedValueOnce({ ok: true, status: 201, json: async () => ({}) })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          ...SNAPSHOT,
          conditions: [...SNAPSHOT.conditions, { id: "c3", label: "Asthma" }],
        }),
      });
    vi.stubGlobal("fetch", fetchMock);

    render(<ConditionsTab homeId="h1" residentId="r1" />);
    await waitFor(() => screen.getByText("Hypertension"));

    await userEvent.type(screen.getByPlaceholderText(/hypertension/i), "Asthma");
    await userEvent.click(screen.getByRole("button", { name: /^add$/i }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/homes/h1/residents/r1/clinical/conditions",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ label: "Asthma" }),
        }),
      );
      expect(screen.getByText("Asthma")).toBeInTheDocument();
    });
    vi.unstubAllGlobals();
  });

  it("Edit button shows inline form pre-populated with current label", async () => {
    vi.stubGlobal("fetch", mockFetchOnce(SNAPSHOT));
    render(<ConditionsTab homeId="h1" residentId="r1" />);
    await waitFor(() => screen.getByText("Hypertension"));

    const editButtons = screen.getAllByRole("button", { name: /edit/i });
    await userEvent.click(editButtons[0]);

    const input = screen.getByDisplayValue("Hypertension");
    expect(input).toBeInTheDocument();
    vi.unstubAllGlobals();
  });

  it("Save edit PATCHes the condition and returns to read-only", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => SNAPSHOT })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({}) })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          ...SNAPSHOT,
          conditions: [{ id: "c1", label: "Hypertension (controlled)" }, SNAPSHOT.conditions[1]],
        }),
      });
    vi.stubGlobal("fetch", fetchMock);

    render(<ConditionsTab homeId="h1" residentId="r1" />);
    await waitFor(() => screen.getByText("Hypertension"));

    const editButtons = screen.getAllByRole("button", { name: /edit/i });
    await userEvent.click(editButtons[0]);

    const input = screen.getByDisplayValue("Hypertension");
    await userEvent.clear(input);
    await userEvent.type(input, "Hypertension (controlled)");
    await userEvent.click(screen.getByRole("button", { name: /save/i }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/homes/h1/residents/r1/clinical/conditions/c1",
        expect.objectContaining({
          method: "PATCH",
          body: JSON.stringify({ label: "Hypertension (controlled)" }),
        }),
      );
      expect(screen.getByText("Hypertension (controlled)")).toBeInTheDocument();
    });
    vi.unstubAllGlobals();
  });

  it("Cancel edit returns to read-only without saving", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => SNAPSHOT,
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<ConditionsTab homeId="h1" residentId="r1" />);
    await waitFor(() => screen.getByText("Hypertension"));

    const callsBefore = fetchMock.mock.calls.length;
    const editButtons = screen.getAllByRole("button", { name: /edit/i });
    await userEvent.click(editButtons[0]);
    await userEvent.click(screen.getByRole("button", { name: /cancel/i }));

    expect(screen.getByText("Hypertension")).toBeInTheDocument();
    expect(fetchMock.mock.calls.length).toBe(callsBefore);
    vi.unstubAllGlobals();
  });

  it("Remove button shows inline confirm/cancel — does not delete immediately", async () => {
    vi.stubGlobal("fetch", mockFetchOnce(SNAPSHOT));
    render(<ConditionsTab homeId="h1" residentId="r1" />);
    await waitFor(() => screen.getByText("Hypertension"));

    const removeButtons = screen.getAllByRole("button", { name: /remove/i });
    await userEvent.click(removeButtons[0]);

    expect(screen.getByRole("button", { name: /confirm/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /cancel/i })).toBeInTheDocument();
    vi.unstubAllGlobals();
  });

  it("Confirm delete sends DELETE to /conditions/:id", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => SNAPSHOT })
      .mockResolvedValueOnce({ ok: true, status: 204, json: async () => ({}) })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          ...SNAPSHOT,
          conditions: [SNAPSHOT.conditions[1]],
        }),
      });
    vi.stubGlobal("fetch", fetchMock);

    render(<ConditionsTab homeId="h1" residentId="r1" />);
    await waitFor(() => screen.getByText("Hypertension"));

    const removeButtons = screen.getAllByRole("button", { name: /remove/i });
    await userEvent.click(removeButtons[0]);
    await userEvent.click(screen.getByRole("button", { name: /confirm/i }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/homes/h1/residents/r1/clinical/conditions/c1",
        expect.objectContaining({ method: "DELETE" }),
      );
      expect(screen.queryByText("Hypertension")).not.toBeInTheDocument();
    });
    vi.unstubAllGlobals();
  });

  it("Cancel delete hides confirmation without deleting", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => SNAPSHOT,
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<ConditionsTab homeId="h1" residentId="r1" />);
    await waitFor(() => screen.getByText("Hypertension"));

    const callsBefore = fetchMock.mock.calls.length;
    const removeButtons = screen.getAllByRole("button", { name: /remove/i });
    await userEvent.click(removeButtons[0]);
    await userEvent.click(screen.getByRole("button", { name: /cancel/i }));

    expect(screen.getByText("Hypertension")).toBeInTheDocument();
    expect(fetchMock.mock.calls.length).toBe(callsBefore);
    vi.unstubAllGlobals();
  });
});
