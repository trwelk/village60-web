# Salary Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Track monthly salary and payment remittance for care workers and non-login staff, with a directory view and month-grid remittance marking.

**Architecture:** Two new tables (`staff_salaries`, `salary_remittances`) with a service layer in `src/lib/salaries/`, home-scoped API routes, and two dashboard pages (staff salary directory + monthly remittance grid) using the `VillageList` shell.

**Tech Stack:** Drizzle ORM (SQLite), Next.js 16 App Router, React 19, TypeScript, iron-session, VillageList components.

---

## File Structure

| File | Responsibility |
|------|---------------|
| `src/db/schema.ts` | Add `staffSalaries` and `salaryRemittances` table definitions |
| `src/lib/salaries/service.ts` | Domain logic: CRUD, paged list, remittance marking |
| `src/lib/salaries/service.test.ts` | Unit tests for service layer |
| `src/lib/salaries/directoryPath.ts` | URL state parse/build for salary directory page |
| `src/lib/dashboard/dashboardRoutes.ts` | Add `dashboardSalariesHref`, `dashboardSalaryRemittanceHref` |
| `src/app/api/homes/[id]/staff-salaries/route.ts` | GET (list) + POST (create) |
| `src/app/api/homes/[id]/staff-salaries/[salaryId]/route.ts` | GET (detail) + PATCH (update) |
| `src/app/api/homes/[id]/salary-remittances/route.ts` | GET (list) + POST (mark paid) |
| `src/app/api/homes/[id]/salary-remittances/[remittanceId]/route.ts` | DELETE (undo) |
| `src/app/dashboard/salaries/page.tsx` | Server page: session, actor, render directory |
| `src/app/dashboard/salaries/SalariesDirectoryUI.tsx` | Client: VillageList directory of staff + salary |
| `src/app/dashboard/salaries/remittance/page.tsx` | Server page for monthly remittance view |
| `src/app/dashboard/salaries/remittance/RemittanceUI.tsx` | Client: month-grid with pay/unpay toggles |

---

## Vertical Slice 1: Schema & Migration

### Task 1: Add `staffSalaries` table to schema

**Files:**
- Modify: `src/db/schema.ts` (append after last table)

- [ ] **Step 1: Add the `staffSalaries` table definition**

```typescript
/** Staff salary records; one row per salary period. Close `effectiveTo` and create a new row on revision. */
export const staffSalaries = sqliteTable(
  "staff_salaries",
  {
    id: text("id").primaryKey(),
    homeId: text("home_id")
      .notNull()
      .references(() => homes.id, { onDelete: "cascade" }),
    /** Nullable link to a login user (care worker). Null for non-login staff. */
    userId: text("user_id").references(() => users.id, { onDelete: "set null" }),
    fullName: text("full_name").notNull(),
    roleTitle: text("role_title").notNull(),
    /** Monthly salary in home currency minor units (e.g. paisa). */
    monthlySalaryMinor: integer("monthly_salary_minor").notNull(),
    /** ISO `YYYY-MM-DD` — when this salary rate took effect. */
    effectiveFrom: text("effective_from").notNull(),
    /** ISO `YYYY-MM-DD` — null means currently active rate. */
    effectiveTo: text("effective_to"),
    /** `active` | `inactive` */
    status: text("status").notNull(),
    phone: text("phone"),
    notes: text("notes"),
    createdAtUtcMs: integer("created_at_utc_ms").notNull(),
    updatedAtUtcMs: integer("updated_at_utc_ms").notNull(),
  },
  (t) => [
    index("staff_salaries_home_status_idx").on(t.homeId, t.status),
    index("staff_salaries_user_idx").on(t.userId),
  ],
);
```

- [ ] **Step 2: Add the `salaryRemittances` table definition**

```typescript
/** Monthly salary payment records. One row = one month's pay for one staff member. */
export const salaryRemittances = sqliteTable(
  "salary_remittances",
  {
    id: text("id").primaryKey(),
    staffSalaryId: text("staff_salary_id")
      .notNull()
      .references(() => staffSalaries.id, { onDelete: "cascade" }),
    homeId: text("home_id")
      .notNull()
      .references(() => homes.id, { onDelete: "cascade" }),
    periodYear: integer("period_year").notNull(),
    periodMonth: integer("period_month").notNull(),
    /** Actual amount paid in minor units (may differ from salary if partial/bonus). */
    amountPaidMinor: integer("amount_paid_minor").notNull(),
    /** ISO `YYYY-MM-DD` — date payment was made. */
    paidOn: text("paid_on").notNull(),
    /** e.g. "cash", "bank_transfer", "upi" */
    paymentMethod: text("payment_method"),
    reference: text("reference"),
    markedByUserId: text("marked_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    notes: text("notes"),
    createdAtUtcMs: integer("created_at_utc_ms").notNull(),
  },
  (t) => [
    uniqueIndex("salary_remittances_staff_period_uq").on(
      t.staffSalaryId,
      t.periodYear,
      t.periodMonth,
    ),
    index("salary_remittances_home_period_idx").on(
      t.homeId,
      t.periodYear,
      t.periodMonth,
    ),
  ],
);
```

- [ ] **Step 3: Generate and run the migration**

Run: `npm run db:generate`
Expected: New SQL file created in `drizzle/` folder.

Run: `npm run db:migrate`
Expected: Migration applies cleanly, zero errors.

- [ ] **Step 4: Commit**

```bash
git add src/db/schema.ts drizzle/
git commit -m "feat(salaries): add staff_salaries and salary_remittances tables"
```

---

## Vertical Slice 2: Service Layer

### Task 2: Create salary service with types and validation

**Files:**
- Create: `src/lib/salaries/service.ts`
- Create: `src/lib/salaries/service.test.ts`

- [ ] **Step 1: Write the failing test for `createStaffSalary`**

