// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MedicationsTab } from "./MedicationsTab";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function pathnameOf(urlLike: string): string {
  return new URL(urlLike, "http://localhost").pathname;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("MedicationsTab formulary combobox (31c)", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  it("POSTs medicationId when user picks an existing formulary row", async () => {
    const fetchMock = vi.mocked(globalThis.fetch);

    fetchMock.mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url;
      const method = (init?.method ?? "GET").toUpperCase();
      const path = pathnameOf(url);

      if (path.endsWith("/clinical") && method === "GET") {
        return Promise.resolve(
          jsonResponse({
            conditions: [],
            allergies: [],
            medications: [],
          }),
        );
      }

      if (
        /^\/api\/homes\/[^/]+\/medications$/.test(path) &&
        method === "GET"
      ) {
        return Promise.resolve(
          jsonResponse({
            medications: [
              {
                id: "cat-met",
                name: "Metformin",
                strength: "500",
                unit: "tablet",
                homeId: "h1",
                createdAtUtcMs: 0,
                updatedAtUtcMs: 0,
              },
            ],
          }),
        );
      }

      if (path.endsWith("/clinical/medications") && method === "POST") {
        return Promise.resolve(jsonResponse({ medication: { id: "rm-new" } }));
      }

      return Promise.reject(new Error(`unhandled fetch: ${method} ${url}`));
    });

    render(
      <MedicationsTab homeId="h1" residentId="r1" hideSectionTitle unitPresets />,
    );

    await waitFor(() =>
      expect(screen.queryByText("Loading…")).not.toBeInTheDocument(),
    );

    const search = screen.getByPlaceholderText(/search formulary/i);
    await userEvent.click(search);
    await userEvent.clear(search);
    await userEvent.type(search, "Met");

    await waitFor(() => {
      expect(
        screen.getByRole("option", { name: "Metformin · 500 · tablet" }),
      ).toBeInTheDocument();
    });

    await userEvent.click(
      screen.getByRole("option", { name: "Metformin · 500 · tablet" }),
    );

    await userEvent.type(
      screen.getByPlaceholderText(/^qty per serving$/i),
      "1",
    );
    await userEvent.type(
      screen.getByPlaceholderText(/how and when it is taken/i),
      "With meals",
    );

    await userEvent.click(screen.getByRole("button", { name: /add medication/i }));

    await waitFor(() => {
      const post = fetchMock.mock.calls.find(
        (c) =>
          pathnameOf(String(c[0])).endsWith("/clinical/medications") &&
          (c[1] as { method?: string } | undefined)?.method === "POST",
      );
      expect(post).toBeDefined();
      const body = JSON.parse((post![1] as { body: string }).body);
      expect(body.medicationId).toBe("cat-met");
      expect(body).not.toHaveProperty("medication");
    });
  });

  it("shows field-level message when create-new hits duplicate formulary (catalog unique)", async () => {
    const fetchMock = vi.mocked(globalThis.fetch);

    fetchMock.mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url;
      const method = (init?.method ?? "GET").toUpperCase();
      const path = pathnameOf(url);

      if (path.endsWith("/clinical") && method === "GET") {
        return Promise.resolve(
          jsonResponse({
            conditions: [],
            allergies: [],
            medications: [],
          }),
        );
      }

      if (
        /^\/api\/homes\/[^/]+\/medications$/.test(path) &&
        method === "GET"
      ) {
        return Promise.resolve(jsonResponse({ medications: [] }));
      }

      if (path.endsWith("/clinical/medications") && method === "POST") {
        return Promise.resolve(
          jsonResponse(
            {
              error:
                "This home already has a medication with the same name, strength, and unit.",
            },
            400,
          ),
        );
      }

      return Promise.reject(new Error(`unhandled fetch: ${method} ${url}`));
    });

    render(
      <MedicationsTab homeId="h1" residentId="r1" hideSectionTitle unitPresets />,
    );

    await waitFor(() =>
      expect(screen.queryByText("Loading…")).not.toBeInTheDocument(),
    );

    await userEvent.click(
      screen.getByRole("button", { name: /create new formulary product/i }),
    );

    await userEvent.type(screen.getByPlaceholderText(/^name$/i), "Dup");
    await userEvent.type(screen.getByPlaceholderText(/^strength$/i), "10 mg");
    await userEvent.type(
      screen.getByPlaceholderText(/^qty per serving$/i),
      "1",
    );
    await userEvent.type(
      screen.getByPlaceholderText(/how and when it is taken/i),
      "Daily",
    );

    await userEvent.click(screen.getByRole("button", { name: /add medication/i }));

    await waitFor(() => {
      const alert = screen.getByRole("alert");
      expect(alert.textContent).toMatch(/same name, strength, and unit/i);
    });
  });

  it("shows banner when assigning the same catalog product twice (duplicate assignment)", async () => {
    const fetchMock = vi.mocked(globalThis.fetch);

    let postCount = 0;
    fetchMock.mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url;
      const method = (init?.method ?? "GET").toUpperCase();
      const path = pathnameOf(url);

      if (path.endsWith("/clinical") && method === "GET") {
        return Promise.resolve(
          jsonResponse({
            conditions: [],
            allergies: [],
            medications: [],
          }),
        );
      }

      if (
        /^\/api\/homes\/[^/]+\/medications$/.test(path) &&
        method === "GET"
      ) {
        return Promise.resolve(
          jsonResponse({
            medications: [
              {
                id: "cat-a",
                name: "Aspirin",
                strength: "100 mg",
                unit: "tablet",
                homeId: "h1",
                createdAtUtcMs: 0,
                updatedAtUtcMs: 0,
              },
            ],
          }),
        );
      }

      if (path.endsWith("/clinical/medications") && method === "POST") {
        postCount += 1;
        if (postCount === 1) {
          return Promise.resolve(jsonResponse({ medication: { id: "m1" } }));
        }
        return Promise.resolve(
          jsonResponse(
            { error: "This resident is already assigned this medication." },
            400,
          ),
        );
      }

      return Promise.reject(new Error(`unhandled fetch: ${method} ${url}`));
    });

    render(
      <MedicationsTab homeId="h1" residentId="r1" hideSectionTitle unitPresets />,
    );

    await waitFor(() =>
      expect(screen.queryByText("Loading…")).not.toBeInTheDocument(),
    );

    const search = screen.getByPlaceholderText(/search formulary/i);
    await userEvent.click(search);
    await userEvent.type(search, "Asp");

    await waitFor(() => {
      expect(
        screen.getByRole("option", { name: "Aspirin · 100 mg · tablet" }),
      ).toBeInTheDocument();
    });
    await userEvent.click(
      screen.getByRole("option", { name: "Aspirin · 100 mg · tablet" }),
    );

    await userEvent.type(
      screen.getByPlaceholderText(/^qty per serving$/i),
      "1",
    );
    await userEvent.type(
      screen.getByPlaceholderText(/how and when it is taken/i),
      "Daily",
    );

    await userEvent.click(screen.getByRole("button", { name: /add medication/i }));
    await waitFor(() => expect(postCount).toBe(1));

    const searchAgain = screen.getByPlaceholderText(/search formulary/i);
    await userEvent.click(searchAgain);
    await userEvent.clear(searchAgain);
    await userEvent.type(searchAgain, "Asp");

    await waitFor(() => {
      expect(
        screen.getByRole("option", { name: "Aspirin · 100 mg · tablet" }),
      ).toBeInTheDocument();
    });
    await userEvent.click(
      screen.getByRole("option", { name: "Aspirin · 100 mg · tablet" }),
    );

    await userEvent.type(
      screen.getByPlaceholderText(/^qty per serving$/i),
      "1",
    );
    await userEvent.type(
      screen.getByPlaceholderText(/how and when it is taken/i),
      "again",
    );

    await userEvent.click(screen.getByRole("button", { name: /add medication/i }));

    await waitFor(() => {
      expect(
        screen.getByText(/This resident is already assigned this medication/i),
      ).toBeInTheDocument();
    });
    expect(postCount).toBe(2);
  });

  it("POSTs nested medication for Create new formulary product path", async () => {
    const fetchMock = vi.mocked(globalThis.fetch);

    fetchMock.mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url;
      const method = (init?.method ?? "GET").toUpperCase();
      const path = pathnameOf(url);

      if (path.endsWith("/clinical") && method === "GET") {
        return Promise.resolve(
          jsonResponse({
            conditions: [],
            allergies: [],
            medications: [],
          }),
        );
      }

      if (
        /^\/api\/homes\/[^/]+\/medications$/.test(path) &&
        method === "GET"
      ) {
        return Promise.resolve(jsonResponse({ medications: [] }));
      }

      if (path.endsWith("/clinical/medications") && method === "POST") {
        return Promise.resolve(jsonResponse({ medication: { id: "new-line" } }));
      }

      return Promise.reject(new Error(`unhandled fetch: ${method} ${url}`));
    });

    render(
      <MedicationsTab homeId="h1" residentId="r1" hideSectionTitle unitPresets />,
    );

    await waitFor(() =>
      expect(screen.queryByText("Loading…")).not.toBeInTheDocument(),
    );

    await userEvent.click(
      screen.getByRole("button", { name: /create new formulary product/i }),
    );

    await userEvent.type(screen.getByPlaceholderText(/^name$/i), "NewMed");
    await userEvent.type(screen.getByPlaceholderText(/^strength$/i), "5 mg");
    await userEvent.type(
      screen.getByPlaceholderText(/^qty per serving$/i),
      "1",
    );
    await userEvent.type(
      screen.getByPlaceholderText(/how and when it is taken/i),
      "Daily",
    );

    await userEvent.click(screen.getByRole("button", { name: /add medication/i }));

    await waitFor(() => {
      const post = fetchMock.mock.calls.find(
        (c) =>
          pathnameOf(String(c[0])).endsWith("/clinical/medications") &&
          (c[1] as { method?: string } | undefined)?.method === "POST",
      );
      expect(post).toBeDefined();
      const body = JSON.parse((post![1] as { body: string }).body);
      expect(body.medication).toEqual({
        name: "NewMed",
        strength: "5 mg",
        unit: "tablet",
      });
      expect(body).not.toHaveProperty("medicationId");
    });
  });
});
