// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ResidentWithoutFee } from "@/lib/residents/service";
import { AssignedNurseTab } from "./AssignedNurseTab";

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

const CARE_STAFF = [
  { id: "u1", email: "nurse.a@home.nz" },
  { id: "u2", email: "nurse.b@home.nz" },
];

describe("AssignedNurseTab", () => {
  it("shows No nurse assigned when assignedNurseUserId is null", () => {
    render(
      <AssignedNurseTab
        homeId="h1"
        residentId="r1"
        resident={BASE_RESIDENT}
        careStaffOptions={CARE_STAFF}
      />,
    );
    expect(screen.getByText(/no nurse assigned/i)).toBeInTheDocument();
  });

  it("shows display override text when set", () => {
    render(
      <AssignedNurseTab
        homeId="h1"
        residentId="r1"
        resident={{
          ...BASE_RESIDENT,
          assignedNurseDisplayOverride: "Agency nurse",
        }}
        careStaffOptions={CARE_STAFF}
      />,
    );
    expect(screen.getByText("Agency nurse")).toBeInTheDocument();
  });

  it("shows nurse email when assignedNurseUserId matches a care staff option", () => {
    render(
      <AssignedNurseTab
        homeId="h1"
        residentId="r1"
        resident={{ ...BASE_RESIDENT, assignedNurseUserId: "u1" }}
        careStaffOptions={CARE_STAFF}
      />,
    );
    expect(screen.getByText("nurse.a@home.nz")).toBeInTheDocument();
  });

  it("Edit button activates the editable form with a nurse selector", async () => {
    render(
      <AssignedNurseTab
        homeId="h1"
        residentId="r1"
        resident={BASE_RESIDENT}
        careStaffOptions={CARE_STAFF}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: /edit/i }));
    expect(screen.getByRole("combobox", { name: /nurse/i })).toBeInTheDocument();
  });

  it("Save sends PATCH with only assigned nurse fields", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ resident: BASE_RESIDENT }),
    });
    vi.stubGlobal("fetch", mockFetch);

    render(
      <AssignedNurseTab
        homeId="h1"
        residentId="r1"
        resident={BASE_RESIDENT}
        careStaffOptions={CARE_STAFF}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: /edit/i }));
    await userEvent.click(screen.getByRole("button", { name: /save/i }));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        "/api/homes/h1/residents/r1",
        expect.objectContaining({ method: "PATCH" }),
      );
    });

    const callBody = JSON.parse(
      (mockFetch.mock.calls[0][1] as RequestInit).body as string,
    );
    expect(Object.keys(callBody)).toEqual(
      expect.arrayContaining([
        "assignedNurseUserId",
        "assignedNurseDisplayOverride",
      ]),
    );
    expect(Object.keys(callBody)).not.toContain("nokName");

    vi.unstubAllGlobals();
  });

  it("Cancel in edit mode returns to read-only without saving", async () => {
    const mockFetch = vi.fn();
    vi.stubGlobal("fetch", mockFetch);

    render(
      <AssignedNurseTab
        homeId="h1"
        residentId="r1"
        resident={BASE_RESIDENT}
        careStaffOptions={CARE_STAFF}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: /edit/i }));
    await userEvent.click(screen.getByRole("button", { name: /cancel/i }));

    expect(screen.getByText(/no nurse assigned/i)).toBeInTheDocument();
    expect(mockFetch).not.toHaveBeenCalled();

    vi.unstubAllGlobals();
  });
});
