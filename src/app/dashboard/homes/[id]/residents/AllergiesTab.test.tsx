// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AllergiesTab } from "./AllergiesTab";

afterEach(cleanup);

const SNAPSHOT = {
  conditions: [],
  allergies: [
    { id: "a1", allergen: "Penicillin", notes: "Causes rash" },
    { id: "a2", allergen: "Peanuts", notes: null },
  ],
  medications: [],
};

function mockFetchOnce(body: unknown, ok = true) {
  return vi.fn().mockResolvedValue({
    ok,
    status: ok ? 200 : 400,
    json: async () => body,
  });
}

describe("AllergiesTab", () => {
  it("shows allergies fetched from API on mount", async () => {
    vi.stubGlobal("fetch", mockFetchOnce(SNAPSHOT));
    render(<AllergiesTab homeId="h1" residentId="r1" />);
    await waitFor(() => {
      expect(screen.getByText("Penicillin")).toBeInTheDocument();
      expect(screen.getByText("Causes rash")).toBeInTheDocument();
      expect(screen.getByText("Peanuts")).toBeInTheDocument();
    });
    vi.unstubAllGlobals();
  });

  it("shows loading state before fetch resolves", () => {
    vi.stubGlobal("fetch", vi.fn().mockReturnValue(new Promise(() => {})));
    render(<AllergiesTab homeId="h1" residentId="r1" />);
    expect(screen.getByText(/loading/i)).toBeInTheDocument();
    vi.unstubAllGlobals();
  });

  it("Add button POSTs to /allergies and refreshes the list", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => SNAPSHOT })
      .mockResolvedValueOnce({ ok: true, status: 201, json: async () => ({}) })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          ...SNAPSHOT,
          allergies: [
            ...SNAPSHOT.allergies,
            { id: "a3", allergen: "Sulfa", notes: null },
          ],
        }),
      });
    vi.stubGlobal("fetch", fetchMock);

    render(<AllergiesTab homeId="h1" residentId="r1" />);
    await waitFor(() => screen.getByText("Penicillin"));

    await userEvent.type(screen.getByPlaceholderText(/allergen/i), "Sulfa");
    await userEvent.click(screen.getByRole("button", { name: /^add$/i }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/homes/h1/residents/r1/clinical/allergies",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ allergen: "Sulfa", notes: null }),
        }),
      );
      expect(screen.getByText("Sulfa")).toBeInTheDocument();
    });
    vi.unstubAllGlobals();
  });

  it("Edit button shows inline form pre-populated with allergen and notes", async () => {
    vi.stubGlobal("fetch", mockFetchOnce(SNAPSHOT));
    render(<AllergiesTab homeId="h1" residentId="r1" />);
    await waitFor(() => screen.getByText("Penicillin"));

    const editButtons = screen.getAllByRole("button", { name: /edit/i });
    await userEvent.click(editButtons[0]);

    expect(screen.getByDisplayValue("Penicillin")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Causes rash")).toBeInTheDocument();
    vi.unstubAllGlobals();
  });

  it("Save edit PATCHes the allergy and returns to read-only", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => SNAPSHOT })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({}) })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          ...SNAPSHOT,
          allergies: [
            { id: "a1", allergen: "Penicillin", notes: "Anaphylaxis" },
            SNAPSHOT.allergies[1],
          ],
        }),
      });
    vi.stubGlobal("fetch", fetchMock);

    render(<AllergiesTab homeId="h1" residentId="r1" />);
    await waitFor(() => screen.getByText("Penicillin"));

    const editButtons = screen.getAllByRole("button", { name: /edit/i });
    await userEvent.click(editButtons[0]);

    const notesInput = screen.getByDisplayValue("Causes rash");
    await userEvent.clear(notesInput);
    await userEvent.type(notesInput, "Anaphylaxis");
    await userEvent.click(screen.getByRole("button", { name: /save/i }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/homes/h1/residents/r1/clinical/allergies/a1",
        expect.objectContaining({
          method: "PATCH",
          body: JSON.stringify({ allergen: "Penicillin", notes: "Anaphylaxis" }),
        }),
      );
      expect(screen.getByText("Anaphylaxis")).toBeInTheDocument();
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

    render(<AllergiesTab homeId="h1" residentId="r1" />);
    await waitFor(() => screen.getByText("Penicillin"));

    const callsBefore = fetchMock.mock.calls.length;
    const editButtons = screen.getAllByRole("button", { name: /edit/i });
    await userEvent.click(editButtons[0]);
    await userEvent.click(screen.getByRole("button", { name: /cancel/i }));

    expect(screen.getByText("Penicillin")).toBeInTheDocument();
    expect(fetchMock.mock.calls.length).toBe(callsBefore);
    vi.unstubAllGlobals();
  });

  it("Remove button shows inline confirm/cancel — does not delete immediately", async () => {
    vi.stubGlobal("fetch", mockFetchOnce(SNAPSHOT));
    render(<AllergiesTab homeId="h1" residentId="r1" />);
    await waitFor(() => screen.getByText("Penicillin"));

    const removeButtons = screen.getAllByRole("button", { name: /remove/i });
    await userEvent.click(removeButtons[0]);

    expect(screen.getByRole("button", { name: /confirm/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /cancel/i })).toBeInTheDocument();
    vi.unstubAllGlobals();
  });

  it("Confirm delete sends DELETE to /allergies/:id", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => SNAPSHOT })
      .mockResolvedValueOnce({ ok: true, status: 204, json: async () => ({}) })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          ...SNAPSHOT,
          allergies: [SNAPSHOT.allergies[1]],
        }),
      });
    vi.stubGlobal("fetch", fetchMock);

    render(<AllergiesTab homeId="h1" residentId="r1" />);
    await waitFor(() => screen.getByText("Penicillin"));

    const removeButtons = screen.getAllByRole("button", { name: /remove/i });
    await userEvent.click(removeButtons[0]);
    await userEvent.click(screen.getByRole("button", { name: /confirm/i }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/homes/h1/residents/r1/clinical/allergies/a1",
        expect.objectContaining({ method: "DELETE" }),
      );
      expect(screen.queryByText("Penicillin")).not.toBeInTheDocument();
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

    render(<AllergiesTab homeId="h1" residentId="r1" />);
    await waitFor(() => screen.getByText("Penicillin"));

    const callsBefore = fetchMock.mock.calls.length;
    const removeButtons = screen.getAllByRole("button", { name: /remove/i });
    await userEvent.click(removeButtons[0]);
    await userEvent.click(screen.getByRole("button", { name: /cancel/i }));

    expect(screen.getByText("Penicillin")).toBeInTheDocument();
    expect(fetchMock.mock.calls.length).toBe(callsBefore);
    vi.unstubAllGlobals();
  });
});
