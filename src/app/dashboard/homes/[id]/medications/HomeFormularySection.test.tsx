// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HomeFormularySection } from "./HomeFormularySection";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

const CAT_ROW = {
  id: "cat1",
  homeId: "hx",
  name: "Vitamin C",
  strength: "500mg",
  unit: "tablet",
  createdAtUtcMs: 1,
  updatedAtUtcMs: 1,
};

describe("HomeFormularySection", () => {
  it("shows server message when catalogue POST conflicts on uniqueness", async () => {
    const catalogMed: typeof CAT_ROW[] = [];
    let postOrdinal = 0;

    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const urlRaw =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url;
      const pathname = new URL(urlRaw, "http://x").pathname;
      const method = init?.method?.toUpperCase() ?? "GET";

      if (pathname === "/api/homes/hx/medications" && method === "GET") {
        return Promise.resolve({
          ok: true,
          json: async () => ({ medications: catalogMed }),
        });
      }
      if (pathname === "/api/homes/hx/medications" && method === "POST") {
        postOrdinal++;
        if (postOrdinal === 1) {
          catalogMed.push(CAT_ROW);
          return Promise.resolve({
            ok: true,
            status: 201,
            json: async () => ({ medication: CAT_ROW }),
          });
        }
        return Promise.resolve({
          ok: false,
          status: 400,
          json: async () => ({
            error:
              "This home already has a medication with the same name, strength, and unit.",
          }),
        });
      }
      return Promise.reject(new Error(`Unexpected fetch ${urlRaw} ${method}`));
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<HomeFormularySection homeId="hx" />);

    await waitFor(() => screen.getByLabelText(/^search formulary$/i));

    await userEvent.click(screen.getByRole("button", { name: /^add medication$/i }));

    await waitFor(() =>
      screen.getByRole("heading", { name: /^add medication$/i }),
    );

    await userEvent.type(screen.getByPlaceholderText(/^name$/i), "Vitamin C");
    await userEvent.type(screen.getByPlaceholderText(/^strength$/i), "500mg");

    await userEvent.click(screen.getByRole("button", { name: /save product/i }));

    await waitFor(() => {
      expect(screen.getByRole("cell", { name: /vitamin c/i })).toBeInTheDocument();
    });

    await userEvent.click(screen.getByRole("button", { name: /^add medication$/i }));

    await waitFor(() =>
      screen.getByRole("heading", { name: /^add medication$/i }),
    );

    await userEvent.clear(screen.getByPlaceholderText(/^name$/i));
    await userEvent.type(screen.getByPlaceholderText(/^name$/i), "Vitamin C");
    await userEvent.clear(screen.getByPlaceholderText(/^strength$/i));
    await userEvent.type(screen.getByPlaceholderText(/^strength$/i), "500mg");

    await userEvent.click(screen.getByRole("button", { name: /save product/i }));

    await waitFor(() => {
      expect(
        screen.getByText(/same name, strength, and unit/i),
      ).toBeInTheDocument();
    });

    vi.unstubAllGlobals();
  });
});
