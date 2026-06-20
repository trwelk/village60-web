# Billing Refactor: Explicit Per-Invoice Payment

> **For agentic workers:** Implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Each Vertical Slice ends in a commit.

**Goal:** Replace **account-level FIFO settlement** with **explicit per-invoice payment**. Every finalized invoice is marked paid manually (full amount, one payment per invoice). Payments may only be created through (a) the **invoice detail** page or (b) the **monthly collection** page (including a new **prepay** modal). All other generic "record payment" entry points are removed.

**Depends on / supersedes:** The current FIFO model in `src/lib/billing/invoiceSettlement.ts`, `recordPayment*` in `paymentsLifecycle.ts`, and the account-level collection `mark-paid` route.

**Out of scope (locked):** Salary accruals/remittances (`src/lib/salaries/*`, plan `2026-06-20-salary-ledger-charge-payment.md`) keep their own non-invoice charge/payment model for now. They are reconciled separately.

---

## Decisions (locked)

| Topic | Decision |
|-------|----------|
| **FIFO settlement** | **Removed entirely.** A payment targets exactly one invoice. No floating account credit / no auto-settlement. |
| **Payment amount** | **Full payment only** — paying an invoice posts a payment for the whole `totalMinorSnapshot`. No partial, no overpay. |
| **Payment metadata** | Capture **paid date + method** (+ optional external reference / notes) via a small form. |
| **Scope** | **All invoices** — resident monthly, registration/deposit, and home/PO expense invoices use the same mark-paid model. |
| **Prepay** | Selecting N future months for a resident creates **ONE invoice with one line per month**, finalizes it, then it is marked paid as a whole. |
| **Entry points** | Payment ONLY via invoice detail mark-paid + monthly collection. Remove the Ledger "Record payment" modal and standalone resident/home billing-payments forms/APIs. |
| **Collection row** | One month = one invoice line; each collection row has a button linking to its invoice. |
| **Undo** | Add "Unmark payment" (deletes payment, returns invoice to `finalized`). |

### Payment ↔ invoice link

- Payment ledger txn: `txnType: "payment"`, `amountMinor: -total`, `sourceKind: "invoice_payment"`, `sourceId: invoiceId`.
- The existing unique index `billing_transactions_source_uq (sourceKind, sourceId)` therefore enforces **one payment per invoice**.
- `billing_payments.invoiceId` (new FK) stores the explicit receipt→invoice link for joins/queries.
- Marking paid sets `invoices.status = "paid"` directly (no FIFO walk).

### Invoice statuses (unchanged set, new transitions)

| Status | Meaning | Transitions |
|--------|---------|-------------|
| `draft` | editable, no charges posted | → `finalized` |
| `finalized` | charges posted, unpaid | → `paid` (mark paid), → `draft` (revert) |
| `paid` | full payment recorded | → `finalized` (unmark payment) |

---

## File Structure

| File | Responsibility |
|------|----------------|
| `src/db/schema.ts` | Add `billing_payments.invoiceId` FK |
| `drizzle/0066_invoice_payment_link.sql` | Migration (+ data strategy) |
| `drizzle/meta/_journal.json` | Migration registration |
| `src/lib/billing/invoicePayments.ts` | **New** — `payInvoice`, `unpayInvoice` (full-pay, links payment↔invoice) |
| `src/lib/billing/invoicePayments.test.ts` | **New** — pay/unpay/idempotency/validation tests |
| `src/lib/billing/invoiceLifecycle.ts` | Remove `settleFinalizedInvoicesFifo` calls on finalize/revert |
| `src/lib/billing/paymentsLifecycle.ts` | Remove `recordPayment*` + FIFO; keep statement/list helpers |
| `src/lib/billing/invoiceSettlement.ts` | **Delete** (FIFO) |
| `src/lib/billing/prepayMonths.ts` | **New** — build draft invoice with one monthly_fee line per month |
| `src/lib/billing/residentCharges.ts` | Add `invoiceId` to charge rows; rework paid detection + payments ledger to invoice link |
| `src/app/api/homes/[id]/invoices/[invoiceId]/pay/route.ts` | **New** — POST mark paid, DELETE unmark |
| `src/app/api/homes/[id]/monthly-charges/prepay/route.ts` | **New** — POST create+finalize prepay invoice |
| `src/app/api/homes/[id]/monthly-charges/mark-paid/route.ts` | Rework to pay a specific invoice (or delete in favor of `/pay`) |
| `src/app/api/homes/[id]/billing-payments/route.ts` | **Delete** |
| `src/app/api/homes/[id]/residents/[residentId]/billing-payments/route.ts` | **Delete** |
| `src/app/dashboard/invoices/[invoiceId]/InvoiceDetailClient.tsx` | Add Mark paid / Unmark payment UI + modal |
| `src/app/dashboard/charges/collection/ChargesCollectionUI.tsx` | Per-row invoice link; prepay modal; pay-by-invoice |
| `src/app/dashboard/homes/[id]/ledger/BillingLedgerPanel.tsx` | Remove "Record payment" modal (read-only ledger) |
| `src/lib/analytics/financialOverview.ts` | Audit only (status=paid + receivedOn still valid) |
| `src/lib/i18n/messages/{en,si,ta}.ts` | New strings for pay/unpay/prepay |

