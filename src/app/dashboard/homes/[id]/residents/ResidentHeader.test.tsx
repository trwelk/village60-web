// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ResidentWithoutFee } from "@/lib/residents/service";
import { ResidentHeader } from "./ResidentHeader";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
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
  createdAtUtcMs: 0,
  updatedAtUtcMs: 0,
};

const WARDS = [{ id: "w1", label: "Ward A" }];

describe("ResidentHeader", () => {
  beforeEach(() => {
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

  it("shows full name in read-only mode", () => {
    render(
      <ResidentHeader homeId="h1" resident={BASE_RESIDENT} wards={WARDS} />,
    );
    expect(screen.getByText("Jane Doe")).toBeInTheDocument();
  });

  it("shows Active status badge in read-only mode", () => {
    render(
      <ResidentHeader homeId="h1" resident={BASE_RESIDENT} wards={WARDS} />,
    );
    expect(screen.getByTestId("status-badge")).toHaveTextContent("Active");
  });

  it("shows a Depart button for an active resident", () => {
    render(
      <ResidentHeader homeId="h1" resident={BASE_RESIDENT} wards={WARDS} />,
    );
    expect(screen.getByRole("button", { name: /^depart$/i })).toBeInTheDocument();
  });

  it("does not show Depart for a departed resident", () => {
    render(
      <ResidentHeader
        homeId="h1"
        resident={{ ...BASE_RESIDENT, status: "departed" }}
        wards={WARDS}
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
      />,
    );
    expect(screen.getByTestId("status-badge")).toHaveTextContent("Departed");
  });

  it("Edit button toggles to edit mode showing a name input", async () => {
    render(
      <ResidentHeader homeId="h1" resident={BASE_RESIDENT} wards={WARDS} />,
    );
    await userEvent.click(screen.getByRole("button", { name: /edit/i }));
    expect(screen.getByRole("textbox", { name: /full name/i })).toBeInTheDocument();
  });

  it("shows status badge in edit mode", async () => {
    render(
      <ResidentHeader homeId="h1" resident={BASE_RESIDENT} wards={WARDS} />,
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
      <ResidentHeader homeId="h1" resident={BASE_RESIDENT} wards={WARDS} />,
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
