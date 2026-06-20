# Salary Ledger: Charge + Payment Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current single-step salary **expense** ledger entry with a two-step **charge → payment** model on the home billing account, so unpaid salary obligations appear in the ledger before cash is remitted.

**Depends on:** [2025-06-20-salary-management.md](./2025-06-20-salary-management.md) (staff directory + remittance UI) and migration `0064_salary_remittance_ledger` (single expense per remittance — this plan supersedes that behavior).

**Architecture:** New `salary_accruals` table (one accrued charge per staff member per month). A **cron job** on the 1st posts **charge** ledger rows for the **previous calendar month**; remittance marking posts **payment** ledger rows (via existing `billingPayments` + `billing_transactions` payment pattern) and links payment to charge. Accrual status is tracked on `salary_accruals`, not via invoices/FIFO.

**Tech Stack:** Drizzle ORM (SQLite), Next.js 16 App Router, existing billing primitives (`postHomeTransactionInTx`, `recordPayment` patterns), VillageList shell.

---

## Decisions (locked)

| Topic | Decision |
|-------|----------|
| **Accrual timing** | **Cron required** — `POST /api/internal/cron/generate-monthly-salary-accruals` at **00:05 UTC on the 1st** of each month, accruing the **previous calendar month** (e.g. 1 Apr → March payroll). Manual “Generate accruals” on remittance UI remains for catch-up / re-runs. |
| **Payment amount** | **Full payment only** — `amountPaidMinor` must equal `amountAccruedMinor` exactly. No partial pay, no overpay. Reject remittance otherwise. |
| **Pro-rating** | **None** — always accrue the full `monthlySalaryMinor`. Never daily or partial-month calculation. Staff hired mid-month are included at full rate if eligible for that month's accrual run (see eligibility below). |

### Accrual eligibility (no pro-rating)

Include staff in a billing month when **all** of:

- `status === "active"` at accrual run time
- `effectiveFrom <= last day of billing month`
- `effectiveTo` is null **or** `effectiveTo >= first day of billing month`

Accrued amount is always `staffSalaries.monthlySalaryMinor` (snapshotted to `amountAccruedMinor`). No day-count math.

---

## Background: Current vs Target

| | Current (implemented) | Target (this plan) |
|---|----------------------|-------------------|
| **Accrual** | None — obligation invisible until paid | **Charge** posted per active staff per month |
| **Remittance** | One `expense` txn | **Payment** txn (negative `amountMinor`) |
| **Ledger link** | `salary_remittances.ledger_transaction_id` → expense | Accrual → charge txn; remittance → payment txn |
| **Unpaid view** | Remittance grid only | Remittance grid + positive home ledger balance / accrual list |
| **Analytics** | Cash-out at `postedAtUtcMs` | Billed by accrual month; cash-out by `paidOn` / payment receipt month |

### Why not invoices?

Home operating expenses use finalized **invoices** + FIFO settlement (`settleFinalizedInvoicesFifo`). That works for PO batches but is heavy for payroll:

- One invoice per staff per month → too many documents.
- One payroll invoice per home per month → viable, but mixes inventory/PO semantics with HR payroll and complicates the home-expenses ledger UI.

**Decision:** Standalone `salary_accruals` + direct `billing_transactions` charge rows. Simpler domain model; remittance service owns settlement state.

### Sign conventions (home account)

Same as existing billing:

- **Charge** (`txnType: "charge"`, positive `amountMinor`) — salary owed for the period.
- **Payment** (`txnType: "payment"`, negative `amountMinor`) — cash paid out when remittance is marked.

Running balance on the home account increases with unpaid charges and decreases when payments are recorded.

---

## File Structure