```typescript
import { describe, it, expect, beforeEach } from "vitest";
import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import * as schema from "@/db/schema";
import {
  createStaffSalary,
  type CreateStaffSalaryInput,
} from "./service";
import { randomUUID } from "node:crypto";

function setupTestDb() {
  const sqlite = new Database(":memory:");
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: "drizzle" });
  return db;
}

function seedHome(db: ReturnType<typeof setupTestDb>) {
  const homeId = randomUUID();
  const now = Date.now();
  db.insert(schema.homes).values({
    id: homeId,
    name: "Test Home",
    defaultCurrencyCode: "INR",
    createdAtUtcMs: now,
    updatedAtUtcMs: now,
  }).run();
  return homeId;
}

describe("createStaffSalary", () => {
  let db: ReturnType<typeof setupTestDb>;
  let homeId: string;

  beforeEach(() => {
    db = setupTestDb();
    homeId = seedHome(db);
  });

  it("creates a salary record for non-user staff", () => {
    const input: CreateStaffSalaryInput = {
      homeId,
      fullName: "Ravi Kumar",
      roleTitle: "Cook",
      monthlySalaryMinor: 1500000,
      effectiveFrom: "2026-01-01",
      phone: "9876543210",
    };
    const actor = { userId: "admin-1", role: "admin" as const };
    const result = createStaffSalary(db, actor, input);
    expect(result.id).toBeDefined();
    expect(result.fullName).toBe("Ravi Kumar");
    expect(result.monthlySalaryMinor).toBe(1500000);
    expect(result.status).toBe("active");
  });

  it("throws ForbiddenError for care role", () => {
    const input: CreateStaffSalaryInput = {
      homeId,
      fullName: "Ravi Kumar",
      roleTitle: "Cook",
      monthlySalaryMinor: 1500000,
      effectiveFrom: "2026-01-01",
    };
    const actor = { userId: "care-1", role: "care" as const };
    expect(() => createStaffSalary(db, actor, input)).toThrow("Forbidden");
  });

  it("throws ValidationError for missing fullName", () => {
    const input: CreateStaffSalaryInput = {
      homeId,
      fullName: "",
      roleTitle: "Cook",
      monthlySalaryMinor: 1500000,
      effectiveFrom: "2026-01-01",
    };
    const actor = { userId: "admin-1", role: "admin" as const };
    expect(() => createStaffSalary(db, actor, input)).toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/salaries/service.test.ts`
Expected: FAIL — module `./service` not found.

- [ ] **Step 3: Implement the service with types, create, list, and update**

