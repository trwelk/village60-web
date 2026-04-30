// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TasksSection } from "./TasksSection";

const refresh = vi.fn();
const push = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, refresh }),
}));

afterEach(() => {
  cleanup();
  refresh.mockClear();
  push.mockClear();
  vi.restoreAllMocks();
});

describe("TasksSection", () => {
  it("shows open tasks with home context and management actions", () => {
    render(
      <TasksSection
        homes={[{ id: "h1", name: "Sunrise" }]}
        tasks={[
          {
            kind: "manual",
            id: "t1",
            homeId: "h1",
            homeName: "Sunrise",
            title: "Call pharmacy",
            notes: "Confirm delivery window",
            dueDate: "2026-05-02",
            priority: "urgent",
            status: "open",
            createdByUserId: "u1",
            completedAtUtcMs: null,
            createdAtUtcMs: 1,
            updatedAtUtcMs: 1,
          },
        ]}
      />,
    );

    expect(screen.getAllByText("Sunrise").length).toBeGreaterThan(0);
    expect(screen.getByRole("heading", { name: "Call pharmacy" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Edit" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Complete" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Delete" })).toBeInTheDocument();
  });

  it("renders a payment overdue reminder with a billing link and no task actions", () => {
    render(
      <TasksSection
        homes={[{ id: "h1", name: "Sunrise" }]}
        tasks={[
          {
            kind: "payment_overdue",
            sourceId: "c1",
            homeId: "h1",
            homeName: "Sunrise",
            currencyCode: "NZD",
            residentId: "r1",
            residentName: "Morgan Lee",
            billingMonth: "2026-04",
            amountMinor: 500_00,
          },
        ]}
      />,
    );
    expect(screen.getByText(/Overdue monthly charge/)).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Open billing" }),
    ).toHaveAttribute(
      "href",
      "/dashboard/homes/h1/residents/r1?tab=billing",
    );
    expect(screen.queryByRole("button", { name: "Complete" })).toBeNull();
  });

  it("renders a resident birthday reminder with a resident link and no task actions", () => {
    render(
      <TasksSection
        homes={[{ id: "h1", name: "Sunrise" }]}
        tasks={[
          {
            kind: "resident_birthday",
            sourceId: "resident-birthday:r1:2026",
            homeId: "h1",
            homeName: "Sunrise",
            residentId: "r1",
            residentName: "Morgan Lee",
            birthdayDate: "2026-04-30",
          },
        ]}
      />,
    );
    expect(screen.getByText(/Resident birthday/)).toBeInTheDocument();
    expect(screen.getByText(/Morgan Lee/)).toBeInTheDocument();
    expect(screen.getByText(/2026-04-30/)).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Open resident" }),
    ).toHaveAttribute(
      "href",
      "/dashboard/homes/h1/residents/r1",
    );
    expect(screen.queryByRole("button", { name: "Complete" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Delete" })).toBeNull();
  });

  it("completes a task through the task API", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(JSON.stringify({ task: {} }), { status: 200 }));
    const user = userEvent.setup();
    render(
      <TasksSection
        homes={[{ id: "h1", name: "Sunrise" }]}
        tasks={[
          {
            kind: "manual",
            id: "t1",
            homeId: "h1",
            homeName: "Sunrise",
            title: "Call pharmacy",
            notes: null,
            dueDate: null,
            priority: "normal",
            status: "open",
            createdByUserId: "u1",
            completedAtUtcMs: null,
            createdAtUtcMs: 1,
            updatedAtUtcMs: 1,
          },
        ]}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Complete" }));
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/tasks/t1",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ status: "completed" }),
      }),
    );
    expect(refresh).toHaveBeenCalled();
  });
});