| File | Responsibility |
|------|----------------|
| `src/db/schema.ts` | Add `salaryAccruals`; rename remittance ledger column |
| `drizzle/0065_salary_accruals_charge_payment.sql` | Migration + backfill notes |
| `src/lib/salaries/ledger.ts` | Constants: `SALARY_ACCRUAL_SOURCE_KIND`, payment memos |
| `src/lib/salaries/accruals.ts` | Generate/list/accrual CRUD, charge posting |
| `src/lib/salaries/accruals.test.ts` | Accrual generation + idempotency tests |
| `src/lib/salaries/service.ts` | Remittance posts payment instead of expense; links accrual |
| `src/lib/salaries/service.test.ts` | Update remittance tests for charge+payment |
| `src/app/api/homes/[id]/salary-accruals/route.ts` | GET list + POST generate for month |
| `src/app/api/internal/cron/generate-monthly-salary-accruals/route.ts` | Cron: accrue previous month for all homes |
| `src/app/dashboard/staff/remittance/RemittanceUI.tsx` | Show accrual status; “Generate accruals” if missing |
| `src/lib/analytics/financialOverview.ts` | Accrual month for billed; payment month for cash-out |
| `src/lib/billing/homeAccounts.ts` | Optional: salary unpaid summary helper |

---

## Domain Model

### `salary_accruals`

One row = one month's salary obligation for one staff member.

```typescript
export const salaryAccruals = sqliteTable(
  "salary_accruals",
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
    /** Accrued amount in minor units (from staff rate at accrual time). */
    amountAccruedMinor: integer("amount_accrued_minor").notNull(),
    /** Ledger charge row. */
    chargeLedgerTransactionId: text("charge_ledger_transaction_id")
      .notNull()
      .references(() => billingTransactions.id, { onDelete: "restrict" }),
    /** ISO YYYY-MM-DD — accounting date for the charge (default: last day of period month). */
    accruedOn: text("accrued_on").notNull(),
    /** `accrued` | `paid` | `void` */
    status: text("status").notNull(),
    createdAtUtcMs: integer("created_at_utc_ms").notNull(),
    updatedAtUtcMs: integer("updated_at_utc_ms").notNull(),
  },
  (t) => [
    uniqueIndex("salary_accruals_staff_period_uq").on(
      t.staffSalaryId,
      t.periodYear,
      t.periodMonth,
    ),
    uniqueIndex("salary_accruals_charge_ledger_uq").on(t.chargeLedgerTransactionId),
    index("salary_accruals_home_period_idx").on(t.homeId, t.periodYear, t.periodMonth),
  ],
);
```

### `salary_remittances` (schema change)

Rename ledger link to reflect payment semantics:

```typescript
// Replace ledgerTransactionId with:
paymentLedgerTransactionId: text("payment_ledger_transaction_id")
  .notNull()
  .references(() => billingTransactions.id, { onDelete: "restrict" }),

// Optional FK for explicit link (recommended):
salaryAccrualId: text("salary_accrual_id")
  .references(() => salaryAccruals.id, { onDelete: "restrict" }),
```

### Ledger `source_kind` values

| Event | `sourceKind` | `sourceId` | `txnType` |
|-------|--------------|------------|-----------|
| Monthly accrual | `salary_accrual` | `salary_accruals.id` | `charge` |
| Remittance | `payment` | `billing_payments.id` | `payment` |

Payment memo: `charge:{chargeLedgerTransactionId}` — matches existing home payment ↔ charge linking in `listHomeAccountPaymentsLedger`.

---

## Vertical Slice 1: Schema & Migration

### Task 1: Add `salary_accruals` and alter remittances

**Files:**
- Modify: `src/db/schema.ts`
- Create: `drizzle/0065_salary_accruals_charge_payment.sql`
- Modify: `drizzle/meta/_journal.json`

- [ ] **Step 1: Add `salaryAccruals` table** (definition above).

- [ ] **Step 2: Add nullable columns on remittances for migration**

```sql
ALTER TABLE salary_remittances ADD salary_accrual_id text REFERENCES salary_accruals(id) ON DELETE restrict;
ALTER TABLE salary_remittances RENAME COLUMN ledger_transaction_id TO payment_ledger_transaction_id;
```

SQLite rename is supported; if tooling prefers add+copy+drop, document the chosen approach in the migration file.

- [ ] **Step 3: Data migration strategy for existing remittances**

Existing rows have a single **expense** txn (`sourceKind = 'salary_remittance'`). Options (pick one in implementation):

1. **Clean break (recommended for dev):** Delete expense txns + remittance rows; re-accrue + re-mark paid manually.
2. **Backfill script:** For each remittance, insert synthetic accrual + convert expense → payment pair (complex; only if production data exists).