```typescript
import { randomUUID } from "node:crypto";
import { and, desc, eq, isNull, like, sql } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "@/db/schema";
import { staffSalaries, salaryRemittances } from "@/db/schema";
import { assertActorMayAccessHome } from "@/lib/authz/homeScope";
import type { SessionActor } from "@/lib/authz/sessionActor";
import { ForbiddenError, NotFoundError, ValidationError } from "@/lib/homes/errors";

export type AppDb = BetterSQLite3Database<typeof schema>;

export type StaffSalary = {
  id: string;
  homeId: string;
  userId: string | null;
  fullName: string;
  roleTitle: string;
  monthlySalaryMinor: number;
  effectiveFrom: string;
  effectiveTo: string | null;
  status: string;
  phone: string | null;
  notes: string | null;
  createdAtUtcMs: number;
  updatedAtUtcMs: number;
};

export type StaffSalaryWithLastPaid = StaffSalary & {
  lastPaidMonth: string | null;
};

export type CreateStaffSalaryInput = {
  homeId: string;
  userId?: string | null;
  fullName: string;
  roleTitle: string;
  monthlySalaryMinor: number;
  effectiveFrom: string;
  phone?: string | null;
  notes?: string | null;
};

export type UpdateStaffSalaryInput = {
  fullName?: string;
  roleTitle?: string;
  monthlySalaryMinor?: number;
  effectiveFrom?: string;
  phone?: string | null;
  notes?: string | null;
  status?: "active" | "inactive";
};

export type CreateRemittanceInput = {
  staffSalaryId: string;
  homeId: string;
  periodYear: number;
  periodMonth: number;
  amountPaidMinor: number;
  paidOn: string;
  paymentMethod?: string | null;
  reference?: string | null;
  notes?: string | null;
};

export type SalaryRemittance = {
  id: string;
  staffSalaryId: string;
  homeId: string;
  periodYear: number;
  periodMonth: number;
  amountPaidMinor: number;
  paidOn: string;
  paymentMethod: string | null;
  reference: string | null;
  markedByUserId: string;
  notes: string | null;
  createdAtUtcMs: number;
};

export const DEFAULT_SALARY_PAGE_SIZE = 20;
export const MAX_SALARY_PAGE_SIZE = 100;

function requireAdmin(actor: SessionActor): void {
  if (actor.role !== "admin") {
    throw new ForbiddenError();
  }
}

function validateSalaryInput(input: CreateStaffSalaryInput): void {
  if (!input.fullName.trim()) {
    throw new ValidationError("Full name is required.");
  }
  if (!input.roleTitle.trim()) {
    throw new ValidationError("Role title is required.");
  }
  if (!input.effectiveFrom || !/^\d{4}-\d{2}-\d{2}$/.test(input.effectiveFrom)) {
    throw new ValidationError("Effective-from must be a valid YYYY-MM-DD date.");
  }
  if (input.monthlySalaryMinor <= 0) {
    throw new ValidationError("Monthly salary must be positive.");
  }
}

export function createStaffSalary(
  db: AppDb,
  actor: SessionActor,
  input: CreateStaffSalaryInput,
): StaffSalary {
  requireAdmin(actor);
  assertActorMayAccessHome(db, actor, input.homeId);
  validateSalaryInput(input);

  const now = Date.now();
  const row = {
    id: randomUUID(),
    homeId: input.homeId,
    userId: input.userId ?? null,
    fullName: input.fullName.trim(),
    roleTitle: input.roleTitle.trim(),
    monthlySalaryMinor: input.monthlySalaryMinor,
    effectiveFrom: input.effectiveFrom,
    effectiveTo: null,
    status: "active",
    phone: input.phone ?? null,
    notes: input.notes ?? null,
    createdAtUtcMs: now,
    updatedAtUtcMs: now,
  };
  db.insert(staffSalaries).values(row).run();
  return row;
}

export function updateStaffSalary(
  db: AppDb,
  actor: SessionActor,
  homeId: string,
  salaryId: string,
  input: UpdateStaffSalaryInput,
): StaffSalary {
  requireAdmin(actor);
  assertActorMayAccessHome(db, actor, homeId);

  const existing = db
    .select()
    .from(staffSalaries)
    .where(and(eq(staffSalaries.id, salaryId), eq(staffSalaries.homeId, homeId)))
    .get();
  if (!existing) {
    throw new NotFoundError("Staff salary record not found.");
  }

  const updates: Record<string, unknown> = { updatedAtUtcMs: Date.now() };
  if (input.fullName !== undefined) {
    if (!input.fullName.trim()) throw new ValidationError("Full name is required.");
    updates.fullName = input.fullName.trim();
  }
  if (input.roleTitle !== undefined) {
    if (!input.roleTitle.trim()) throw new ValidationError("Role title is required.");
    updates.roleTitle = input.roleTitle.trim();
  }
  if (input.monthlySalaryMinor !== undefined) {
    if (input.monthlySalaryMinor <= 0) throw new ValidationError("Monthly salary must be positive.");
    updates.monthlySalaryMinor = input.monthlySalaryMinor;
  }
  if (input.effectiveFrom !== undefined) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.effectiveFrom)) {
      throw new ValidationError("Effective-from must be a valid YYYY-MM-DD date.");
    }
    updates.effectiveFrom = input.effectiveFrom;
  }
  if (input.phone !== undefined) updates.phone = input.phone;
  if (input.notes !== undefined) updates.notes = input.notes;
  if (input.status !== undefined) updates.status = input.status;

  db.update(staffSalaries).set(updates).where(eq(staffSalaries.id, salaryId)).run();

  return db.select().from(staffSalaries).where(eq(staffSalaries.id, salaryId)).get()!;
}

export function getStaffSalary(
  db: AppDb,
  actor: SessionActor,
  homeId: string,
  salaryId: string,
): StaffSalary {
  requireAdmin(actor);
  assertActorMayAccessHome(db, actor, homeId);

  const row = db
    .select()
    .from(staffSalaries)
    .where(and(eq(staffSalaries.id, salaryId), eq(staffSalaries.homeId, homeId)))
    .get();
  if (!row) {
    throw new NotFoundError("Staff salary record not found.");
  }
  return row;
}

export type ListStaffSalariesOptions = {
  homeId: string;
  query?: string;
  status?: "active" | "inactive";
  page?: number;
  pageSize?: number;
};

export function listStaffSalariesPaged(
  db: AppDb,
  actor: SessionActor,
  opts: ListStaffSalariesOptions,
): { items: StaffSalaryWithLastPaid[]; totalCount: number } {
  requireAdmin(actor);
  assertActorMayAccessHome(db, actor, opts.homeId);

  const page = Math.max(1, opts.page ?? 1);
  const pageSize = Math.min(MAX_SALARY_PAGE_SIZE, Math.max(1, opts.pageSize ?? DEFAULT_SALARY_PAGE_SIZE));
  const offset = (page - 1) * pageSize;

  const conditions = [eq(staffSalaries.homeId, opts.homeId)];
  if (opts.status) {
    conditions.push(eq(staffSalaries.status, opts.status));
  }
  if (opts.query?.trim()) {
    conditions.push(like(staffSalaries.fullName, `%${opts.query.trim()}%`));
  }

  const where = and(...conditions);

  const countRow = db
    .select({ count: sql<number>`count(*)` })
    .from(staffSalaries)
    .where(where)
    .get();
  const totalCount = countRow?.count ?? 0;

  const rows = db
    .select()
    .from(staffSalaries)
    .where(where)
    .orderBy(desc(staffSalaries.createdAtUtcMs))
    .limit(pageSize)
    .offset(offset)
    .all();

  const items: StaffSalaryWithLastPaid[] = rows.map((r) => {
    const lastRemittance = db
      .select()
      .from(salaryRemittances)
      .where(eq(salaryRemittances.staffSalaryId, r.id))
      .orderBy(desc(salaryRemittances.periodYear), desc(salaryRemittances.periodMonth))
      .limit(1)
      .get();
    const lastPaidMonth = lastRemittance
      ? `${lastRemittance.periodYear}-${String(lastRemittance.periodMonth).padStart(2, "0")}`
      : null;
    return { ...r, lastPaidMonth };
  });

  return { items, totalCount };
}

export function createRemittance(
  db: AppDb,
  actor: SessionActor,
  input: CreateRemittanceInput,
): SalaryRemittance {
  requireAdmin(actor);
  assertActorMayAccessHome(db, actor, input.homeId);

  if (input.periodMonth < 1 || input.periodMonth > 12) {
    throw new ValidationError("Period month must be 1–12.");
  }
  if (input.periodYear < 2000 || input.periodYear > 2100) {
    throw new ValidationError("Period year is out of range.");
  }
  if (input.amountPaidMinor <= 0) {
    throw new ValidationError("Amount paid must be positive.");
  }
  if (!input.paidOn || !/^\d{4}-\d{2}-\d{2}$/.test(input.paidOn)) {
    throw new ValidationError("Paid-on must be a valid YYYY-MM-DD date.");
  }

  const salary = db
    .select()
    .from(staffSalaries)
    .where(
      and(
        eq(staffSalaries.id, input.staffSalaryId),
        eq(staffSalaries.homeId, input.homeId),
      ),
    )
    .get();
  if (!salary) {
    throw new NotFoundError("Staff salary record not found.");
  }

  const existing = db
    .select()
    .from(salaryRemittances)
    .where(
      and(
        eq(salaryRemittances.staffSalaryId, input.staffSalaryId),
        eq(salaryRemittances.periodYear, input.periodYear),
        eq(salaryRemittances.periodMonth, input.periodMonth),
      ),
    )
    .get();
  if (existing) {
    throw new ValidationError(
      `Salary already marked as paid for ${input.periodYear}-${String(input.periodMonth).padStart(2, "0")}.`,
    );
  }

  const row: SalaryRemittance = {
    id: randomUUID(),
    staffSalaryId: input.staffSalaryId,
    homeId: input.homeId,
    periodYear: input.periodYear,
    periodMonth: input.periodMonth,
    amountPaidMinor: input.amountPaidMinor,
    paidOn: input.paidOn,
    paymentMethod: input.paymentMethod ?? null,
    reference: input.reference ?? null,
    markedByUserId: actor.userId,
    notes: input.notes ?? null,
    createdAtUtcMs: Date.now(),
  };
  db.insert(salaryRemittances).values(row).run();
  return row;
}

export function deleteRemittance(
  db: AppDb,
  actor: SessionActor,
  homeId: string,
  remittanceId: string,
): void {
  requireAdmin(actor);
  assertActorMayAccessHome(db, actor, homeId);

  const row = db
    .select()
    .from(salaryRemittances)
    .where(
      and(
        eq(salaryRemittances.id, remittanceId),
        eq(salaryRemittances.homeId, homeId),
      ),
    )
    .get();
  if (!row) {
    throw new NotFoundError("Remittance record not found.");
  }
  db.delete(salaryRemittances).where(eq(salaryRemittances.id, remittanceId)).run();
}

export type ListRemittancesOptions = {
  homeId: string;
  periodYear: number;
  periodMonth: number;
};

export type RemittanceWithStaffName = SalaryRemittance & {
  staffFullName: string;
  staffRoleTitle: string;
  staffMonthlySalaryMinor: number;
};

export function listRemittancesForMonth(
  db: AppDb,
  actor: SessionActor,
  opts: ListRemittancesOptions,
): { staff: Array<StaffSalary & { remittance: SalaryRemittance | null }> } {
  requireAdmin(actor);
  assertActorMayAccessHome(db, actor, opts.homeId);

  const activeStaff = db
    .select()
    .from(staffSalaries)
    .where(and(eq(staffSalaries.homeId, opts.homeId), eq(staffSalaries.status, "active")))
    .orderBy(staffSalaries.fullName)
    .all();

  const result = activeStaff.map((s) => {
    const remittance = db
      .select()
      .from(salaryRemittances)
      .where(
        and(
          eq(salaryRemittances.staffSalaryId, s.id),
          eq(salaryRemittances.periodYear, opts.periodYear),
          eq(salaryRemittances.periodMonth, opts.periodMonth),
        ),
      )
      .get() ?? null;
    return { ...s, remittance };
  });

  return { staff: result };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/salaries/service.test.ts`
