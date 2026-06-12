// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ResidentWithoutFee } from "@/lib/residents/service";
import { ResidentHeader } from "./ResidentHeader";

const routerState = vi.hoisted(() => ({ refresh: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => routerState,
}));

afterEach(cleanup);

const BASE_RESIDENT: ResidentWithoutFee = {
  id: "r1",
  homeId: "h1",
  fullName: "Jane Doe",
  normalizedFullName: "jane doe",
  dob: "1940-03-15",
  admissionDate: "2023-06-01",
  wardId: "w1",
  roomText: "Room 12",
  status: "active",
  departureReason: null,
  departureAtUtcMs: null,
  nokName: null,
  nokContact: null,
  nokRelationship: null,
  poaSameAsNok: false,
  poaName: null,
  poaContact: null,
  poaRelationship: null,
  assignedNurseUserId: null,
  assignedNurseDisplayOverride: null,
  hasPortrait: false,
  portraitUpdatedAtUtcMs: null,
  publicToken: "public-token-1",
  createdAtUtcMs: 0,
  updatedAtUtcMs: 0,
};

const WARDS = [{ id: "w1", label: "Ward A" }];

describe("ResidentHeader", () => {
  beforeEach(() => {
    routerState.refresh.mockReset();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ resident: BASE_RESIDENT }),
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows portrait image in read mode when hasPortrait is true", () => {
    render(
      <ResidentHeader
        homeId="h1"
        resident={{
          ...BASE_RESIDENT,
          hasPortrait: true,
          portraitUpdatedAtUtcMs: 1_700_000_000_000,
        }}
        wards={WARDS}
        userRole="care"
      />,
    );
    const img = screen.getByRole("img", { name: /^portrait of jane doe$/i });
    expect(img.getAttribute("src")).toContain(
      "/api/homes/h1/residents/r1/photo?v=1700000000000",
    );
  });

  it("shows portrait placeholder in read mode when hasPortrait is false", () => {
    render(
      <ResidentHeader
        homeId="h1"
        resident={BASE_RESIDENT}
        wards={WARDS}
        userRole="care"
      />,
    );
    expect(screen.getByLabelText(/no portrait/i)).toBeInTheDocument();
    expect(
      screen.queryByRole("img", { name: /^portrait of jane doe$/i }),
    ).not.toBeInTheDocument();
  });

  it("does not show portrait file input in read-only mode", () => {
    render(
      <ResidentHeader
        homeId="h1"
        resident={BASE_RESIDENT}
        wards={WARDS}
        userRole="care"
      />,
    );
    expect(screen.queryByTestId("resident-portrait-file")).not.toBeInTheDocument();
  });

  it("shows portrait file input in edit mode for an active resident", async () => {
    render(
      <ResidentHeader
        homeId="h1"
        resident={BASE_RESIDENT}
        wards={WARDS}
        userRole="care"
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: /edit/i }));
    expect(screen.getByTestId("resident-portrait-file")).toBeInTheDocument();
  });

  it("disables Remove portrait when there is no portrait", async () => {
    render(
      <ResidentHeader
        homeId="h1"
        resident={BASE_RESIDENT}
        wards={WARDS}
        userRole="care"
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: /edit/i }));
    expect(screen.getByRole("button", { name: /remove portrait/i })).toBeDisabled();
  });

  it("does not show portrait file input in edit mode for a departed resident", async () => {
    render(
      <ResidentHeader
        homeId="h1"
        resident={{ ...BASE_RESIDENT, status: "departed" }}
        wards={WARDS}
        userRole="care"
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: /edit/i }));
    expect(screen.queryByTestId("resident-portrait-file")).not.toBeInTheDocument();
  });

  it("POSTs portrait on file choose and refreshes the router", async () => {
    const mockFetch = vi.fn(async (url: RequestInfo) => {
      const s = typeof url === "string" ? url : url.toString();
      if (s.includes("/residents/r1/photo")) {
        return {
          ok: true,
          status: 201,
          json: async () => ({ portraitUpdatedAtUtcMs: 99 }),
        };
      }
      return {
        ok: true,
        json: async () => ({ resident: BASE_RESIDENT }),
      };
    });
    vi.stubGlobal("fetch", mockFetch);

    render(
      <ResidentHeader
        homeId="h1"
        resident={BASE_RESIDENT}
        wards={WARDS}
        userRole="care"
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: /edit/i }));
    const file = new File([new Uint8Array([1, 2, 3])], "p.jpg", {
      type: "image/jpeg",
    });
    await userEvent.upload(screen.getByTestId("resident-portrait-file"), file);

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        "/api/homes/h1/residents/r1/photo",
        expect.objectContaining({ method: "POST", body: expect.any(FormData) }),
      );
      expect(routerState.refresh).toHaveBeenCalled();
    });
  });

  it("DELETEs portrait after confirm and refreshes the router", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const mockFetch = vi.fn(async (url: RequestInfo, init?: RequestInit) => {
      const s = typeof url === "string" ? url : url.toString();
      if (s.includes("/residents/r1/photo") && init?.method === "DELETE") {
        return { ok: true, status: 204 };
      }
      return {
        ok: true,
        json: async () => ({ resident: BASE_RESIDENT }),
      };
    });
    vi.stubGlobal("fetch", mockFetch);

    render(
      <ResidentHeader
        homeId="h1"
        resident={{
          ...BASE_RESIDENT,
          hasPortrait: true,
          portraitUpdatedAtUtcMs: 1,
        }}
        wards={WARDS}
        userRole="care"
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: /edit/i }));
    await userEvent.click(screen.getByRole("button", { name: /remove portrait/i }));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        "/api/homes/h1/residents/r1/photo",
        expect.objectContaining({ method: "DELETE" }),
      );
      expect(routerState.refresh).toHaveBeenCalled();
    });
  });

  it("does not DELETE portrait when remove confirm is cancelled", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ resident: BASE_RESIDENT }),
    });
    vi.stubGlobal("fetch", mockFetch);

    render(
      <ResidentHeader
        homeId="h1"
        resident={{
          ...BASE_RESIDENT,
          hasPortrait: true,
          portraitUpdatedAtUtcMs: 1,
        }}
        wards={WARDS}
        userRole="care"
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: /edit/i }));
    await userEvent.click(screen.getByRole("button", { name: /remove portrait/i }));

    expect(mockFetch).not.toHaveBeenCalledWith(
      "/api/homes/h1/residents/r1/photo",
      expect.objectContaining({ method: "DELETE" }),
    );
    expect(routerState.refresh).not.toHaveBeenCalled();
  });

  it("shows portrait API error in edit mode", async () => {
    const mockFetch = vi.fn(async (url: RequestInfo) => {
      const s = typeof url === "string" ? url : url.toString();
      if (s.includes("/residents/r1/photo")) {
        return {
          ok: false,
          status: 400,
          json: async () => ({ error: "Portrait too large." }),
        };
      }
      return {
        ok: true,
        json: async () => ({ resident: BASE_RESIDENT }),
      };
    });
    vi.stubGlobal("fetch", mockFetch);

    render(
      <ResidentHeader
        homeId="h1"
        resident={BASE_RESIDENT}
        wards={WARDS}
        userRole="care"
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: /edit/i }));
    const file = new File([new Uint8Array([1])], "p.jpg", {
      type: "image/jpeg",
    });
    await userEvent.upload(screen.getByTestId("resident-portrait-file"), file);

    await waitFor(() => {
      expect(screen.getByText("Portrait too large.")).toBeInTheDocument();
    });
  });

  it("shows full name in read-only mode", () => {
    render(
      <ResidentHeader
        homeId="h1"
        resident={BASE_RESIDENT}
        wards={WARDS}
        userRole="care"
      />,
    );
    expect(screen.getByText("Jane Doe")).toBeInTheDocument();
  });

  it("shows Active status badge in read-only mode", () => {
    render(
      <ResidentHeader
        homeId="h1"
        resident={BASE_RESIDENT}
        wards={WARDS}
        userRole="care"
      />,
    );
    expect(screen.getByTestId("status-badge")).toHaveTextContent("Active");
  });

  it("shows a Depart button for an active resident", () => {
    render(
      <ResidentHeader
        homeId="h1"
        resident={BASE_RESIDENT}
        wards={WARDS}
        userRole="care"
      />,
    );
    expect(screen.getByRole("button", { name: /^depart$/i })).toBeInTheDocument();
  });

  it("links Medications to the resident medications page", () => {
    render(
      <ResidentHeader
        homeId="h1"
        resident={BASE_RESIDENT}
        wards={WARDS}
        userRole="care"
      />,
    );
    const link = screen.getByRole("link", { name: /^medications$/i });
    expect(link).toHaveAttribute(
      "href",
      "/dashboard/residents/r1/medications",
    );
  });

  it("shows Invoices and Ledger links for admin", () => {
    render(
      <ResidentHeader
        homeId="h1"
        resident={BASE_RESIDENT}
        wards={WARDS}
        userRole="admin"
      />,
    );
    expect(screen.getByRole("link", { name: /^invoices$/i })).toHaveAttribute(
      "href",
      "/dashboard/invoices?homeId=h1&residentId=r1",
    );
    expect(screen.getByRole("link", { name: /^ledger$/i })).toHaveAttribute(
      "href",
      "/dashboard/ledger?resident=r1",
    );
  });

  it("does not show Invoices or Ledger links for care staff", () => {
    render(
      <ResidentHeader
        homeId="h1"
        resident={BASE_RESIDENT}
        wards={WARDS}
        userRole="care"
      />,
    );
    expect(screen.queryByRole("link", { name: /^invoices$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /^ledger$/i })).not.toBeInTheDocument();
  });

  it("does not show Medications for a departed resident", () => {
    render(
      <ResidentHeader
        homeId="h1"
        resident={{ ...BASE_RESIDENT, status: "departed" }}
        wards={WARDS}
        userRole="care"
      />,
    );
    expect(
      screen.queryByRole("link", { name: /^medications$/i }),
    ).not.toBeInTheDocument();
  });

  it("does not show Depart for a departed resident", () => {
    render(
      <ResidentHeader
        homeId="h1"
        resident={{ ...BASE_RESIDENT, status: "departed" }}
        wards={WARDS}
        userRole="care"
      />,
    );
    expect(screen.queryByRole("button", { name: /^depart$/i })).not.toBeInTheDocument();
  });

  it("shows Departed status badge for a departed resident", () => {
    render(
      <ResidentHeader
        homeId="h1"
        resident={{ ...BASE_RESIDENT, status: "departed" }}
        wards={WARDS}
        userRole="care"
      />,
    );
    expect(screen.getByTestId("status-badge")).toHaveTextContent("Departed");
  });

  it("Edit button toggles to edit mode showing a name input", async () => {
    render(
      <ResidentHeader
        homeId="h1"
        resident={BASE_RESIDENT}
        wards={WARDS}
        userRole="care"
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: /edit/i }));
    expect(screen.getByRole("textbox", { name: /full name/i })).toBeInTheDocument();
  });

  it("shows status badge in edit mode", async () => {
    render(
      <ResidentHeader
        homeId="h1"
        resident={BASE_RESIDENT}
        wards={WARDS}
        userRole="care"
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: /edit/i }));
    expect(screen.getByTestId("status-badge")).toHaveTextContent("Active");
  });

  it("Save calls PATCH with correct endpoint and method", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ resident: { ...BASE_RESIDENT, fullName: "Jane Smith" } }),
    });
    vi.stubGlobal("fetch", mockFetch);

    render(
      <ResidentHeader
        homeId="h1"
        resident={BASE_RESIDENT}
        wards={WARDS}
        userRole="care"
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: /edit/i }));
    const nameInput = screen.getByRole("textbox", { name: /full name/i });
    await userEvent.clear(nameInput);
    await userEvent.type(nameInput, "Jane Smith");
    await userEvent.click(screen.getByRole("button", { name: /save/i }));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        "/api/homes/h1/residents/r1",
        expect.objectContaining({ method: "PATCH" }),
      );
    });
  });
});