Document chosen path in migration comments.

- [ ] **Step 4: Run migration**

```bash
npm run db:migrate
```

- [ ] **Step 5: Commit**

```bash
git add src/db/schema.ts drizzle/
git commit -m "feat(salaries): add salary_accruals for charge/payment ledger model"
```

---

## Vertical Slice 2: Accrual Service

### Task 2: `generateMonthlySalaryAccruals`

**Files:**
- Create: `src/lib/salaries/accruals.ts`
- Create: `src/lib/salaries/accruals.test.ts`
- Modify: `src/lib/salaries/ledger.ts`

- [ ] **Step 1: Write failing test — idempotent accrual for active staff**

```typescript
it("creates one charge per active staff for the billing month", () => {
  // seed home + 2 active staff + 1 inactive
  const result = generateMonthlySalaryAccruals(db, adminActor, {
    homeId,
    billingMonth: "2026-03",
  });
  expect(result.created).toBe(2);
  expect(result.skipped).toHaveLength(0);
  // verify billing_transactions: txnType charge, sourceKind salary_accrual
});
```

- [ ] **Step 2: Implement `generateMonthlySalaryAccruals`**

Behavior (mirror `generateMonthlyCharges` idempotency):

1. Parse `billingMonth` (`YYYY-MM`) → `periodYear`, `periodMonth`.
2. Load **eligible** active `staff_salaries` for home (see **Accrual eligibility** — full month rate, no pro-rating).
3. Skip staff who already have a `salary_accruals` row for that period (`skipped: { staffSalaryId, reason: "duplicate" }`).
4. In one DB transaction per staff (or one transaction for whole batch):
   - Insert `salary_accruals` row (`status: "accrued"`).
   - Call `postHomeTransactionInTx` with:
     - `txnType: "charge"`
     - `amountMinor: staff.monthlySalaryMinor` (full month; snapshotted to `amountAccruedMinor`)
     - `sourceKind: "salary_accrual"`
     - `sourceId: accrual.id`
     - `memo: formatSalaryRemittanceMemo(fullName, year, month)`
     - `postedAtUtcMs: calendarDateIsoToUtcMs(accruedOn)` where `accruedOn` = **last calendar day of billing month**.

- [ ] **Step 3: Implement `listSalaryAccrualsForMonth`**

Returns accruals joined with staff name + remittance (if any) for remittance grid enrichment.

- [ ] **Step 4: Implement `voidSalaryAccrual` (admin only)**

Only allowed when `status === "accrued"` and no remittance exists:

- Delete charge ledger row.
- Set accrual `status: "void"` (or hard-delete row — prefer soft void for audit).

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(salaries): add monthly salary accrual generation with ledger charges"
```

---

## Vertical Slice 3: Remittance → Payment

### Task 3: Replace expense posting with payment posting

**Files:**
- Modify: `src/lib/salaries/service.ts`
- Modify: `src/lib/salaries/service.test.ts`
- Modify: `src/lib/salaries/ledger.ts` — remove `SALARY_REMITTANCE_SOURCE_KIND` expense constant; add accrual constant.

- [ ] **Step 1: Update failing remittance test**

```typescript
it("posts payment linked to accrual charge when marking paid", () => {
  generateMonthlySalaryAccruals(db, adminActor, { homeId, billingMonth: "2026-03" });
  const accrual = /* fetch accrual for staff */;
  const remittance = createRemittance(db, adminActor, { ... period 2026-03 ... });

  const paymentTxn = db.select().from(billingTransactions)
    .where(eq(billingTransactions.id, remittance.paymentLedgerTransactionId)).get();
  expect(paymentTxn!.txnType).toBe("payment");
  expect(paymentTxn!.amountMinor).toBe(-remittance.amountPaidMinor);
  expect(paymentTxn!.memo).toBe(`charge:${accrual.chargeLedgerTransactionId}`);

  const chargeTxn = db.select()...get();
  expect(accrual.status).toBe("paid"); // after settlement
});

