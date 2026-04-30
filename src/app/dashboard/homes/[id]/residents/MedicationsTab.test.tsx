// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MedicationsTab } from "./MedicationsTab";

afterEach(cleanup);

const MED1 = {
  id: "m1",
  name: "Metformin",
  dose: "500mg",
  frequency: "Twice daily",
  timingNotes: "With meals",
  prn: false,
};
const MED2 = {
  id: "m2",
  name: "Salbutamol",
  dose: "100mcg",
  frequency: "As needed",
  timingNotes: null,
  prn: true,
};

const SNAPSHOT = {
  conditions: [],
  allergies: [],
  medications: [MED1, MED2],
};

function mockFetchOnce(body: unknown, ok = true) {
  return vi.fn().mockResolvedValue({
    ok,
    status: ok ? 200 : 400,
    json: async () => body,
  });
}

describe("MedicationsTab", () => {
  it("shows medications fetched from API on mount", async () => {
    vi.stubGlobal("fetch", mockFetchOnce(SNAPSHOT));
    render(<MedicationsTab homeId="h1" residentId="r1" />);
    await waitFor(() => {
      expect(screen.getByText("Metformin")).toBeInTheDocument();
      expect(screen.getByText("500mg · Twice daily")).toBeInTheDocument();
      expect(screen.getByText("Salbutamol")).toBeInTheDocument();
      expect(screen.getByText("PRN")).toBeInTheDocument();
    });
    vi.unstubAllGlobals();
  });

  it("shows loading state before fetch resolves", () => {
    vi.stubGlobal("fetch", vi.fn().mockReturnValue(new Promise(() => {})));
    render(<MedicationsTab homeId="h1" residentId="r1" />);
    expect(screen.getByText(/loading/i)).toBeInTheDocument();
    vi.unstubAllGlobals();
  });

  it("Add button POSTs to /medications and refreshes the list", async () => {
    const newMed = {
      id: "m3",
      name: "Lisinopril",
      dose: "10mg",
      frequency: "Once daily",
      timingNotes: null,
      prn: false,
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => SNAPSHOT })
      .mockResolvedValueOnce({ ok: true, status: 201, json: async () => ({}) })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ ...SNAPSHOT, medications: [...SNAPSHOT.medications, newMed] }),
      });
    vi.stubGlobal("fetch", fetchMock);

    render(<MedicationsTab homeId="h1" residentId="r1" />);
    await waitFor(() => screen.getByText("Metformin"));

    await userEvent.type(screen.getByPlaceholderText(/^name$/i), "Lisinopril");
    await userEvent.type(screen.getByPlaceholderText(/^dose$/i), "10mg");
    await userEvent.type(screen.getByPlaceholderText(/^frequency$/i), "Once daily");
    await userEvent.click(screen.getByRole("button", { name: /add medication/i }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/homes/h1/residents/r1/clinical/medications",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({
            name: "Lisinopril",
            dose: "10mg",
            frequency: "Once daily",
            timingNotes: null,
            prn: false,
          }),
        }),
      );
      expect(screen.getByText("Lisinopril")).toBeInTheDocument();
    });
    vi.unstubAllGlobals();
  });

  it("Edit button shows inline form pre-populated with medication fields", async () => {
    vi.stubGlobal("fetch", mockFetchOnce(SNAPSHOT));
    render(<MedicationsTab homeId="h1" residentId="r1" />);
    await waitFor(() => screen.getByText("Metformin"));

    const editButtons = screen.getAllByRole("button", { name: /edit/i });
    await userEvent.click(editButtons[0]);

    expect(screen.getByDisplayValue("Metformin")).toBeInTheDocument();
    expect(screen.getByDisplayValue("500mg")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Twice daily")).toBeInTheDocument();
    expect(screen.getByDisplayValue("With meals")).toBeInTheDocument();
    vi.unstubAllGlobals();
  });

  it("Save edit PATCHes the medication and returns to read-only", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => SNAPSHOT })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({}) })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          ...SNAPSHOT,
          medications: [
            { ...MED1, dose: "1000mg" },
            MED2,
          ],
        }),
      });
    vi.stubGlobal("fetch", fetchMock);

    render(<MedicationsTab homeId="h1" residentId="r1" />);
    await waitFor(() => screen.getByText("Metformin"));

    const editButtons = screen.getAllByRole("button", { name: /edit/i });
    await userEvent.click(editButtons[0]);

    const doseInput = screen.getByDisplayValue("500mg");
    await userEvent.clear(doseInput);
    await userEvent.type(doseInput, "1000mg");
    await userEvent.click(screen.getByRole("button", { name: /save/i }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/homes/h1/residents/r1/clinical/medications/m1",
        expect.objectContaining({
          method: "PATCH",
          body: JSON.stringify({
            name: "Metformin",
            dose: "1000mg",
            frequency: "Twice daily",
            timingNotes: "With meals",
            prn: false,
          }),
        }),
      );
      expect(screen.getByText("1000mg · Twice daily")).toBeInTheDocument();
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

    render(<MedicationsTab homeId="h1" residentId="r1" />);
    await waitFor(() => screen.getByText("Metformin"));

    const callsBefore = fetchMock.mock.calls.length;
    const editButtons = screen.getAllByRole("button", { name: /edit/i });
    await userEvent.click(editButtons[0]);
    await userEvent.click(screen.getByRole("button", { name: /cancel/i }));

    expect(screen.getByText("Metformin")).toBeInTheDocument();
    expect(fetchMock.mock.calls.length).toBe(callsBefore);
    vi.unstubAllGlobals();
  });

  it("Remove button shows inline confirm/cancel — does not delete immediately", async () => {
    vi.stubGlobal("fetch", mockFetchOnce(SNAPSHOT));
    render(<MedicationsTab homeId="h1" residentId="r1" />);
    await waitFor(() => screen.getByText("Metformin"));

    const removeButtons = screen.getAllByRole("button", { name: /remove/i });
    await userEvent.click(removeButtons[0]);

    expect(screen.getByRole("button", { name: /confirm/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /cancel/i })).toBeInTheDocument();
    vi.unstubAllGlobals();
  });

  it("Confirm delete sends DELETE to /medications/:id", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => SNAPSHOT })
      .mockResolvedValueOnce({ ok: true, status: 204, json: async () => ({}) })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ ...SNAPSHOT, medications: [MED2] }),
      });
    vi.stubGlobal("fetch", fetchMock);

    render(<MedicationsTab homeId="h1" residentId="r1" />);
    await waitFor(() => screen.getByText("Metformin"));

    const removeButtons = screen.getAllByRole("button", { name: /remove/i });
    await userEvent.click(removeButtons[0]);
    await userEvent.click(screen.getByRole("button", { name: /confirm/i }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/homes/h1/residents/r1/clinical/medications/m1",
        expect.objectContaining({ method: "DELETE" }),
      );
      expect(screen.queryByText("Metformin")).not.toBeInTheDocument();
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

    render(<MedicationsTab homeId="h1" residentId="r1" />);
    await waitFor(() => screen.getByText("Metformin"));

    const callsBefore = fetchMock.mock.calls.length;
    const removeButtons = screen.getAllByRole("button", { name: /remove/i });
    await userEvent.click(removeButtons[0]);
    await userEvent.click(screen.getByRole("button", { name: /cancel/i }));

    expect(screen.getByText("Metformin")).toBeInTheDocument();
    expect(fetchMock.mock.calls.length).toBe(callsBefore);
    vi.unstubAllGlobals();
  });
});
