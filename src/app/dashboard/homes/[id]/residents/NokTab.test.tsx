// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ResidentWithoutFee } from "@/lib/residents/service";
import { NokTab } from "./NokTab";

afterEach(cleanup);

const BASE_RESIDENT: ResidentWithoutFee = {
  id: "r1",
  homeId: "h1",
  fullName: "Jane Doe",
  normalizedFullName: "jane doe",
  dob: "1940-03-15",
  admissionDate: "2023-06-01",
  wardId: null,
  roomText: null,
  status: "active",
  departureReason: null,
  departureAtUtcMs: null,
  nokName: "Bob Doe",
  nokContact: "021 555 1234",
  nokRelationship: "Son",
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

describe("NokTab", () => {
  it("shows NOK name, relationship, and contact in read-only mode", () => {
    render(<NokTab homeId="h1" residentId="r1" resident={BASE_RESIDENT} />);
    expect(screen.getByText("Bob Doe")).toBeInTheDocument();
    expect(screen.getByText("Son")).toBeInTheDocument();
    expect(screen.getByText("021 555 1234")).toBeInTheDocument();
  });

  it("Edit button activates the editable form", async () => {
    render(<NokTab homeId="h1" residentId="r1" resident={BASE_RESIDENT} />);
    await userEvent.click(screen.getByRole("button", { name: /edit/i }));
    expect(screen.getByRole("textbox", { name: /name/i })).toBeInTheDocument();
  });

  it("Save sends PATCH with only NOK fields", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ resident: BASE_RESIDENT }),
    });
    vi.stubGlobal("fetch", mockFetch);

    render(<NokTab homeId="h1" residentId="r1" resident={BASE_RESIDENT} />);
    await userEvent.click(screen.getByRole("button", { name: /edit/i }));
    await userEvent.click(screen.getByRole("button", { name: /save/i }));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        "/api/homes/h1/residents/r1",
        expect.objectContaining({
          method: "PATCH",
          body: JSON.stringify({
            nokName: "Bob Doe",
            nokContact: "021 555 1234",
            nokRelationship: "Son",
          }),
        }),
      );
    });

    vi.unstubAllGlobals();
  });

  it("Cancel in edit mode returns to read-only without saving", async () => {
    const mockFetch = vi.fn();
    vi.stubGlobal("fetch", mockFetch);

    render(<NokTab homeId="h1" residentId="r1" resident={BASE_RESIDENT} />);
    await userEvent.click(screen.getByRole("button", { name: /edit/i }));
    await userEvent.click(screen.getByRole("button", { name: /cancel/i }));

    expect(screen.getByText("Bob Doe")).toBeInTheDocument();
    expect(mockFetch).not.toHaveBeenCalled();

    vi.unstubAllGlobals();
  });
});