it("rejects remittance when amountPaidMinor differs from accrued amount", () => {
  generateMonthlySalaryAccruals(db, adminActor, { homeId, billingMonth: "2026-03" });
  expect(() =>
    createRemittance(db, adminActor, {
      staffSalaryId,
      homeId,
      periodYear: 2026,
      periodMonth: 3,
      amountPaidMinor: 1, // not equal to accrued
      paidOn: "2026-03-05",
    }),
  ).toThrow(); // ValidationError: full payment required
});
```

- [ ] **Step 2: Refactor `createRemittance`**

Preconditions:

1. Accrual must exist for `(staffSalaryId, periodYear, periodMonth)` with `status === "accrued"`.
2. If no accrual → `ValidationError("Generate salary accruals for this month before marking paid.")`.

Transaction steps:

1. Load accrual; validate **`amountPaidMinor === accrual.amountAccruedMinor`** — reject with `ValidationError` if not equal (full payment only).
2. Create `billing_payments` row + payment ledger txn (extract helper `recordSalaryRemittancePaymentInTx` or reuse `recordPayment` internals with home account).
3. Set payment memo to `charge:{accrual.chargeLedgerTransactionId}`.
4. Insert `salary_remittances` with `paymentLedgerTransactionId`, `salaryAccrualId`, `amountPaidMinor` (= accrued amount).
5. Update accrual `status: "paid"`, `updatedAtUtcMs`.

Remove: `postHomeTransactionInTx` with `txnType: "expense"`.

- [ ] **Step 3: Refactor `deleteRemittance`**

Order (FK-safe):

1. Delete `billing_payments` row (if created).
2. Delete payment ledger txn.
3. Delete remittance row.
4. Set accrual back to `status: "accrued"`.

- [ ] **Step 4: Commit**

```bash
git commit -m "feat(salaries): remittance records payment against salary accrual charge"
```

---

## Vertical Slice 4: API & UI

### Task 4: Accrual API + remittance grid updates

**Files:**
- Create: `src/app/api/homes/[id]/salary-accruals/route.ts`
- Modify: `src/app/api/homes/[id]/salary-remittances/route.ts` (no contract change if service validates accrual)
- Modify: `src/app/dashboard/staff/remittance/RemittanceUI.tsx`

- [ ] **Step 1: `GET /api/homes/[id]/salary-accruals?year=&month=`**

Returns accruals for month with staff join + remittance status.

- [ ] **Step 2: `POST /api/homes/[id]/salary-accruals`**

Body: `{ billingMonth: "YYYY-MM" }` → calls `generateMonthlySalaryAccruals`.

Admin only; home scope.

- [ ] **Step 3: Remittance UI**

For selected home + month:

| Staff state | UI |
|-------------|-----|
| No accrual batch yet | Banner: “Accruals not generated for this month” + **Generate accruals** button (catch-up; cron handles routine runs) |
| Accrued, not paid | **Mark paid** — amount fixed to accrued total (read-only or pre-filled) |
| Paid | **Undo** (existing) + paid date/method |

Remittance form must not allow editing pay amount away from accrued total.

- [ ] **Step 4: i18n** — add strings to `en.ts`, `si.ts`, `ta.ts` for accrual banner/button/errors.

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(salaries): accrual API and remittance UI for charge/payment flow"
```

---

## Vertical Slice 5: Cron

### Task 5: Auto-accrue on schedule (required)

**Files:**
- Create: `src/app/api/internal/cron/generate-monthly-salary-accruals/route.ts`

- [ ] **Step 1: Mirror `generate-monthly-charges` cron auth and shape**

Schedule: **`POST` with `Authorization: Bearer $CRON_SECRET` at 00:05 UTC on the 1st** of each month.

Default `billingMonth` = **previous calendar month** (not current — payroll closes the month just ended):

```typescript
import { shiftBillingMonth, utcBillingMonthFromMs } from "@/lib/billing/billingMonth";

const currentMonth = utcBillingMonthFromMs(Date.now());
const billingMonth = shiftBillingMonth(currentMonth, -1);

// For each non-archived home:
generateMonthlySalaryAccruals(db, systemActor, { homeId, billingMonth });
```

Accept optional `{ billingMonth: "YYYY-MM" }` in JSON body for manual/catch-up invocations (same as resident charges cron).

- [ ] **Step 2: Document cron schedule** in `AGENTS.md` or ops runbook alongside `generate-monthly-charges`.

- [ ] **Step 3: Commit**

