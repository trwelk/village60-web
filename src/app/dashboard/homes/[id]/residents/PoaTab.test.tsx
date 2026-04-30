// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ResidentWithoutFee } from "@/lib/residents/service";
import { PoaTab } from "./PoaTab";

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
  poaName: "Alice Smith",
  poaContact: "021 999 5678",
  poaRelationship: "Daughter",
  assignedNurseUserId: null,
  assignedNurseDisplayOverride: null,
  createdAtUtcMs: 0,
  updatedAtUtcMs: 0,
};

describe("PoaTab", () => {
  it("shows POA fields in read-only mode when not same as NOK", () => {
    render(<PoaTab homeId="h1" residentId="r1" resident={BASE_RESIDENT} />);
    expect(screen.getByText("Alice Smith")).toBeInTheDocument();
    expect(screen.getByText("Daughter")).toBeInTheDocument();
    expect(screen.getByText("021 999 5678")).toBeInTheDocument();
  });

  it("shows Same as Next of Kin indicator when poaSameAsNok is true", () => {
    render(
      <PoaTab
        homeId="h1"
        residentId="r1"
        resident={{ ...BASE_RESIDENT, poaSameAsNok: true, poaName: null, poaContact: null, poaRelationship: null }}
      />,
    );
    expect(screen.getByText(/same as next of kin/i)).toBeInTheDocument();
    expect(screen.queryByText("Alice Smith")).not.toBeInTheDocument();
  });

  it("Edit button activates the editable form", async () => {
    render(<PoaTab homeId="h1" residentId="r1" resident={BASE_RESIDENT} />);
    await userEvent.click(screen.getByRole("button", { name: /edit/i }));
    expect(screen.getByRole("textbox", { name: /name/i })).toBeInTheDocument();
  });

  it("Save sends PATCH with only POA fields", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ resident: BASE_RESIDENT }),
    });
    vi.stubGlobal("fetch", mockFetch);

    render(<PoaTab homeId="h1" residentId="r1" resident={BASE_RESIDENT} />);
    await userEvent.click(screen.getByRole("button", { name: /edit/i }));
    await userEvent.click(screen.getByRole("button", { name: /save/i }));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        "/api/homes/h1/residents/r1",
        expect.objectContaining({
          method: "PATCH",
          body: expect.stringContaining('"poaSameAsNok"'),
        }),
      );
    });

    const callBody = JSON.parse(
      (mockFetch.mock.calls[0][1] as RequestInit).body as string,
    );
    expect(Object.keys(callBody)).toEqual(
      expect.arrayContaining([
        "poaSameAsNok",
        "poaName",
        "poaContact",
        "poaRelationship",
      ]),
    );
    expect(Object.keys(callBody)).not.toContain("nokName");

    vi.unstubAllGlobals();
  });

  it("Cancel in edit mode returns to read-only without saving", async () => {
    const mockFetch = vi.fn();
    vi.stubGlobal("fetch", mockFetch);

    render(<PoaTab homeId="h1" residentId="r1" resident={BASE_RESIDENT} />);
    await userEvent.click(screen.getByRole("button", { name: /edit/i }));
    await userEvent.click(screen.getByRole("button", { name: /cancel/i }));

    expect(screen.getByText("Alice Smith")).toBeInTheDocument();
    expect(mockFetch).not.toHaveBeenCalled();

    vi.unstubAllGlobals();
  });
});