---

## Vertical Slice 1: Schema & Migration

### Task 1: Link payments to invoices

**Files:** `src/db/schema.ts`, `drizzle/0066_invoice_payment_link.sql`, `drizzle/meta/_journal.json`

- [ ] **Step 1:** Add nullable FK to `billingPayments`:

```typescript
invoiceId: text("invoice_id").references(() => invoices.id, { onDelete: "restrict" }),
```

Add `index("billing_payments_invoice_idx").on(t.invoiceId)`.

- [ ] **Step 2:** Write migration `0066_invoice_payment_link.sql`:

```sql
ALTER TABLE billing_payments ADD invoice_id text REFERENCES invoices(id) ON DELETE restrict;
CREATE INDEX billing_payments_invoice_idx ON billing_payments(invoice_id);
```

- [ ] **Step 3: Data strategy (document chosen path in migration comments).**
  - **Clean break (recommended for dev):** existing account-level payments are not invoice-linked. Either `db:reset` + reseed, or leave legacy `billing_payments.invoice_id` null (they will not appear as invoice payments; legacy `paid` invoice statuses remain but are no longer recomputed).
  - **Backfill (only if real data):** for each `paid` invoice, synthesize one `invoice_payment` ledger txn + `billing_payments.invoice_id` from the oldest covering payment. Complex; avoid unless needed.

- [ ] **Step 4:** `npm run db:migrate`

- [ ] **Step 5:** Commit — `feat(billing): link billing payments to invoices`

---

## Vertical Slice 2: Pay / Unpay Service (FIFO removal)

### Task 2: `payInvoice` / `unpayInvoice`

**Files:** Create `src/lib/billing/invoicePayments.ts` + `.test.ts`

- [ ] **Step 1: Failing tests**

```typescript
it("marks a finalized invoice paid with a full payment", () => {
  // finalize invoice (total > 0)
  const r = payInvoice(db, admin, { homeId, invoiceId, paidOnUtcMs, method: "cash" });
  const inv = getInvoice(invoiceId);
  expect(inv.status).toBe("paid");
  const txn = db.select().from(billingTransactions)
    .where(and(eq(billingTransactions.sourceKind, "invoice_payment"),
               eq(billingTransactions.sourceId, invoiceId))).get();
  expect(txn!.amountMinor).toBe(-inv.totalMinorSnapshot!);
  const pay = db.select().from(billingPayments).where(eq(billingPayments.id, r.paymentId)).get();
  expect(pay!.invoiceId).toBe(invoiceId);
});

it("rejects paying a draft or already-paid invoice", () => { /* ValidationError */ });
it("rejects paying a zero/empty invoice (no payable total)", () => { /* ValidationError */ });
it("unpayInvoice deletes the payment and returns invoice to finalized", () => { ... });
it("payInvoice is idempotent-safe: second pay throws (unique invoice_payment)", () => { ... });
```

- [ ] **Step 2: Implement `payInvoice`**

Signature: `payInvoice(db, actor, { homeId, invoiceId, paidOnUtcMs, method, externalReference?, notes?, postedAtUtcMs? })`.

In one transaction:
1. Admin + home scope check (reuse `assertActorMayAccessHome`, invoice-home predicate).
2. Load invoice; require `status === "finalized"` (else `ValidationError`).
3. Require `totalMinorSnapshot != null && > 0` (else `ValidationError`).
4. Insert payment ledger txn: `txnType: "payment"`, `amountMinor: -totalMinorSnapshot`, `sourceKind: "invoice_payment"`, `sourceId: invoiceId`, memo from notes.
5. Insert `billing_payments` row: `amountMinor: totalMinorSnapshot`, `receivedOn: paidOnUtcMs`, `method`, `invoiceId`, `ledgerTransactionId`.
6. `invoices.status = "paid"`, bump `updatedAtUtcMs`.

- [ ] **Step 3: Implement `unpayInvoice`**

In one transaction: require `status === "paid"`; find the `invoice_payment` ledger txn for `invoiceId`; delete the `billing_payments` row, delete the ledger txn, set invoice → `finalized`.

- [ ] **Step 4: Commit** — `feat(billing): explicit per-invoice pay/unpay`

### Task 3: Remove FIFO