Expected: All 3 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/salaries/
git commit -m "feat(salaries): add service layer with CRUD and remittance logic"
```

---

## Vertical Slice 3: API Routes

### Task 3: Create staff salary API routes

**Files:**
- Create: `src/app/api/homes/[id]/staff-salaries/route.ts`
- Create: `src/app/api/homes/[id]/staff-salaries/[salaryId]/route.ts`

- [ ] **Step 1: Implement GET (list) + POST (create) route**

```typescript
// src/app/api/homes/[id]/staff-salaries/route.ts
import { getDb } from "@/db/client";
import { requireSessionActor } from "@/lib/authz/sessionActor";
import { homesErrorResponse } from "@/lib/homes/http";
import { getSessionOptions, type SessionData } from "@/lib/session";
import {
  createStaffSalary,
  listStaffSalariesPaged,
  type CreateStaffSalaryInput,
} from "@/lib/salaries/service";
import { getIronSession } from "iron-session";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(req: Request, { params }: RouteParams) {
  const { id: homeId } = await params;
  const session = await getIronSession<SessionData>(
    await cookies(),
    getSessionOptions(),
  );
  try {
    const actor = requireSessionActor(session);
    const url = new URL(req.url);
    const query = url.searchParams.get("query") ?? undefined;
    const status = url.searchParams.get("status") as "active" | "inactive" | undefined;
    const page = Number(url.searchParams.get("page") ?? "1");
    const pageSize = Number(url.searchParams.get("pageSize") ?? "20");

    const result = listStaffSalariesPaged(getDb(), actor, {
      homeId,
      query,
      status: status === "active" || status === "inactive" ? status : undefined,
      page,
      pageSize,
    });
    return NextResponse.json(result);
  } catch (e) {
    const resp = homesErrorResponse(e);
    if (resp) return resp;
    throw e;
  }
}

export async function POST(req: Request, { params }: RouteParams) {
  const { id: homeId } = await params;
  const session = await getIronSession<SessionData>(
    await cookies(),
    getSessionOptions(),
  );
  try {
    const actor = requireSessionActor(session);
    const body = (await req.json()) as Omit<CreateStaffSalaryInput, "homeId">;
    const result = createStaffSalary(getDb(), actor, { ...body, homeId });
    return NextResponse.json(result, { status: 201 });
  } catch (e) {
    const resp = homesErrorResponse(e);
    if (resp) return resp;
    throw e;
  }
}
```

- [ ] **Step 2: Implement GET (detail) + PATCH (update) route**

```typescript
// src/app/api/homes/[id]/staff-salaries/[salaryId]/route.ts
import { getDb } from "@/db/client";
import { requireSessionActor } from "@/lib/authz/sessionActor";
import { homesErrorResponse } from "@/lib/homes/http";
import { getSessionOptions, type SessionData } from "@/lib/session";
import {
  getStaffSalary,
  updateStaffSalary,
  type UpdateStaffSalaryInput,
} from "@/lib/salaries/service";
import { getIronSession } from "iron-session";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

type RouteParams = { params: Promise<{ id: string; salaryId: string }> };

export async function GET(_req: Request, { params }: RouteParams) {
  const { id: homeId, salaryId } = await params;
  const session = await getIronSession<SessionData>(
    await cookies(),
    getSessionOptions(),
  );
  try {
    const actor = requireSessionActor(session);
    const result = getStaffSalary(getDb(), actor, homeId, salaryId);
    return NextResponse.json(result);
  } catch (e) {
    const resp = homesErrorResponse(e);
    if (resp) return resp;
    throw e;
  }
}

