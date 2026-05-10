// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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
    fireEvent.click(rail.getByRole("button", { name: "Admin" }));
    expect(rail.getByRole("link", { name: "Tasks" })).toHaveAttribute(
      "href",
      "/dashboard/tasks",
    );
    expect(rail.queryByRole("link", { name: "Staff" })).not.toBeInTheDocument();
    expect(rail.queryByRole("link", { name: "Leads" })).not.toBeInTheDocument();
  });

  it("admin sees Analytics sub‑nav links in the desktop rail", () => {
    pathRef.current = "/dashboard";
    renderShell(
      <DashboardAppShell email="a@b.c" role="admin">
        <p>content</p>
      </DashboardAppShell>,
    );
    const rail = screen.getByRole("complementary", { name: "Primary" });
    const mainNav = within(rail).getByRole("navigation", {
      name: "Main navigation",
    });
    fireEvent.click(within(mainNav).getByRole("button", { name: "Billing" }));
    expect(
      within(mainNav).getByRole("link", { name: "Invoices" }),
    ).toHaveAttribute("href", "/dashboard/invoices");
    expect(
      within(mainNav).getByRole("link", { name: "Resident charges" }),
    ).toHaveAttribute("href", "/dashboard/charges");
    expect(
      within(mainNav).getByRole("link", { name: "Home charges" }),
    ).toHaveAttribute("href", "/dashboard/home-expenses");

    fireEvent.click(within(mainNav).getByRole("button", { name: "Ledger" }));
    expect(
      within(mainNav).getByRole("link", { name: "Ledger" }),
    ).toHaveAttribute("href", "/dashboard/ledger");
    expect(
      within(mainNav).getByRole("link", { name: "Home payments" }),
    ).toHaveAttribute("href", "/dashboard/home-payments");
    expect(
      within(mainNav).getByRole("link", { name: "Resident payments" }),
    ).toHaveAttribute("href", "/dashboard/payments");

    fireEvent.click(within(mainNav).getByRole("button", { name: "Analytics" }));
    expect(
      within(mainNav).getByRole("link", { name: "Billing overview" }),
    ).toHaveAttribute("href", "/dashboard/analytics/financial");
    expect(
      within(mainNav).getByRole("link", { name: "Admissions" }),
    ).toHaveAttribute("href", "/dashboard/analytics/admissions-departures");
    expect(
      within(mainNav).getByRole("link", { name: "Demographics" }),
    ).toHaveAttribute("href", "/dashboard/analytics/demographics-staff");

    fireEvent.click(
      within(mainNav).getByRole("button", { name: "Organization" }),
    );
    expect(
      within(mainNav).getByRole("link", { name: "Leads" }),
    ).toHaveAttribute("href", "/dashboard/leads");
  });

  it("care user sees Operations group with Residents, Tasks, and homes", () => {
    pathRef.current = "/dashboard";
    renderShell(
      <DashboardAppShell email="a@b.c" role="care">
        <p>content</p>
      </DashboardAppShell>,
    );
    const rail = screen.getByRole("complementary", { name: "Primary" });
    const mainNav = within(rail).getByRole("navigation", {
      name: "Main navigation",
    });
    expect(
      within(mainNav).getByRole("button", { name: "Admin" }),
    ).toBeInTheDocument();
    fireEvent.click(within(mainNav).getByRole("button", { name: "Admin" }));
    expect(
      within(mainNav).getByRole("link", { name: "Your homes" }),
    ).toHaveAttribute("href", "/dashboard/homes");
  });

  it("care user does not see Analytics sub‑nav links", () => {
    pathRef.current = "/dashboard";
    renderShell(
      <DashboardAppShell email="a@b.c" role="care">
        <p>content</p>
      </DashboardAppShell>,
    );
    const rail = screen.getByRole("complementary", { name: "Primary" });
    expect(
      within(rail).queryByRole("link", { name: "Billing overview" }),
    ).not.toBeInTheDocument();
  });

  it("Invoices hub title applies on invoice detail path", () => {
    pathRef.current = "/dashboard/invoices/uuid-example";
    renderShell(
      <DashboardAppShell email="a@b.c" role="admin">
        <p>content</p>
      </DashboardAppShell>,
    );
    expect(
      within(screen.getByRole("banner")).getByRole("heading", {
        level: 1,
        name: "Invoices",
      }),
    ).toBeInTheDocument();
  });

  it("Billing overview nav is active when on /dashboard/analytics (redirect target)", () => {
    pathRef.current = "/dashboard/analytics";
    renderShell(
      <DashboardAppShell email="a@b.c" role="admin">
        <p>content</p>
      </DashboardAppShell>,
    );
    const rail = screen.getByRole("complementary", { name: "Primary" });
    const link = within(rail).getByRole("link", {
      name: "Billing overview",
    });
    expect(link).toHaveAttribute("aria-current", "page");
  });

  it("Billing overview nav is active on analytics financial route", () => {
    pathRef.current = "/dashboard/analytics/financial";
    renderShell(
      <DashboardAppShell email="a@b.c" role="admin">
        <p>content</p>
      </DashboardAppShell>,
    );
    const rail = screen.getByRole("complementary", { name: "Primary" });
    const link = within(rail).getByRole("link", {
      name: "Billing overview",
    });
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

    const lastLink = within(dialog).getByRole("link", { name: "My account" });
    lastLink?.focus();
    await user.tab();
    expect(menuClose === document.activeElement).toBe(true);

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog", { name: "Main navigation" })).toBeNull();
    expect(document.activeElement).toBe(openBtn);
  });

  it("lg+ rail: collapse toggle is expanded by default, flips aria-pressed, and persists", () => {
    pathRef.current = "/dashboard";
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

    fireEvent.click(toggle);
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

  it("lg+ minimized rail shows one link per hub (8 slots for admins)", async () => {
    pathRef.current = "/dashboard";
    renderShell(
      <DashboardAppShell email="a@b.c" role="admin">
        <p>content</p>
      </DashboardAppShell>,
    );
    const rail = screen.getByRole("complementary", { name: "Primary" });
    fireEvent.click(
      within(rail).getByRole("button", { name: /collapse navigation rail/i }),
    );
    await waitFor(() => {
      expect(rail.className).toContain("w-[4.5rem]");
      expect(
        within(rail).getByRole("button", { name: /expand navigation rail/i }),
      ).toHaveAttribute("aria-pressed", "false");
      const collapsedNav = within(rail).getByRole("navigation", {
        name: "Main navigation",
      });
      expect(collapsedNav.querySelectorAll("a")).toHaveLength(8);
      expect(
        within(collapsedNav).getByRole("link", { name: "Analytics" }),
      ).toHaveAttribute("href", "/dashboard/analytics/occupancy");
    });
  });
});