**Files:** `invoiceLifecycle.ts`, `paymentsLifecycle.ts`, delete `invoiceSettlement.ts`

- [ ] **Step 1:** In `invoiceLifecycle.ts`, remove the `settleFinalizedInvoicesFifo` calls inside `finalizeInvoiceTransaction` and `revertFinalizedInvoiceToDraft`. Finalize → `finalized` only; revert → `draft` only. Drop the import.
- [ ] **Step 2:** In `paymentsLifecycle.ts`, delete `recordPayment`, `recordPaymentForResident`, `recordPaymentForHome` and the FIFO import. **Keep** `getResidentBillingStatement`, `getResidentStatement`, `listResidentBillingAccountsForHome`, `listAllResidentLedgerLines`, and types still referenced by UI/analytics.
- [ ] **Step 3:** Delete `src/lib/billing/invoiceSettlement.ts` and `paymentsLifecycle.test.ts` cases that assert FIFO (rewrite remaining as statement tests).
- [ ] **Step 4:** Fix all resulting type/import breakages (run `npm run typecheck`).
- [ ] **Step 5: Commit** — `refactor(billing): remove FIFO settlement`

---

## Vertical Slice 3: Invoice Detail — Mark Paid

### Task 4: Pay API + invoice UI

**Files:** `src/app/api/homes/[id]/invoices/[invoiceId]/pay/route.ts`, `InvoiceDetailClient.tsx`

- [ ] **Step 1:** `POST /api/homes/[id]/invoices/[invoiceId]/pay` — body `{ paidOn: "YYYY-MM-DD", method, externalReference?, notes? }` → `payInvoice`. `DELETE` same path → `unpayInvoice`. Admin-only; `homesErrorResponse` for errors.
- [ ] **Step 2:** In `InvoiceDetailClient.tsx`, for `status === "finalized"` add a **Mark paid** button opening a small modal (paid date default today, method select, optional reference/notes) → POST `/pay`. For `status === "paid"` show paid summary + **Unmark payment** (DELETE `/pay`).
- [ ] **Step 3:** Keep the existing "Payments" link to the (now read-only) ledger.
- [ ] **Step 4: i18n** strings.
- [ ] **Step 5: Commit** — `feat(billing): mark invoices paid from invoice detail`

---

## Vertical Slice 4: Monthly Collection rework

### Task 5: Collection rows carry invoiceId; pay by invoice

**Files:** `residentCharges.ts`, `monthly-charges/route.ts` (GET shape), `monthly-charges/mark-paid/route.ts`, `ChargesCollectionUI.tsx`