export async function PATCH(req: Request, { params }: RouteParams) {
  const { id: homeId, salaryId } = await params;
  const session = await getIronSession<SessionData>(
    await cookies(),
    getSessionOptions(),
  );
  try {
    const actor = requireSessionActor(session);
    const body = (await req.json()) as UpdateStaffSalaryInput;
    const result = updateStaffSalary(getDb(), actor, homeId, salaryId, body);
    return NextResponse.json(result);
  } catch (e) {
    const resp = homesErrorResponse(e);
    if (resp) return resp;
    throw e;
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add src/app/api/homes/\[id\]/staff-salaries/
git commit -m "feat(salaries): add staff-salaries API routes (GET list, POST, GET detail, PATCH)"
```

---

### Task 4: Create salary remittance API routes

**Files:**
- Create: `src/app/api/homes/[id]/salary-remittances/route.ts`
- Create: `src/app/api/homes/[id]/salary-remittances/[remittanceId]/route.ts`

- [ ] **Step 1: Implement GET (month list) + POST (mark paid) route**

```typescript
// src/app/api/homes/[id]/salary-remittances/route.ts
import { getDb } from "@/db/client";
import { requireSessionActor } from "@/lib/authz/sessionActor";
import { homesErrorResponse } from "@/lib/homes/http";
import { getSessionOptions, type SessionData } from "@/lib/session";
import {
  createRemittance,
  listRemittancesForMonth,
  type CreateRemittanceInput,
} from "@/lib/salaries/service";
import { getIronSession } from "iron-session";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(req: Request, { params }: RouteParams) {
  const { id: homeId } = await params;
  const session = await getIronSession<SessionData>(
    await cookies(),
    getSessionOptions(),
  );
  try {
    const actor = requireSessionActor(session);
    const url = new URL(req.url);
    const year = Number(url.searchParams.get("year") ?? new Date().getFullYear());
    const month = Number(url.searchParams.get("month") ?? new Date().getMonth() + 1);

    const result = listRemittancesForMonth(getDb(), actor, {
      homeId,
      periodYear: year,
      periodMonth: month,
    });
    return NextResponse.json(result);
  } catch (e) {
    const resp = homesErrorResponse(e);
    if (resp) return resp;
    throw e;
  }
}

export async function POST(req: Request, { params }: RouteParams) {
  const { id: homeId } = await params;
  const session = await getIronSession<SessionData>(
    await cookies(),
    getSessionOptions(),
  );
  try {
    const actor = requireSessionActor(session);
    const body = (await req.json()) as Omit<CreateRemittanceInput, "homeId">;
    const result = createRemittance(getDb(), actor, { ...body, homeId });
    return NextResponse.json(result, { status: 201 });
  } catch (e) {
    const resp = homesErrorResponse(e);
    if (resp) return resp;
    throw e;
  }
}
```

- [ ] **Step 2: Implement DELETE (undo remittance) route**

```typescript
// src/app/api/homes/[id]/salary-remittances/[remittanceId]/route.ts
import { getDb } from "@/db/client";
import { requireSessionActor } from "@/lib/authz/sessionActor";
import { homesErrorResponse } from "@/lib/homes/http";
import { getSessionOptions, type SessionData } from "@/lib/session";
import { deleteRemittance } from "@/lib/salaries/service";
import { getIronSession } from "iron-session";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

type RouteParams = { params: Promise<{ id: string; remittanceId: string }> };

export async function DELETE(_req: Request, { params }: RouteParams) {
  const { id: homeId, remittanceId } = await params;
  const session = await getIronSession<SessionData>(
    await cookies(),
    getSessionOptions(),
  );
  try {
    const actor = requireSessionActor(session);
    deleteRemittance(getDb(), actor, homeId, remittanceId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const resp = homesErrorResponse(e);
    if (resp) return resp;
    throw e;
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add src/app/api/homes/\[id\]/salary-remittances/
git commit -m "feat(salaries): add salary-remittances API routes (GET month, POST mark, DELETE undo)"
```

---

## Vertical Slice 4: Staff Salary Directory Page

### Task 5: Add URL state helpers and dashboard route

**Files:**
- Create: `src/lib/salaries/directoryPath.ts`
- Modify: `src/lib/dashboard/dashboardRoutes.ts`

- [ ] **Step 1: Create URL state helper for salary directory**

```typescript
// src/lib/salaries/directoryPath.ts
import { DEFAULT_SALARY_PAGE_SIZE, MAX_SALARY_PAGE_SIZE } from "./service";

export type SalariesDirectoryUrlState = {
  homeId: string;
  query: string;
  status: "active" | "inactive" | "";
  page: number;
  pageSize: number;
};

function parsePage(raw: string | null): number {
  if (!raw) return 1;
  const n = Number.parseInt(raw, 10);
  return Number.isNaN(n) || n < 1 ? 1 : n;
}

function parsePageSize(raw: string | null): number {
  if (!raw) return DEFAULT_SALARY_PAGE_SIZE;
  const n = Number.parseInt(raw, 10);
  if (Number.isNaN(n) || n < 1) return DEFAULT_SALARY_PAGE_SIZE;
  return Math.min(MAX_SALARY_PAGE_SIZE, n);
}

export function salariesDirectoryStateFromSearchParams(
  sp: URLSearchParams,
): SalariesDirectoryUrlState {
  const rawStatus = sp.get("status");
  let status: "active" | "inactive" | "" = "";
  if (rawStatus === "active" || rawStatus === "inactive") {
    status = rawStatus;
  }

  return {
    homeId: sp.get("homeId") ?? "",
    query: sp.get("query") ?? "",
    status,
    page: parsePage(sp.get("page")),
    pageSize: parsePageSize(sp.get("pageSize")),
  };
}

export function buildSalariesDirectoryQueryString(
  s: SalariesDirectoryUrlState,
): string {
  const p = new URLSearchParams();
  if (s.homeId) p.set("homeId", s.homeId);
  if (s.query.trim()) p.set("query", s.query.trim());
  if (s.status) p.set("status", s.status);
  if (s.page > 1) p.set("page", String(s.page));
  if (s.pageSize !== DEFAULT_SALARY_PAGE_SIZE) p.set("pageSize", String(s.pageSize));
  return p.toString();
}
```

- [ ] **Step 2: Add route helpers to `dashboardRoutes.ts`**

Append to `src/lib/dashboard/dashboardRoutes.ts`:

```typescript
export function dashboardSalariesHref(homeId?: string): string {
  if (!homeId) return "/dashboard/salaries";
  return `/dashboard/salaries?homeId=${encodeURIComponent(homeId)}`;
}

export function dashboardSalaryRemittanceHref(homeId: string, year?: number, month?: number): string {
  const params = new URLSearchParams({ homeId });
  if (year) params.set("year", String(year));
  if (month) params.set("month", String(month));
  return `/dashboard/salaries/remittance?${params.toString()}`;
}
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/salaries/directoryPath.ts src/lib/dashboard/dashboardRoutes.ts
git commit -m "feat(salaries): add URL state helpers and dashboard route builders"
```

---

### Task 6: Create the salary directory server page

**Files:**
- Create: `src/app/dashboard/salaries/page.tsx`

- [ ] **Step 1: Implement the server page**

```typescript
// src/app/dashboard/salaries/page.tsx
import { getDb } from "@/db/client";
import { requireSessionActor } from "@/lib/authz/sessionActor";
import { listHomes } from "@/lib/homes/service";
import { getSessionOptions, type SessionData } from "@/lib/session";
import { getIronSession } from "iron-session";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { VillageListSkeleton } from "@/components/VillageListSkeleton";
import { SalariesDirectoryUI } from "./SalariesDirectoryUI";
import { Suspense } from "react";

export default async function SalariesPage() {
  const session = await getIronSession<SessionData>(
    await cookies(),
    getSessionOptions(),
  );
  if (!session.userId) {
    redirect("/login");
  }
  const actor = requireSessionActor(session);
  if (actor.role !== "admin") {
    redirect("/dashboard");
  }
  const homes = listHomes(getDb(), actor);

  return (
    <Suspense fallback={<VillageListSkeleton rows={6} cols={5} />}>
      <SalariesDirectoryUI
        homes={homes.map((h) => ({ id: h.id, name: h.name }))}
      />
    </Suspense>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/dashboard/salaries/page.tsx
git commit -m "feat(salaries): add salary directory server page"
```

---

### Task 7: Create the salary directory client UI

**Files:**
- Create: `src/app/dashboard/salaries/SalariesDirectoryUI.tsx`

- [ ] **Step 1: Implement the client component**

```typescript
// src/app/dashboard/salaries/SalariesDirectoryUI.tsx
"use client";

import {
  VillageList,
  VillageListEmpty,
  VillageListFilter,
} from "@/components/VillageList";
import { VillageSelect } from "@/components/VillageSelect";
import {
  buildSalariesDirectoryQueryString,
  salariesDirectoryStateFromSearchParams,
} from "@/lib/salaries/directoryPath";
import {
  dashboardSalaryRemittanceHref,
} from "@/lib/dashboard/dashboardRoutes";
import type { StaffSalaryWithLastPaid } from "@/lib/salaries/service";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

type HomeOption = { id: string; name: string };

type Props = {
  homes: HomeOption[];
};

async function parseError(res: Response): Promise<string> {
  try {
    const data: unknown = await res.json();
    if (
      typeof data === "object" &&
      data !== null &&
      "error" in data &&
      typeof (data as { error: unknown }).error === "string"
    ) {
      return (data as { error: string }).error;
    }
  } catch { /* ignore */ }
  return "Request failed.";
}

export function SalariesDirectoryUI({ homes }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const urlState = salariesDirectoryStateFromSearchParams(searchParams);

  const [salaries, setSalaries] = useState<StaffSalaryWithLastPaid[] | null>(null);
  const [totalCount, setTotalCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);

  const navigate = useCallback(
    (next: Partial<typeof urlState>) => {
      const merged = { ...urlState, ...next };
      const qs = buildSalariesDirectoryQueryString(merged);
      router.replace(qs ? `${pathname}?${qs}` : pathname);
    },
    [pathname, router, urlState],
  );

  const fetchSalaries = useCallback(async () => {
    if (!urlState.homeId) {
      setSalaries(null);
      setTotalCount(0);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    const params = new URLSearchParams();
    if (urlState.query.trim()) params.set("query", urlState.query.trim());
    if (urlState.status) params.set("status", urlState.status);
    params.set("page", String(urlState.page));
    params.set("pageSize", String(urlState.pageSize));

    const res = await fetch(
      `/api/homes/${urlState.homeId}/staff-salaries?${params.toString()}`,
    );
    if (!res.ok) {
      setError(await parseError(res));
      setSalaries(null);
      setTotalCount(0);
      setLoading(false);
      return;
    }
    const data = (await res.json()) as {
      items: StaffSalaryWithLastPaid[];
      totalCount: number;
    };
    setSalaries(data.items);
    setTotalCount(data.totalCount);
    setLoading(false);
  }, [urlState.homeId, urlState.query, urlState.status, urlState.page, urlState.pageSize]);

  useEffect(() => {
    void fetchSalaries();
  }, [fetchSalaries]);

  function formatCurrency(minor: number): string {
    return (minor / 100).toLocaleString("en-IN", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    });
  }

  const activeFilterCount =
    (urlState.query.trim() ? 1 : 0) + (urlState.status ? 1 : 0);

  return (
    <>
      <VillageList
        toolbar={
          <div className="flex w-full min-w-0 flex-1 flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 flex-1 flex-wrap items-center justify-end gap-3">
              {urlState.homeId && (
                <Link
                  href={dashboardSalaryRemittanceHref(urlState.homeId)}
                  className="village-btn-secondary"
                >
                  Monthly Remittance
                </Link>
              )}
              {urlState.homeId && (
                <button
                  type="button"
                  className="village-btn-primary"
                  onClick={() => setShowCreate(true)}
                >
                  Add Staff
                </button>
              )}
            </div>
            <button
              type="button"
              className="village-btn-secondary shrink-0"
              onClick={() => { void fetchSalaries(); router.refresh(); }}
            >
              Refresh
            </button>
          </div>
        }
        filters={
          <>
            <VillageListFilter label="Home" htmlFor="salaries-home" minWidth="12rem">
              <VillageSelect
                id="salaries-home"
                value={urlState.homeId}
                onChange={(v) => navigate({ homeId: v, page: 1 })}
                options={[
                  { value: "", label: "Select home" },
                  ...homes.map((h) => ({ value: h.id, label: h.name })),
                ]}
              />
            </VillageListFilter>
            <VillageListFilter label="Name search" htmlFor="salaries-query">
              <input
                id="salaries-query"
                className="village-input"
                value={urlState.query}
                onChange={(e) => navigate({ query: e.target.value, page: 1 })}
                placeholder="Partial name"
                autoComplete="off"
              />
            </VillageListFilter>
            <VillageListFilter label="Status" htmlFor="salaries-status" width="10rem">
              <VillageSelect
                id="salaries-status"
                value={urlState.status}
                onChange={(v) =>
                  navigate({ status: v as "active" | "inactive" | "", page: 1 })
                }
                options={[
                  { value: "", label: "All" },
                  { value: "active", label: "Active" },
                  { value: "inactive", label: "Inactive" },
                ]}
              />
            </VillageListFilter>
          </>
        }
        filtersCollapsible
        activeFilterCount={activeFilterCount}
        listTitle={null}
        loading={loading}
        error={error}
        pagination={
          urlState.homeId
            ? {
                page: urlState.page,
                pageSize: urlState.pageSize,
                totalCount,
                onPrevious: () => navigate({ page: urlState.page - 1 }),
                onNext: () => navigate({ page: urlState.page + 1 }),
              }
            : undefined
        }
      >
        {!urlState.homeId ? (
          <p className="village-empty-hint py-10 text-center">
            Select a home to view staff salaries.
          </p>
        ) : (
          <table className="village-table" aria-label="Staff salaries directory">
            <thead className="village-thead">
              <tr>
                <th className="village-th">Name</th>
                <th className="village-th">Role</th>
                <th className="village-th">Monthly Salary</th>
                <th className="village-th">Status</th>
                <th className="village-th">Last Paid</th>
              </tr>
            </thead>
            <tbody className="village-tbody">
              {!loading && salaries && salaries.length === 0 ? (
                <VillageListEmpty
                  colSpan={5}
                  message="No staff salary records found."
                />
              ) : null}
              {salaries?.map((s) => (
                <tr key={s.id}>
                  <td className="village-td font-medium">{s.fullName}</td>
                  <td className="village-td-muted">{s.roleTitle}</td>
                  <td className="village-td-muted">{formatCurrency(s.monthlySalaryMinor)}</td>
                  <td className="village-td-muted">
                    {s.status === "active" ? (
                      <span className="inline-flex items-center rounded-full bg-success-muted px-2 py-0.5 text-xs font-semibold text-success">
                        Active
                      </span>
                    ) : (
                      <span className="inline-flex items-center rounded-full bg-[color-mix(in_srgb,var(--text-muted)_14%,transparent)] px-2 py-0.5 text-xs font-semibold text-[var(--text-secondary)]">
                        Inactive
                      </span>
                    )}
                  </td>
                  <td className="village-td-muted">{s.lastPaidMonth ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </VillageList>

      {/* Create modal placeholder — Task 8 will implement the full form */}
    </>
  );
}
```

- [ ] **Step 2: Verify the page renders without errors**

Run: `npm run build` (or `npx next build`)
Expected: Build succeeds with no TypeScript or Next.js errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/dashboard/salaries/SalariesDirectoryUI.tsx
git commit -m "feat(salaries): add salary directory client UI with VillageList"
```

---

## Vertical Slice 5: Monthly Remittance Page

### Task 8: Create the remittance server page

**Files:**
- Create: `src/app/dashboard/salaries/remittance/page.tsx`

- [ ] **Step 1: Implement the server page**

```typescript
// src/app/dashboard/salaries/remittance/page.tsx
import { getDb } from "@/db/client";
import { requireSessionActor } from "@/lib/authz/sessionActor";
import { listHomes } from "@/lib/homes/service";
import { getSessionOptions, type SessionData } from "@/lib/session";
import { getIronSession } from "iron-session";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { RemittanceUI } from "./RemittanceUI";
import { Suspense } from "react";
import { VillageListSkeleton } from "@/components/VillageListSkeleton";

export default async function RemittancePage() {
  const session = await getIronSession<SessionData>(
    await cookies(),
    getSessionOptions(),
  );
  if (!session.userId) {
    redirect("/login");
  }
  const actor = requireSessionActor(session);
  if (actor.role !== "admin") {
    redirect("/dashboard");
  }
  const homes = listHomes(getDb(), actor);

  return (
    <Suspense fallback={<VillageListSkeleton rows={8} cols={4} />}>
      <RemittanceUI homes={homes.map((h) => ({ id: h.id, name: h.name }))} />
    </Suspense>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/dashboard/salaries/remittance/page.tsx
git commit -m "feat(salaries): add remittance server page"
```

---

### Task 9: Create the remittance client UI

**Files:**
- Create: `src/app/dashboard/salaries/remittance/RemittanceUI.tsx`

- [ ] **Step 1: Implement the remittance month-grid UI**

```typescript
// src/app/dashboard/salaries/remittance/RemittanceUI.tsx
"use client";

import { VillageList, VillageListEmpty, VillageListFilter } from "@/components/VillageList";
import { VillageSelect } from "@/components/VillageSelect";
import { dashboardSalariesHref } from "@/lib/dashboard/dashboardRoutes";
import type { StaffSalary, SalaryRemittance } from "@/lib/salaries/service";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

type HomeOption = { id: string; name: string };
type StaffWithRemittance = StaffSalary & { remittance: SalaryRemittance | null };

type Props = { homes: HomeOption[] };

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export function RemittanceUI({ homes }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const now = new Date();
  const [homeId, setHomeId] = useState(searchParams.get("homeId") ?? "");
  const [year, setYear] = useState(
    Number(searchParams.get("year") ?? now.getFullYear()),
  );
  const [month, setMonth] = useState(
    Number(searchParams.get("month") ?? now.getMonth() + 1),
  );

  const [staff, setStaff] = useState<StaffWithRemittance[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!homeId) {
      setStaff([]);
      return;
    }
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({
      year: String(year),
      month: String(month),
    });
    const res = await fetch(
      `/api/homes/${homeId}/salary-remittances?${params.toString()}`,
    );
    if (!res.ok) {
      setError("Failed to load remittance data.");
      setStaff([]);
      setLoading(false);
      return;
    }
    const data = (await res.json()) as { staff: StaffWithRemittance[] };
    setStaff(data.staff);
    setLoading(false);
  }, [homeId, year, month]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  async function markPaid(staffSalaryId: string, monthlySalaryMinor: number) {
    if (!homeId) return;
    setSubmitting(staffSalaryId);
    const today = new Date().toISOString().slice(0, 10);
    const res = await fetch(`/api/homes/${homeId}/salary-remittances`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        staffSalaryId,
        periodYear: year,
        periodMonth: month,
        amountPaidMinor: monthlySalaryMinor,
        paidOn: today,
      }),
    });
    setSubmitting(null);
    if (res.ok) {
      void fetchData();
    } else {
      setError("Failed to mark as paid.");
    }
  }

  async function undoPaid(remittanceId: string) {
    if (!homeId) return;
    setSubmitting(remittanceId);
    const res = await fetch(
      `/api/homes/${homeId}/salary-remittances/${remittanceId}`,
      { method: "DELETE" },
    );
    setSubmitting(null);
    if (res.ok) {
      void fetchData();
    } else {
      setError("Failed to undo payment.");
    }
  }

  function formatCurrency(minor: number): string {
    return (minor / 100).toLocaleString("en-IN", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    });
  }

  const yearOptions = Array.from({ length: 5 }, (_, i) => {
    const y = now.getFullYear() - 2 + i;
    return { value: String(y), label: String(y) };
  });

  const monthOptions = MONTHS.map((label, i) => ({
    value: String(i + 1),
    label,
  }));

  return (
    <VillageList
      toolbar={
        <div className="flex w-full min-w-0 flex-1 flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 flex-1 flex-wrap items-center justify-end gap-3">
            {homeId && (
              <Link
                href={dashboardSalariesHref(homeId)}
                className="village-btn-secondary"
              >
                Staff Directory
              </Link>
            )}
          </div>
          <button
            type="button"
            className="village-btn-secondary shrink-0"
            onClick={() => { void fetchData(); }}
          >
            Refresh
          </button>
        </div>
      }
      filters={
        <>
          <VillageListFilter label="Home" htmlFor="remittance-home" minWidth="12rem">
            <VillageSelect
              id="remittance-home"
              value={homeId}
              onChange={(v) => setHomeId(v)}
              options={[
                { value: "", label: "Select home" },
                ...homes.map((h) => ({ value: h.id, label: h.name })),
              ]}
            />
          </VillageListFilter>
          <VillageListFilter label="Year" htmlFor="remittance-year" width="7rem">
            <VillageSelect
              id="remittance-year"
              value={String(year)}
              onChange={(v) => setYear(Number(v))}
              options={yearOptions}
            />
          </VillageListFilter>
          <VillageListFilter label="Month" htmlFor="remittance-month" width="9rem">
            <VillageSelect
              id="remittance-month"
              value={String(month)}
              onChange={(v) => setMonth(Number(v))}
              options={monthOptions}
            />
          </VillageListFilter>
        </>
      }
      listTitle={null}
      loading={loading}
      error={error}
    >
      {!homeId ? (
        <p className="village-empty-hint py-10 text-center">
          Select a home and month to view salary remittance.
        </p>
      ) : (
        <table className="village-table" aria-label="Monthly salary remittance">
          <thead className="village-thead">
            <tr>
              <th className="village-th">Name</th>
              <th className="village-th">Role</th>
              <th className="village-th">Salary</th>
              <th className="village-th">Status</th>
              <th className="village-th">Action</th>
            </tr>
          </thead>
          <tbody className="village-tbody">
            {!loading && staff.length === 0 ? (
              <VillageListEmpty
                colSpan={5}
                message="No active staff for this home."
              />
            ) : null}
            {staff.map((s) => (
              <tr key={s.id}>
                <td className="village-td font-medium">{s.fullName}</td>
                <td className="village-td-muted">{s.roleTitle}</td>
                <td className="village-td-muted">{formatCurrency(s.monthlySalaryMinor)}</td>
                <td className="village-td">
                  {s.remittance ? (
                    <span className="inline-flex items-center rounded-full bg-success-muted px-2 py-0.5 text-xs font-semibold text-success">
                      Paid — {s.remittance.paidOn}
                    </span>
                  ) : (
                    <span className="inline-flex items-center rounded-full bg-[color-mix(in_srgb,var(--warning)_15%,transparent)] px-2 py-0.5 text-xs font-semibold text-[var(--warning)]">
                      Unpaid
                    </span>
                  )}
                </td>
                <td className="village-td">
                  {s.remittance ? (
                    <button
                      type="button"
                      className="village-btn-secondary text-xs"
                      disabled={submitting === s.remittance.id}
                      onClick={() => undoPaid(s.remittance!.id)}
                    >
                      Undo
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="village-btn-primary text-xs"
                      disabled={submitting === s.id}
                      onClick={() => markPaid(s.id, s.monthlySalaryMinor)}
                    >
                      Mark Paid
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </VillageList>
  );
}
```

- [ ] **Step 2: Verify build passes**

Run: `npm run build`
Expected: Zero errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/dashboard/salaries/remittance/
git commit -m "feat(salaries): add monthly remittance UI with mark/undo flow"
```

---

## Vertical Slice 6: Navigation & Polish

### Task 10: Wire salary pages into dashboard navigation

**Files:**
- Modify: Look for `DashboardAppShell.tsx` or the nav config file (likely `src/app/dashboard/layout.tsx` or a nav component)

- [ ] **Step 1: Find the nav items and add "Salaries" link**

Add a nav item for admin-only users pointing to `/dashboard/salaries` with label "Salaries" (or i18n key `nav.salaries`). Place it after "Staff" or at the end of the admin section.

Pattern (from existing nav):
```typescript
{ href: "/dashboard/salaries", label: t("nav.salaries"), adminOnly: true },
```

- [ ] **Step 2: Add i18n message keys**

Add to the English messages file (`src/lib/i18n/messages/en.ts` or equivalent):

```typescript
"nav.salaries": "Salaries",
```

- [ ] **Step 3: Verify navigation appears and links work**

Run: `npm run dev`
Navigate to `/dashboard/salaries` while logged in as admin. Confirm:
- Nav link visible
- Page loads without errors
- Selecting a home shows staff list
- "Monthly Remittance" link navigates correctly

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat(salaries): wire salary pages into dashboard navigation"
```

---

### Task 11: Add "Create Staff" modal to directory page

**Files:**
- Modify: `src/app/dashboard/salaries/SalariesDirectoryUI.tsx`

- [ ] **Step 1: Implement a create-staff modal form**

Add state for the modal and a form with fields: full name, role title, monthly salary, effective from, phone (optional), notes (optional). On submit, POST to `/api/homes/{homeId}/staff-salaries` and refresh the list.

Follow the existing modal pattern from `UsersAdminUI.tsx`:
- `createPortal` for the overlay
- Escape key to close
- `overflow: hidden` on body while open
- Form fields using `village-input` / `village-field-label` classes
- Error display from API response

- [ ] **Step 2: Verify creating a staff member works end-to-end**

Run: dev server, navigate to salaries page, click "Add Staff", fill form, submit.
Expected: New row appears in the table.

- [ ] **Step 3: Commit**

```bash
git add src/app/dashboard/salaries/SalariesDirectoryUI.tsx
git commit -m "feat(salaries): add create-staff modal to directory page"
```

---

## Summary of Vertical Slices

| Slice | Tasks | What's shippable after this slice |
|-------|-------|-----------------------------------|
| 1 — Schema & Migration | Task 1 | Database tables exist, can be queried |
| 2 — Service Layer | Task 2 | All business logic tested in isolation |
| 3 — API Routes | Tasks 3–4 | Full HTTP API usable from curl/Postman |
| 4 — Staff Directory Page | Tasks 5–7 | Viewable directory of staff salaries |
| 5 — Remittance Page | Tasks 8–9 | Mark/undo monthly salary payments |
| 6 — Nav & Polish | Tasks 10–11 | Discoverable from sidebar, creation form |

Each slice produces independently testable, deployable functionality. Slices 1–3 are backend-only (API complete). Slices 4–5 add UI. Slice 6 polishes the integration.
