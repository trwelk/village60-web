// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ResidentEditor } from "./ResidentEditor";

const pushMock = vi.fn();
const refreshMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock, refresh: refreshMock }),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

async function pickSelectOption(label: string, optionName: string | RegExp) {
  await userEvent.click(screen.getByLabelText(label));
  await userEvent.click(
    await screen.findByRole("option", { name: optionName }),
  );
}

describe("ResidentEditor create wizard", () => {
  it("renders immediately when opened as the create modal", async () => {
    const onCloseCreate = vi.fn();

    render(
      <ResidentEditor
        mode="create"
        homeId="h1"
        homeName="Home A"
        wards={[{ id: "w1", label: "North" }]}
        onCloseCreate={onCloseCreate}
      />,
    );

    expect(screen.getByText(/Step\s*1\s*of\s*5/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Next" })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onCloseCreate).toHaveBeenCalledTimes(1);
  });

  it("blocks Next on a full ward", async () => {
    render(
      <ResidentEditor
        mode="create"
        homeId="h1"
        homeName="Home A"
        wards={[{ id: "w1", label: "North", isFull: true }]}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText(/Step\s*1\s*of\s*5/)).toBeInTheDocument();
    });
    await pickSelectOption("Ward", "North");
    await userEvent.click(screen.getByRole("button", { name: "Next" }));

    expect(screen.getByText("Ward full.")).toBeInTheDocument();
    expect(screen.getByText(/Step\s*1\s*of\s*5/)).toBeInTheDocument();
  });

  it("moves through wizard steps and validates demographics", async () => {
    render(
      <ResidentEditor
        mode="create"
        homeId="h1"
        homeName="Home A"
        wards={[{ id: "w1", label: "North" }]}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText(/Step\s*1\s*of\s*5/)).toBeInTheDocument();
    });
    await pickSelectOption("Ward", "North");
    await userEvent.click(screen.getByRole("button", { name: "Next" }));
    await waitFor(() => {
      expect(screen.getByText(/Step\s*2\s*of\s*5/)).toBeInTheDocument();
    });

    await userEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByText(/Step\s*2\s*of\s*5/)).toBeInTheDocument();
  });

  it(
    "submits create payload with required NOK plus optional nurse fields",
    async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ resident: { id: "r1" } }),
      });
      vi.stubGlobal("fetch", fetchMock);

      render(
        <ResidentEditor
          mode="create"
          homeId="h1"
          homeName="Home A"
          wards={[{ id: "w1", label: "North" }]}
          careStaffOptions={[{ id: "u1", email: "care@example.com" }]}
        />,
      );

      await waitFor(() => {
        expect(screen.getByLabelText("Ward")).toBeInTheDocument();
      });
      await pickSelectOption("Ward", "North");
      await userEvent.click(screen.getByRole("button", { name: "Next" }));
      await userEvent.type(screen.getByLabelText("Full name"), "Taylor Reed");
      fireEvent.change(screen.getByLabelText("Date of birth"), {
        target: { value: "1950-01-01" },
      });
      fireEvent.change(screen.getByLabelText("Admission date"), {
        target: { value: "2026-04-30" },
      });
      await userEvent.click(screen.getByRole("button", { name: "Next" }));

      await userEvent.type(screen.getByLabelText("NOK name"), "Nok Name");
      await userEvent.type(
        screen.getByLabelText("NOK contact"),
        "021 999 555",
      );
      await userEvent.type(
        screen.getByLabelText("NOK relationship"),
        "Daughter",
      );
      await userEvent.click(screen.getByRole("button", { name: "Next" }));

      await pickSelectOption("Assigned nurse (optional)", "care@example.com");
      await userEvent.type(
        screen.getByLabelText("Nurse display override (optional)"),
        "Agency Nurse",
      );
      await userEvent.click(screen.getByRole("button", { name: "Next" }));
      await userEvent.click(screen.getByRole("button", { name: "Create resident" }));

      await waitFor(
        () => {
          expect(fetchMock).toHaveBeenCalled();
        },
        { timeout: 12_000 },
      );
      const createCall = fetchMock.mock.calls.find(
        (args) => args[0] === "/api/homes/h1/residents",
      );
      expect(createCall).toBeDefined();
      const body = JSON.parse(
        (createCall?.[1] as { body?: string } | undefined)?.body ?? "{}",
      );
      expect(body.fullName).toBe("Taylor Reed");
      expect(body.wardId).toBe("w1");
      expect(body.nokName).toBe("Nok Name");
      expect(body.nokContact).toBe("021 999 555");
      expect(body.nokRelationship).toBe("Daughter");
      expect(body.assignedNurseUserId).toBe("u1");
      expect(body.assignedNurseDisplayOverride).toBe("Agency Nurse");

      expect(pushMock).toHaveBeenCalledWith("/dashboard/residents/r1");
    },
    20_000,
  );

  it(
    "after create, POSTs wizard clinical allergies and conditions",
    async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ resident: { id: "r1" } }),
      });
      vi.stubGlobal("fetch", fetchMock);

      render(
        <ResidentEditor
          mode="create"
          homeId="h1"
          homeName="Home A"
          wards={[{ id: "w1", label: "North" }]}
        />,
      );

      await waitFor(() => {
        expect(screen.getByLabelText("Ward")).toBeInTheDocument();
      });
      await pickSelectOption("Ward", "North");
      await userEvent.click(screen.getByRole("button", { name: "Next" }));

      await userEvent.type(screen.getByLabelText("Full name"), "Taylor Reed");
      fireEvent.change(screen.getByLabelText("Date of birth"), {
        target: { value: "1950-01-01" },
      });
      fireEvent.change(screen.getByLabelText("Admission date"), {
        target: { value: "2026-04-30" },
      });
      await userEvent.click(screen.getByRole("button", { name: "Next" }));

      await userEvent.type(screen.getByLabelText("NOK name"), "Nok Name");
      await userEvent.type(
        screen.getByLabelText("NOK contact"),
        "021 999 555",
      );
      await userEvent.type(
        screen.getByLabelText("NOK relationship"),
        "Daughter",
      );
      await userEvent.click(screen.getByRole("button", { name: "Next" }));

      await userEvent.type(
        screen.getByLabelText(/Allergies \(optional, one per line\)/i),
        "Peanuts",
      );
      await userEvent.type(
        screen.getByLabelText(/Conditions \(optional, one per line\)/i),
        "Hypertension",
      );
      await userEvent.click(screen.getByRole("button", { name: "Next" }));
      await userEvent.click(screen.getByRole("button", { name: "Create resident" }));

      await waitFor(
        () => {
          const allergyCall = fetchMock.mock.calls.find(
            (c) =>
              typeof c[0] === "string" &&
              c[0].endsWith("/residents/r1/clinical/allergies") &&
              (c[1] as { method?: string })?.method === "POST",
          );
          expect(allergyCall).toBeDefined();
        },
        { timeout: 12_000 },
      );
      const allergyCall = fetchMock.mock.calls.find(
        (c) =>
          typeof c[0] === "string" &&
          c[0].endsWith("/residents/r1/clinical/allergies") &&
          (c[1] as { method?: string })?.method === "POST",
      );
      const conditionCall = fetchMock.mock.calls.find(
        (c) =>
          typeof c[0] === "string" &&
          c[0].endsWith("/residents/r1/clinical/conditions") &&
          (c[1] as { method?: string })?.method === "POST",
      );
      expect(JSON.parse(
        (allergyCall?.[1] as { body?: string } | undefined)?.body ?? "{}",
      )).toEqual({ allergen: "Peanuts" });
      expect(JSON.parse(
        (conditionCall?.[1] as { body?: string } | undefined)?.body ?? "{}",
      )).toEqual({ label: "Hypertension" });
    },
    25_000,
  );
});