- [ ] **Step 1:** In `residentCharges.ts` `chargeRowsForHome` / `HomeMonthlyChargeLedgerRow`, add `invoiceId` (the line's parent invoice) and keep `paid = invoiceStatus === "paid"`. Populate `paidOn` from the linked `billing_payments.receivedOn` where `invoiceId` matches (replaces the always-null behavior).
- [ ] **Step 2:** Rework `mark-paid` route: accept `{ invoiceId, paidOn, method?, externalReference?, notes? }` and call `payInvoice` (drop `recordPaymentForResident`). (Alternatively delete this route and have the UI call `/invoices/[invoiceId]/pay` directly — pick one; prefer reusing `/pay` and deleting `mark-paid`.)
- [ ] **Step 3:** In `ChargesCollectionUI.tsx`:
  - Per row: **Open invoice** link → `/dashboard/invoices/{invoiceId}?homeId={homeId}`.
  - **Mark paid** per row uses the invoice pay flow (small inline modal or reuse a shared modal) — full amount.
  - **Mark all paid** loops finalized unpaid invoices calling `/pay`.
- [ ] **Step 4: i18n** strings (open invoice, etc.).
- [ ] **Step 5: Commit** — `feat(billing): collection pays specific invoices + invoice links`

### Task 6: Prepay modal

**Files:** `src/lib/billing/prepayMonths.ts`, `monthly-charges/prepay/route.ts`, `ChargesCollectionUI.tsx`

- [ ] **Step 1:** `prepayMonths.ts` — `createPrepayInvoice(db, actor, { homeId, residentId, months: string[] })`:
  - Resolve resident billing account; validate each `YYYY-MM`; reject months already charged (existing `invoice_monthly_fee` ledger row for `{accountId}:{month}`).
  - `createDraftInvoice` with one `monthly_fee` line per month (amount derived from ward rate; `serviceMonth` set), then `finalizeInvoice`.
  - Return `{ invoiceId }`.
- [ ] **Step 2:** `POST /api/homes/[id]/monthly-charges/prepay` — body `{ residentId, months: string[] }` → returns `{ invoiceId }`.
- [ ] **Step 3:** Prepay modal in collection UI: select **home** (prefilled), **resident**, **months** (multi-select). Submit → create+finalize invoice → then immediately offer **Mark paid** (or navigate to the invoice). One line per month; whole invoice paid as one.
- [ ] **Step 4: i18n** strings.
- [ ] **Step 5: Commit** — `feat(billing): prepay future months as one finalized invoice`

---

## Vertical Slice 5: Remove generic payment entry points

### Task 7: Read-only ledger + delete payment APIs

**Files:** `BillingLedgerPanel.tsx`, delete two `billing-payments` routes

- [ ] **Step 1:** Remove the "Record payment" button, payment modal, and `submitPayment` from `BillingLedgerPanel.tsx` (and now-unused state). Panel becomes a read-only statement view.
- [ ] **Step 2:** Delete `src/app/api/homes/[id]/billing-payments/route.ts` and `src/app/api/homes/[id]/residents/[residentId]/billing-payments/route.ts`.
- [ ] **Step 3:** Grep for callers of the deleted routes/functions; remove or repoint (e.g. home-payments / payments dashboard sections that displayed record-payment).
- [ ] **Step 4: Commit** — `refactor(billing): payments only via invoice/collection`

---

## Vertical Slice 6: Other charges + analytics + cleanup

### Task 8: Unify registration/deposit "other charges"

**Files:** `residentCharges.ts` (`listHomeOtherChargesLedger`, `listHomeMonthlyPaymentsLedger`)

- [ ] **Step 1:** Replace memo-based `other-charge:{lineId}` paid detection with invoice-level paid (`invoiceStatus === "paid"`), consistent with monthly charges.
- [ ] **Step 2:** In `listHomeMonthlyPaymentsLedger`, derive charge/month from the payment's linked `invoiceId` (via `billing_payments.invoiceId` / `invoice_payment` sourceId) instead of `charge:` / `other-charge:` memos.
- [ ] **Step 3:** Remove any now-dead `other-charge:` mark-received route/UI if present.
- [ ] **Step 4: Commit** — `refactor(billing): invoice-level paid for all charge types`

### Task 9: Analytics audit + final cleanup

**Files:** `financialOverview.ts` (+ tests)

- [ ] **Step 1:** Confirm analytics still correct: it groups by `invoices.status = "paid"` and `billingPayments.receivedOn` — both preserved. Adjust any query that assumed account-level credit.
- [ ] **Step 2:** Run full suite; fix broken billing tests. Grep for leftover `settleFinalizedInvoicesFifo`, `recordPayment`, `markedPaidInvoiceIds`.
- [ ] **Step 3:** `npm run typecheck && npm run lint && npm test`.
- [ ] **Step 4: Commit** — `test(billing): align suite with per-invoice payment`

---

## Business Rules (v1)

1. **Manual paid** — finalized invoices never auto-pay; admin marks paid explicitly.
2. **One payment per invoice** — enforced by `(sourceKind, sourceId)` unique on `invoice_payment`.
3. **Full payment only** — payment amount == `totalMinorSnapshot`; no partial/overpay.
4. **Payment entry points** — invoice detail + monthly collection (incl. prepay) only.
5. **Prepay** — N months → one finalized invoice, one line per month, paid as a whole.
6. **Unmark** — returns invoice `paid → finalized` and removes payment.
7. **No floating credit** — removing FIFO means no account-level prepayment credit; prepayment is modeled as a finalized+paid invoice.
8. **Cron unchanged** — monthly charge generation still creates one finalized monthly_fee invoice per resident/month; it just stays `finalized` until paid.

---

## Testing Checklist

- [ ] `payInvoice` posts one `invoice_payment` txn (−total) + `billing_payments.invoiceId`; invoice → `paid`.
- [ ] Second `payInvoice` on same invoice → unique-constraint error.
- [ ] `payInvoice` on draft / paid / zero-total → `ValidationError`.
- [ ] `unpayInvoice` removes payment + ledger txn; invoice → `finalized`.
- [ ] Finalize no longer auto-marks paid; revert no longer depends on FIFO.
- [ ] Collection rows expose `invoiceId`, link to invoice page, and `paidOn` populated.
- [ ] Prepay creates one invoice with one line per selected month; pay marks whole invoice.
- [ ] Deleted billing-payments routes return 404; Ledger panel has no record-payment.
- [ ] Other charges (registration/deposit) report paid via invoice status.
- [ ] Analytics: billed/paid/cash-out unchanged for an equivalent scenario.

---

## Rollout Notes

1. Deploy migration `0066` in a low-traffic window.
2. Dev/staging: `db:reset` + reseed (legacy account-level payments are not invoice-linked).
3. Communicate the workflow change: finalize → **Mark paid** per invoice; prepay future months via the collection modal.