```bash
git commit -m "feat(salaries): cron endpoint for monthly salary accruals"
```

---

## Vertical Slice 6: Analytics & Ledger UI

### Task 6: Align reporting with charge/payment semantics

**Files:**
- Modify: `src/lib/analytics/financialOverview.ts`
- Modify: `src/app/dashboard/homes/[id]/ledger/BillingLedgerPanel.tsx` (minor)

- [ ] **Step 1: Expense snapshot**

| Metric | Source |
|--------|--------|
| **Billed (accrual)** | Sum `salary_accruals.amountAccruedMinor` where `accruedOn` month in range |
| **Cash out (paid)** | Sum `billing_payments.amountMinor` for home account where payment memo starts with `charge:` and linked charge has `sourceKind = salary_accrual` — or sum remittance `amountPaidMinor` by `paidOn` month |
| **Unpaid salaries** | Sum accruals with `status === "accrued"` |

Update `expensesByCategory`: keep **Staff salaries** row; use **cash-out** (payments) for `totalExpensesMinor` to match PO expense semantics.

- [ ] **Step 2: Monthly cash flow chart**

Add staff salary payments into `expensesMinor` bucket (payment receipt month, not accrual month).

- [ ] **Step 3: Ledger panel**

- `sourceKind` label: `salary_accrual` → “Staff salary (accrued)”.
- Payment rows already show via `payment` txnType; memo shows linked charge id.

- [ ] **Step 4: Tests** for analytics helper with accrual + payment fixture.

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(salaries): analytics and ledger labels for accrual/payment model"
```

---

## Vertical Slice 7: Cleanup

### Task 7: Remove superseded expense-path code

- [ ] Delete `SALARY_REMITTANCE_SOURCE_KIND` expense usage (keep constant only if needed for migration detection).
- [ ] Update `0064` migration comment in this doc — historical only.
- [ ] Ensure no references to `txnType: "expense"` for salaries remain.
- [ ] Run full test suite; fix any broken salary/analytics tests.

```bash
git commit -m "refactor(salaries): remove single-expense ledger path"
```

---

## Business Rules (v1)

1. **Accrual before payment** — cannot mark paid without accrual for that staff/period.
2. **One accrual per staff per month** — unique index enforced.
3. **One remittance per staff per month** — unchanged.
4. **Full payment only** — `amountPaidMinor` must equal `amountAccruedMinor`; reject partial or overpayment.
5. **No pro-rating** — accrual always uses full `monthlySalaryMinor`; eligibility by date range only (see **Decisions**).
6. **Cron accrual** — previous month auto-accrued on 1st at 00:05 UTC; manual generate for catch-up only.
7. **Inactive staff** — excluded from accrual if inactive at run time; if deactivated after accrual, accrual remains until voided manually.
8. **Rate changes mid-month** — amount snapshotted at accrual run from current `monthlySalaryMinor` (full month, not prorated).
9. **Undo remittance** — reopens accrual; does not delete charge.

---

## Testing Checklist

- [ ] `generateMonthlySalaryAccruals` idempotent (second call → skipped, no duplicate charges).
- [ ] Accrual posts exactly one charge txn per staff.
- [ ] `createRemittance` without accrual → validation error.
- [ ] `createRemittance` with `amountPaidMinor !== amountAccruedMinor` → validation error.
- [ ] `createRemittance` posts payment with negative amount + charge memo.
- [ ] `deleteRemittance` restores accrual to `accrued`, removes payment.
- [ ] `voidSalaryAccrual` blocked when remittance exists.
- [ ] Home ledger running balance: +charge, −payment, net zero after full pay cycle.
- [ ] Cron endpoint accrues previous month for all non-archived homes.
- [ ] Analytics: unpaid accruals visible; cash-out counted in payment month.

---

## Rollout Notes

1. Deploy schema migration during low-traffic window.
2. If dev/staging has remittances under old expense model, run cleanup script or `db:reset` + re-seed.
3. Configure cron: **1st of month, 00:05 UTC**, `POST` to `/api/internal/cron/generate-monthly-salary-accruals` with `CRON_SECRET`.
4. Manual **Generate accruals** on remittance UI is for catch-up only (missed cron, new home, backfill).
