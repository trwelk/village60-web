// @vitest-environment jsdom

import { render, screen, waitFor, within } from "@testing-library/react";
import type { ReactElement } from "react";
import userEvent from "@testing-library/user-event";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { DASHBOARD_SIDEBAR_EXPANDED_KEY } from "@/lib/dashboard/sidebarExpandedStorage";
import { DashboardWayfindingProvider } from "./DashboardWayfinding";
import { DashboardAppShell } from "./DashboardAppShell";

beforeAll(() => {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    configurable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
});

const pathRef = { current: "/dashboard" };

vi.mock("next/navigation", () => ({
  usePathname: () => pathRef.current,
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

function renderShell(ui: ReactElement) {
  return render(
    <DashboardWayfindingProvider>{ui}</DashboardWayfindingProvider>,
  );
}

describe("DashboardAppShell", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("exposes a skip link that points at the main landmark", () => {
    pathRef.current = "/dashboard";
    renderShell(
      <DashboardAppShell email="a@b.c" role="care">
        <p>content</p>
      </DashboardAppShell>,
    );
    const skip = screen.getByRole("link", { name: /skip to main content/i });
    expect(skip).toHaveAttribute("href", "#village-dashboard-main");
    expect(
      document.getElementById("village-dashboard-main")?.tagName,
    ).toBe("MAIN");
  });

  it("shows a static context title for the current hub route", () => {
    pathRef.current = "/dashboard";
    const { rerender } = renderShell(
      <DashboardAppShell email="a@b.c" role="care">
        <p>content</p>
      </DashboardAppShell>,
    );
    const top = within(screen.getByRole("banner"));
    expect(
      top.getByRole("heading", { level: 1, name: "Overview" }),
    ).toBeInTheDocument();

    pathRef.current = "/dashboard/homes/xyz/wards";
    rerender(
      <DashboardWayfindingProvider>
        <DashboardAppShell email="a@b.c" role="admin">
          <p>content</p>
        </DashboardAppShell>
      </DashboardWayfindingProvider>,
    );
    expect(
      within(screen.getByRole("banner")).getByRole("heading", {
        level: 1,
        name: "Retirement homes",
      }),
    ).toBeInTheDocument();
  });

  it("hides admin-only primary links for care users", () => {
    pathRef.current = "/dashboard";
    renderShell(
      <DashboardAppShell email="a@b.c" role="care">
        <p>content</p>
      </DashboardAppShell>,
    );
    const navs = screen.getAllByRole("navigation", { name: "Main navigation" });
    const desktopNav = navs.find(
      (n) => n.parentElement?.getAttribute("aria-label") === "Primary",
    );
    const rail = within(desktopNav as HTMLElement);
    expect(rail.getByRole("link", { name: "Tasks" })).toHaveAttribute(
      "href",
      "/dashboard/tasks",
    );
    expect(rail.queryByRole("link", { name: "Staff" })).not.toBeInTheDocument();
  });

  it("admin sees Analytics nav link in the desktop rail", () => {
    pathRef.current = "/dashboard";
    renderShell(
      <DashboardAppShell email="a@b.c" role="admin">
        <p>content</p>
      </DashboardAppShell>,
    );
    const rail = screen.getByRole("complementary", { name: "Primary" });
    expect(
      within(rail).getByRole("link", { name: "Analytics" }),
    ).toHaveAttribute("href", "/dashboard/analytics");
  });

  it("care user does not see Analytics link", () => {
    pathRef.current = "/dashboard";
    renderShell(
      <DashboardAppShell email="a@b.c" role="care">
        <p>content</p>
      </DashboardAppShell>,
    );
    const rail = screen.getByRole("complementary", { name: "Primary" });
    expect(
      within(rail).queryByRole("link", { name: "Analytics" }),
    ).not.toBeInTheDocument();
  });

  it("Analytics link is active when on /dashboard/analytics", () => {
    pathRef.current = "/dashboard/analytics";
    renderShell(
      <DashboardAppShell email="a@b.c" role="admin">
        <p>content</p>
      </DashboardAppShell>,
    );
    const rail = screen.getByRole("complementary", { name: "Primary" });
    const link = within(rail).getByRole("link", { name: "Analytics" });
    expect(link).toHaveAttribute("aria-current", "page");
  });

  it("opens the mobile drawer, traps focus, and dismisses on Escape", async () => {
    pathRef.current = "/dashboard";
    const user = userEvent.setup();
    renderShell(
      <DashboardAppShell email="a@b.c" role="admin">
        <p>content</p>
      </DashboardAppShell>,
    );
    const openBtn = screen.getByRole("button", { name: /open main menu/i });
    await user.click(openBtn);

    const dialog = screen.getByRole("dialog", { name: "Main navigation" });
    const menuClose = within(dialog).getByRole("button", { name: "Close" });
    expect(document.activeElement).toBe(menuClose);

    await user.tab();
    const links = within(dialog).getAllByRole("link");
    expect(links[0] === document.activeElement).toBe(true);

    const lastLink = within(dialog).getByRole("link", { name: "Staff" });
    lastLink?.focus();
    await user.tab();
    expect(menuClose === document.activeElement).toBe(true);

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog", { name: "Main navigation" })).toBeNull();
    expect(document.activeElement).toBe(openBtn);
  });

  it("lg+ rail: collapse toggle is expanded by default, flips aria-pressed, and persists", async () => {
    pathRef.current = "/dashboard";
    const user = userEvent.setup();
    renderShell(
      <DashboardAppShell email="a@b.c" role="admin">
        <p>content</p>
      </DashboardAppShell>,
    );
    const rail = screen.getByRole("complementary", { name: "Primary" });
    const toggle = within(rail).getByRole("button", {
      name: /collapse navigation rail/i,
    });
    expect(toggle).toHaveAttribute("aria-pressed", "true");

    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-pressed", "false");
    expect(localStorage.getItem(DASHBOARD_SIDEBAR_EXPANDED_KEY)).toBe("false");
  });

  it("lg+ rail: restores collapsed preference from localStorage after mount", async () => {
    localStorage.setItem(DASHBOARD_SIDEBAR_EXPANDED_KEY, "false");
    pathRef.current = "/dashboard";
    renderShell(
      <DashboardAppShell email="a@b.c" role="admin">
        <p>content</p>
      </DashboardAppShell>,
    );
    const rail = screen.getByRole("complementary", { name: "Primary" });
    await waitFor(() => {
      expect(
        within(rail).getByRole("button", { name: /expand navigation rail/i }),
      ).toHaveAttribute("aria-pressed", "false");
    });
  });
});
