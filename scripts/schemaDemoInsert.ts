/**
 * Rebuilds SQLite with coherent demo rows from `src/db/schema.ts`:
 * **4 active residents** (one per home of 4), **LKR**, rich **billing**:
 * per-resident **paid** finalized invoice (3 line items + matching ledger charges
 * + `billing_payments`), a **draft** invoice (lines only, no ledger), and per-home
 * **home-account** finalized invoice (2 lines + charges + payment; last home is a
 * partial pay so the receipt is below invoice total).
 *
 * Also seeds **`admin@example.com`** (password **`admin`**, bcrypt) as an additional
 * admin with primary home `mh01`.
 *
 * Does not use `fullSeedDataset.ts`. Run after migrations (`npm run db:migrate`).
 *
 * Usage (from `web/`):
 *   npm run db:schema-demo -- --force
 */

import { sql } from "drizzle-orm";
import { closeDbConnection, getDb } from "@/db/client";
import {
  accounts,
  appSettings,
  authEvents,
  billingPayments,
  billingTransactions,
  homeInterestLeadSubmitBuckets,
  homeInterestLeads,
  homeInvNumberSeq,
  homePoNumberSeq,
  homePurchaseOrderLines,
  homePurchaseOrderReceiveEvents,
  homePurchaseOrders,
  homes,
  inventoryBalances,
  inventoryItemCategories,
  inventoryItems,
  inventorySuppliers,
  inventoryTransactions,
  invoiceLineItems,
  invoices,
  residentAllergies,
  residentConditions,
  residentDepartureDetails,
  residentMedications,
  residents,
  tasks,
  userAdditionalHomes,
  users,
  wards,
} from "@/db/schema";
import { hashPassword } from "@/lib/iam/password";

/** Homes, catalog breadth, ancillary rows (`users`, `tasks`, …). */
const HOMES_N = 4;
/** Exactly four active billing residents (`mh01` … `mh04`). */
const RESIDENTS_N = HOMES_N;
const DEMO_PASSWORD = "SchemaDemo#12";

/** LKR-ish minor-unit magnitudes for care-boarding demo (whole rupees × 100 as cents-like minor). */
const MISC_CHARGE_MINOR = 45_500;
const OTHER_LINE_MINOR = 18_750;

function normalizeFullName(raw: string): string {
  return raw.trim().replace(/\s+/g, " ").toLowerCase();
}

function deleteLegacyTableIfPresent(tableName: string): void {
  const db = getDb();
  const row = db
    .select({ name: sql<string>`name` })
    .from(sql`sqlite_master`)
    .where(sql`type = 'table' and name = ${tableName}`)
    .get();
  if (!row) return;
  db.run(sql.raw(`delete from "${tableName}"`));
}

/** Hard-delete every application row in FK-safe order. */
function wipeApplicationData(): void {
  const db = getDb();
  db.delete(billingPayments).run();
  db.delete(billingTransactions).run();
  db.delete(invoiceLineItems).run();
  db.delete(invoices).run();
  db.delete(homePurchaseOrderReceiveEvents).run();
  db.delete(homePurchaseOrderLines).run();
  db.delete(homePurchaseOrders).run();
  db.delete(inventoryTransactions).run();
  db.delete(inventoryBalances).run();
  db.delete(residentMedications).run();
  db.delete(residentConditions).run();
  db.delete(residentAllergies).run();
  db.delete(residentDepartureDetails).run();
  db.delete(accounts).run();
  db.delete(residents).run();
  db.delete(tasks).run();
  db.delete(homeInterestLeads).run();
  db.delete(wards).run();
  db.delete(inventoryItems).run();
  db.delete(inventoryItemCategories).run();
  db.delete(homePoNumberSeq).run();
  db.delete(homeInvNumberSeq).run();
  db.delete(userAdditionalHomes).run();
  db.delete(authEvents).run();
  db.delete(users).run();
  db.delete(homeInterestLeadSubmitBuckets).run();
  db.delete(appSettings).run();
  // Legacy tables may still exist before drop migrations; clear them to avoid FK blocks on homes.
  deleteLegacyTableIfPresent("home_expense_attachments");
  deleteLegacyTableIfPresent("home_expenses");
  deleteLegacyTableIfPresent("expense_types");
  db.delete(homes).run();
  db.delete(inventorySuppliers).run();
}

/** Fixed expectations after seed — catches drift if schema or script regress. */
function assertExpectedCounts(expect: {
  invoiceLineItems: number;
  ledgerChargeTxns: number;
  ledgerPaymentTxns: number;
}): void {
  const db = getDb();

  function count(actual: number, label: string, expected: number): void {
    if (actual !== expected) {
      throw new Error(`Row count assertions failed: ${label}: expected ${expected}, got ${actual}`);
    }
  }

  count(db.select({ c: sql<number>`count(*)` }).from(homes).get()!.c, "homes", HOMES_N);
  count(db.select({ c: sql<number>`count(*)` }).from(users).get()!.c, "users", HOMES_N + 1);
  count(db.select({ c: sql<number>`count(*)` }).from(wards).get()!.c, "wards", HOMES_N);
  count(db.select({ c: sql<number>`count(*)` }).from(residents).get()!.c, "residents", RESIDENTS_N);
  count(
    db.select({ c: sql<number>`count(*)` }).from(accounts).get()!.c,
    "accounts",
    RESIDENTS_N + HOMES_N,
  );
  count(db.select({ c: sql<number>`count(*)` }).from(invoices).get()!.c, "invoices", RESIDENTS_N * 2 + HOMES_N);
  count(
    db.select({ c: sql<number>`count(*)` }).from(invoiceLineItems).get()!.c,
    "invoice_line_items",
    expect.invoiceLineItems,
  );
  count(
    db.select({ c: sql<number>`count(*)` }).from(billingTransactions).get()!.c,
    "billing_transactions",
    expect.ledgerChargeTxns + expect.ledgerPaymentTxns,
  );
  count(
    db.select({ c: sql<number>`count(*)` }).from(billingPayments).get()!.c,
    "billing_payments",
    expect.ledgerPaymentTxns,
  );

  count(
    db.select({ c: sql<number>`count(*)` }).from(residentConditions).get()!.c,
    "resident_conditions",
    RESIDENTS_N,
  );
  count(db.select({ c: sql<number>`count(*)` }).from(residentAllergies).get()!.c, "resident_allergies", RESIDENTS_N);
  count(
    db.select({ c: sql<number>`count(*)` }).from(residentMedications).get()!.c,
    "resident_medications",
    RESIDENTS_N,
  );
  count(db.select({ c: sql<number>`count(*)` }).from(residentDepartureDetails).get()!.c, "resident_departure_details", 0);
  count(db.select({ c: sql<number>`count(*)` }).from(tasks).get()!.c, "tasks", HOMES_N);
  count(db.select({ c: sql<number>`count(*)` }).from(inventorySuppliers).get()!.c, "inventory_suppliers", HOMES_N);
  count(
    db.select({ c: sql<number>`count(*)` }).from(inventoryItemCategories).get()!.c,
    "inventory_item_categories",
    HOMES_N,
  );
  count(db.select({ c: sql<number>`count(*)` }).from(inventoryItems).get()!.c, "inventory_items", HOMES_N);
  count(db.select({ c: sql<number>`count(*)` }).from(homePurchaseOrders).get()!.c, "home_purchase_orders", HOMES_N);
  count(db.select({ c: sql<number>`count(*)` }).from(homePurchaseOrderLines).get()!.c, "home_purchase_order_lines", HOMES_N);
  count(db.select({ c: sql<number>`count(*)` }).from(homePoNumberSeq).get()!.c, "home_po_number_seq", HOMES_N);
  count(db.select({ c: sql<number>`count(*)` }).from(homeInvNumberSeq).get()!.c, "home_inv_number_seq", HOMES_N);
  count(db.select({ c: sql<number>`count(*)` }).from(inventoryBalances).get()!.c, "inventory_balances", HOMES_N);
  count(db.select({ c: sql<number>`count(*)` }).from(inventoryTransactions).get()!.c, "inventory_transactions", HOMES_N);
  count(
    db.select({ c: sql<number>`count(*)` }).from(homePurchaseOrderReceiveEvents).get()!.c,
    "home_purchase_order_receive_events",
    HOMES_N,
  );
  count(db.select({ c: sql<number>`count(*)` }).from(homeInterestLeads).get()!.c, "home_interest_leads", HOMES_N);
  count(
    db.select({ c: sql<number>`count(*)` }).from(homeInterestLeadSubmitBuckets).get()!.c,
    "home_interest_lead_submit_buckets",
    HOMES_N,
  );
  count(db.select({ c: sql<number>`count(*)` }).from(userAdditionalHomes).get()!.c, "user_additional_homes", HOMES_N);
  count(db.select({ c: sql<number>`count(*)` }).from(authEvents).get()!.c, "auth_events", HOMES_N);
  count(db.select({ c: sql<number>`count(*)` }).from(appSettings).get()!.c, "app_settings", HOMES_N);
}

async function main(): Promise<void> {
  if (!process.argv.includes("--force")) {
    console.error(
      "Deletes all rows in listed application tables (see header comment).\nRun: npm run db:schema-demo -- --force",
    );
    process.exit(1);
  }

  const passwordHash = await hashPassword(DEMO_PASSWORD);
  const adminExampleHash = await hashPassword("admin");

  wipeApplicationData();

  const db = getDb();
  const tBase = Date.UTC(2025, 10, 1, 12, 0, 0, 0);
  /** Service month aligned with seeded monthly_fee postings */
  const serviceMonthFeb = "2026-02";
  const serviceMonthApr = "2026-04";

  const iso = (i: number) =>
    `193${String((i % 9) + 1)}-${String((i % 11) + 1).padStart(2, "0")}-${String((i % 27) + 1).padStart(2, "0")}`;

  const h = (k: number) => `mh${String(k + 1).padStart(2, "0")}`;
  const w = (k: number) => `mw${String(k + 1).padStart(2, "0")}`;
  const ra = (k: number) => `mra${String(k + 1).padStart(2, "0")}`;
  const ha = (k: number) => `mha${String(k + 1).padStart(2, "0")}`;

  const homeRows = Array.from({ length: HOMES_N }, (_, i) => ({
    id: h(i),
    name: `Lanka Haven ${i + 1}`,
    address: `${12 + i} Beach Road, Colombo`,
    defaultCurrencyCode: "LKR",
    archivedAtUtcMs: null as number | null,
    createdAtUtcMs: tBase + i * 1000,
    updatedAtUtcMs: tBase + i * 1000,
  }));

  const userRows = Array.from({ length: HOMES_N }, (_, i) => ({
    id: `mu${String(i + 1).padStart(2, "0")}`,
    email: `user${String(i + 1).padStart(2, "0")}@schema-demo.local`,
    passwordHash,
    role: i < 2 ? "admin" : "care",
    failureTimestampsUtcMs: "[]",
    lockedUntilUtcMs: null as number | null,
    createdAtUtcMs: tBase + i,
    primaryHomeId: h(i),
    displayName: i < 2 ? `Administrator ${i + 1}` : `Clinical staff ${i + 1}`,
    phone: `+94771${String(100000 + i).slice(-6)}`,
    avatarUrl: null as string | null,
  }));

  const wardRows = Array.from({ length: HOMES_N }, (_, i) => ({
    id: w(i),
    homeId: h(i),
    label: `Ward ${String.fromCharCode(65 + i)}`,
    sortOrder: i,
    bedCount: 22 + i * 3,
    /** ~LKR 350k / month illustrative */
    monthlyRatePerPersonMinor: 350_000 + i * 25_000,
    archivedAtUtcMs: null as number | null,
    createdAtUtcMs: tBase,
    updatedAtUtcMs: tBase,
  }));

  const bucketRows = Array.from({ length: HOMES_N }, (_, i) => ({
    ipKey: `demo-ip-${String(i + 1).padStart(2, "0")}`,
    windowStartUtcMs: tBase - 3_600_000,
    count: i + 1,
  }));

  db.insert(homes).values(homeRows).run();
  db.insert(users).values(userRows).run();
  db.insert(users)
    .values({
      id: "mu-admin-example",
      email: "admin@example.com",
      passwordHash: adminExampleHash,
      role: "admin",
      failureTimestampsUtcMs: "[]",
      lockedUntilUtcMs: null as number | null,
      createdAtUtcMs: tBase + 99,
      primaryHomeId: h(0),
      displayName: "Demo admin (admin@example.com)",
      phone: null as string | null,
      avatarUrl: null as string | null,
    })
    .run();

  db.insert(userAdditionalHomes)
    .values(
      Array.from({ length: HOMES_N }, (_, i) => ({
        userId: userRows[(i + 2) % HOMES_N]!.id,
        homeId: h(i),
      })),
    )
    .run();

  db.insert(authEvents)
    .values(
      Array.from({ length: HOMES_N }, (_, i) => ({
        id: `mae${String(i + 1).padStart(2, "0")}`,
        userId: i % 2 === 0 ? userRows[i]!.id : null,
        email: userRows[i]!.email,
        eventType: i % 3 === 0 ? "login_success" : "session_refresh",
        occurredAtUtcMs: tBase + i * 120_000,
      })),
    )
    .run();

  db.insert(wards).values(wardRows).run();

  const statuses = ["new", "contacted", "cancelled", "closed"] as const;

  db.insert(homeInterestLeads)
    .values(
      Array.from({ length: HOMES_N }, (_, i) => ({
        id: `mil${String(i + 1).padStart(2, "0")}`,
        homeId: h(i % HOMES_N),
        homeNameSnapshot: homeRows[i % HOMES_N]!.name,
        homeAddressSnapshot: homeRows[i % HOMES_N]!.address,
        contactName: `Prospect ${i + 1}`,
        phone: `+94772${String(200000 + i)}`,
        email: `enquiry${i + 1}@example.lk`,
        note: i % 2 === 0 ? "Asking wait time for a twin room." : null,
        source: i % 2 === 0 ? "web" : "admin",
        consentAccepted: true,
        status: statuses[i % statuses.length]!,
        createdByUserId: i % 2 === 0 ? userRows[0]!.id : null,
        createdAtUtcMs: tBase + i * 8000,
        updatedAtUtcMs: tBase + i * 8000,
      })),
    )
    .run();

  db.insert(homeInterestLeadSubmitBuckets).values(bucketRows).run();

  db.insert(tasks)
    .values(
      Array.from({ length: HOMES_N }, (_, i) => ({
        id: `mtk${String(i + 1).padStart(2, "0")}`,
        homeId: h(i),
        title: `Fire drill follow-up (${i + 1})`,
        notes: `Check extinguishers on floor ${i + 1}`,
        dueDate: `2026-${String(((i + 2) % 11) + 1).padStart(2, "0")}-${String((i % 26) + 1).padStart(2, "0")}`,
        priority: i === 1 ? "urgent" : "normal",
        status: i % 4 === 0 ? "completed" : "open",
        createdByUserId: userRows[0]!.id,
        completedAtUtcMs: i % 4 === 0 ? tBase + 40_000 : null,
        createdAtUtcMs: tBase,
        updatedAtUtcMs: tBase,
      })),
    )
    .run();

  const residentActive = Array.from({ length: RESIDENTS_N }, (_, i) => {
    const fullName = [`Nimal Perera ${i + 1}`, `Sita Fernando ${i + 1}`, `Kamal Silva ${i + 1}`, `Rani Dias ${i + 1}`][i]!;
    return {
      id: ra(i),
      homeId: h(i),
      fullName,
      normalizedFullName: normalizeFullName(fullName),
      dob: iso(i),
      admissionDate: `2024-${String((i % 11) + 1).padStart(2, "0")}-${String((i % 25) + 1).padStart(2, "0")}`,
      wardId: w(i),
      roomText: `Room ${301 + i}`,
      status: "active" as const,
      nokName: `Emergency contact ${i + 1}`,
      nokContact: `071-${String(2001000 + i)}`,
      nokRelationship: "child",
      poaSameAsNok: i % 2 === 1,
      poaName: i % 2 === 1 ? null : `POA ${i + 1}`,
      poaContact: i % 2 === 1 ? null : `072-${String(3002000 + i)}`,
      poaRelationship: i % 2 === 1 ? null : "sibling",
      assignedNurseUserId: userRows[Math.min(2 + (i % 2), HOMES_N - 1)]!.id,
      assignedNurseDisplayOverride: null as string | null,
      portraitStoredRelativePath: null as string | null,
      portraitContentType: null as string | null,
      portraitSizeBytes: null as number | null,
      portraitUpdatedAtUtcMs: null as number | null,
      createdAtUtcMs: tBase,
      updatedAtUtcMs: tBase,
    };
  });

  db.insert(residents).values(residentActive).run();

  const residentAccountRows = residentActive.map((r, i) => ({
    id: `acct-r-${String(i + 1).padStart(2, "0")}`,
    accountType: "resident" as const,
    residentId: r.id,
    homeId: null as string | null,
    currencyCode: "LKR",
    createdAtUtcMs: tBase,
    updatedAtUtcMs: tBase,
  }));

  const homeAccountRows = Array.from({ length: HOMES_N }, (_, i) => ({
    id: ha(i),
    accountType: "home" as const,
    residentId: null as string | null,
    homeId: h(i),
    currencyCode: "LKR",
    createdAtUtcMs: tBase,
    updatedAtUtcMs: tBase,
  }));

  db.insert(accounts).values(residentAccountRows).run();
  db.insert(accounts).values(homeAccountRows).run();

  const supplierRows = Array.from({ length: HOMES_N }, (_, i) => ({
    id: `msup${String(i + 1).padStart(2, "0")}`,
    name: `Island Medical Supply ${String.fromCharCode(65 + i)}`,
    address: `${40 + i} Industrial Estate, Kaduwela`,
    phone: `+94112${String(880000 + i)}`,
    email: `orders${i + 1}@ims-demo.lk`,
    createdAtUtcMs: tBase,
    updatedAtUtcMs: tBase,
  }));

  db.insert(inventorySuppliers).values(supplierRows).run();

  const categoryRows = Array.from({ length: HOMES_N }, (_, i) => ({
    id: `micat${String(i + 1).padStart(2, "0")}`,
    homeId: h(i),
    name: `${["Clinical", "Domestic", "Kitchen", "Laundry"][i % 4]} (${i + 1})`,
    createdAtUtcMs: tBase,
    updatedAtUtcMs: tBase,
  }));

  db.insert(inventoryItemCategories).values(categoryRows).run();

  const itemRows = Array.from({ length: HOMES_N }, (_, i) => ({
    id: `mitem${String(i + 1).padStart(2, "0")}`,
    homeId: h(i),
    categoryId: categoryRows[i]!.id,
    name: `${i % 2 === 0 ? "Paracetamol" : "Hand soap"} refill ${i + 1}`,
    baseUnit: i % 2 === 0 ? "tablet" : "L",
    unitClass: i % 2 === 0 ? ("countable" as const) : ("measurable" as const),
    createdAtUtcMs: tBase,
    updatedAtUtcMs: tBase,
  }));

  db.insert(inventoryItems).values(itemRows).run();

  // --- Resident invoices & billing ---
  let lineItemCounter = 0;
  type LineIns = typeof invoiceLineItems.$inferInsert;
  const invoiceLineBulk: LineIns[] = [];
  const chargeTxnBulk: typeof billingTransactions.$inferInsert[] = [];
  const billingPaymentBulk: typeof billingPayments.$inferInsert[] = [];

  /**
   * One finalized invoice (paid) per resident — three ledger charges + receipt.
   */
  function buildResidentPaidInvoice(i: number): void {
    const accountId = residentAccountRows[i]!.id;
    const hid = h(i);
    const rateMinor = wardRows[i]!.monthlyRatePerPersonMinor!;
    const invIdFinal = `minv-fin-${String(i + 1).padStart(2, "0")}`;
    const issuedFinal = `2026-02-${String(((i % 26) || 12) % 26 || 14).padStart(2, "0")}`;
    const lineFee = `mlin-${(++lineItemCounter).toString().padStart(4, "0")}`;
    const lineMisc = `mlin-${(++lineItemCounter).toString().padStart(4, "0")}`;
    const lineOther = `mlin-${(++lineItemCounter).toString().padStart(4, "0")}`;

    invoiceLineBulk.push(
      {
        id: lineFee,
        invoiceId: invIdFinal,
        category: "monthly_fee",
        description: `Residential board — February care package (${hid})`,
        amountMinor: rateMinor,
        serviceMonth: serviceMonthFeb,
        quantity: 1,
        createdAtUtcMs: tBase,
        updatedAtUtcMs: tBase,
      },
      {
        id: lineMisc,
        invoiceId: invIdFinal,
        category: "misc",
        description: "Clinical consumables allocation",
        amountMinor: MISC_CHARGE_MINOR + i * 750,
        serviceMonth: null,
        quantity: 1,
        createdAtUtcMs: tBase,
        updatedAtUtcMs: tBase,
      },
      {
        id: lineOther,
        invoiceId: invIdFinal,
        category: "other_charge",
        description: "Mobility aids rental top-up",
        amountMinor: OTHER_LINE_MINOR + i * 550,
        serviceMonth: null,
        quantity: 1,
        createdAtUtcMs: tBase,
        updatedAtUtcMs: tBase,
      },
    );

    const totalFinal =
      rateMinor +
      MISC_CHARGE_MINOR +
      OTHER_LINE_MINOR +
      i * 750 +
      i * 550;

    const stampFinal = tBase + 240_000 + i * 8_800;

    db.insert(invoices)
      .values({
        id: invIdFinal,
        accountId,
        homeId: hid,
        invNo: `INV-${String(i + 1).padStart(5, "0")}`,
        purchaseOrderId: null,
        status: "paid",
        issuedOn: issuedFinal,
        totalMinorSnapshot: totalFinal,
        createdAtUtcMs: stampFinal - 9000,
        updatedAtUtcMs: stampFinal,
      })
      .run();

    const postedMinorFee = `${accountId}:${serviceMonthFeb}`;
    chargeTxnBulk.push(
      {
        id: `blx-r${i}-m`,
        accountId,
        accountType: "resident",
        txnType: "charge",
        amountMinor: rateMinor,
        sourceKind: "invoice_monthly_fee",
        sourceId: postedMinorFee,
        memo: "Residential board — February care package",
        recordedByUserId: userRows[0]!.id,
        postedAtUtcMs: stampFinal - 2000,
      },
      {
        id: `blx-r${i}-a`,
        accountId,
        accountType: "resident",
        txnType: "charge",
        amountMinor: MISC_CHARGE_MINOR + i * 750,
        sourceKind: "invoice_line_item",
        sourceId: lineMisc,
        memo: "Clinical consumables allocation",
        recordedByUserId: userRows[0]!.id,
        postedAtUtcMs: stampFinal - 1500,
      },
      {
        id: `blx-r${i}-b`,
        accountId,
        accountType: "resident",
        txnType: "charge",
        amountMinor: OTHER_LINE_MINOR + i * 550,
        sourceKind: "invoice_line_item",
        sourceId: lineOther,
        memo: "Mobility aids rental top-up",
        recordedByUserId: userRows[0]!.id,
        postedAtUtcMs: stampFinal - 1000,
      },
    );

    const payId = `blpay-r-${String(i + 1).padStart(2, "0")}`;
    const payLedgerId = `blx-rpay-${String(i + 1).padStart(2, "0")}`;
    chargeTxnBulk.push({
      id: payLedgerId,
      accountId,
      accountType: "resident",
      txnType: "payment",
      amountMinor: -totalFinal,
      sourceKind: "payment",
      sourceId: payId,
      memo: `Bank slip — consolidated Feb bill (${issuedFinal})`,
      recordedByUserId: userRows[0]!.id,
      postedAtUtcMs: stampFinal + 2000 + i,
    });

    billingPaymentBulk.push({
      id: payId,
      accountId,
      amountMinor: totalFinal,
      receivedOn: issuedFinal,
      method: i % 2 === 0 ? "bank_transfer" : "cash",
      externalReference: i % 2 === 0 ? `CEFT-${20260200 + i}` : null,
      notes: i === 0 ? "Settled via family standing order." : null,
      recordedByUserId: userRows[i % HOMES_N]!.id,
      ledgerTransactionId: payLedgerId,
      createdAtUtcMs: stampFinal + 5000,
      updatedAtUtcMs: stampFinal + 5000,
    });
  }

  /**
   * Open draft invoice (no ledger postings): mix of anticipated April board + placeholders.
   */
  function buildResidentDraft(i: number): void {
    const accountId = residentAccountRows[i]!.id;
    const hid = h(i);
    const rateMinor = wardRows[i]!.monthlyRatePerPersonMinor!;
    const invIdDraft = `minv-draft-${String(i + 1).padStart(2, "0")}`;
    const lineFee = `mlin-${(++lineItemCounter).toString().padStart(4, "0")}`;
    const lineProg = `mlin-${(++lineItemCounter).toString().padStart(4, "0")}`;
    invoiceLineBulk.push(
      {
        id: lineFee,
        invoiceId: invIdDraft,
        category: "monthly_fee",
        description: `Placeholder board preview — April draft (${hid})`,
        amountMinor: rateMinor,
        serviceMonth: serviceMonthApr,
        quantity: 1,
        createdAtUtcMs: tBase + 880_000 + i,
        updatedAtUtcMs: tBase + 880_000 + i,
      },
      {
        id: lineProg,
        invoiceId: invIdDraft,
        category: "misc",
        description: `Therapy add-on (${i + 1}) — pending clinician sign-off`,
        amountMinor: 22_900 + i * 400,
        serviceMonth: null,
        quantity: 1,
        createdAtUtcMs: tBase + 880_000 + i,
        updatedAtUtcMs: tBase + 880_000 + i,
      },
    );

    db.insert(invoices)
      .values({
        id: invIdDraft,
        accountId,
        homeId: hid,
        invNo: null,
        purchaseOrderId: null,
        status: "draft",
        issuedOn: null,
        totalMinorSnapshot: null,
        createdAtUtcMs: tBase + 879_900 + i,
        updatedAtUtcMs: tBase + 879_990 + i,
      })
      .run();
  }

  for (let i = 0; i < RESIDENTS_N; i++) {
    buildResidentPaidInvoice(i);
    buildResidentDraft(i);
  }

  // --- Home-account invoices + billing ---
  for (let i = 0; i < HOMES_N; i++) {
    const accIdHome = ha(i);
    const hid = h(i);
    const invId = `mhinv-${String(i + 1).padStart(2, "0")}`;
    const lineFuel = `mlin-${(++lineItemCounter).toString().padStart(4, "0")}`;
    const lineStaff = `mlin-${(++lineItemCounter).toString().padStart(4, "0")}`;
    invoiceLineBulk.push(
      {
        id: lineFuel,
        invoiceId: invId,
        category: "misc",
        description: "Facility utilities & generator diesel (allocation)",
        amountMinor: 128_888 + i * 12_000,
        serviceMonth: null,
        quantity: 1,
        createdAtUtcMs: tBase + 200_010 + i,
        updatedAtUtcMs: tBase + 200_010 + i,
      },
      {
        id: lineStaff,
        invoiceId: invId,
        category: "other_charge",
        description: `Agency nursing top-up (${hid})`,
        amountMinor: 67_777 + i * 6_050,
        serviceMonth: null,
        quantity: 1,
        createdAtUtcMs: tBase + 200_010 + i,
        updatedAtUtcMs: tBase + 200_010 + i,
      },
    );
    const homeTotal =
      invoiceLineBulk[invoiceLineBulk.length - 2]!.amountMinor +
      invoiceLineBulk[invoiceLineBulk.length - 1]!.amountMinor;

    const issuedOp = `2026-03-${String(10 + ((i % 15) || 9)).padStart(2, "0")}`;
    db.insert(invoices)
      .values({
        id: invId,
        accountId: accIdHome,
        homeId: hid,
        invNo: `HINV-${String(i + 9).padStart(4, "0")}`,
        purchaseOrderId: null,
        status: "finalized",
        issuedOn: issuedOp,
        totalMinorSnapshot: homeTotal,
        createdAtUtcMs: tBase + 199_980 + i,
        updatedAtUtcMs: tBase + 205_050 + i,
      })
      .run();

    const posted = tBase + 206_060 + i;
    const amtFuel = invoiceLineBulk[invoiceLineBulk.length - 2]!.amountMinor;
    const amtStaff = invoiceLineBulk[invoiceLineBulk.length - 1]!.amountMinor;

    chargeTxnBulk.push(
      {
        id: `blx-h${i}-1`,
        accountId: accIdHome,
        accountType: "home",
        txnType: "charge",
        amountMinor: amtFuel,
        sourceKind: "invoice_line_item",
        sourceId: lineFuel,
        memo: "Facility utilities & generator diesel (allocation)",
        recordedByUserId: userRows[1]!.id,
        postedAtUtcMs: posted,
      },
      {
        id: `blx-h${i}-2`,
        accountId: accIdHome,
        accountType: "home",
        txnType: "charge",
        amountMinor: amtStaff,
        sourceKind: "invoice_line_item",
        sourceId: lineStaff,
        memo: `Agency nursing top-up (${hid})`,
        recordedByUserId: userRows[1]!.id,
        postedAtUtcMs: posted + 500,
      },
    );

    const payH = `blpay-h-${String(i + 1).padStart(2, "0")}`;
    const ledgerH = `blx-hpay-${String(i + 1).padStart(2, "0")}`;
    const unpaidHoldback = i === 3 ? 20_000 : 0;
    const paymentAmountRecorded = Math.max(homeTotal - unpaidHoldback, 1);

    chargeTxnBulk.push({
      id: ledgerH,
      accountId: accIdHome,
      accountType: "home",
      txnType: "payment",
      amountMinor: -paymentAmountRecorded,
      sourceKind: "payment",
      sourceId: payH,
      memo:
        unpaidHoldback > 0 ? "PARTIAL treasurer transfer — balance deliberately left open." : null,
      recordedByUserId: userRows[i % HOMES_N]!.id,
      postedAtUtcMs: posted + 4000,
    });

    billingPaymentBulk.push({
      id: payH,
      accountId: accIdHome,
      amountMinor: paymentAmountRecorded,
      receivedOn: issuedOp,
      method: i % 2 === 0 ? "bank_transfer" : "cheque",
      externalReference: i % 2 === 0 ? (`OP-CHQ-${issuedOp.replace(/-/g, "")}` + i) : null,
      notes: "Home account invoice settlement",
      recordedByUserId: userRows[1]!.id,
      ledgerTransactionId: ledgerH,
      createdAtUtcMs: posted + 9000,
      updatedAtUtcMs: posted + 9000,
    });
  }

  db.insert(invoiceLineItems).values(invoiceLineBulk).run();
  db.insert(billingTransactions).values(chargeTxnBulk).run();
  db.insert(billingPayments).values(billingPaymentBulk).run();

  db.insert(residentConditions)
    .values(
      residentActive.map((r, i) => ({
        id: `mco${String(i + 1).padStart(2, "0")}`,
        residentId: r.id,
        label: ["Hypertension", "Hyperlipidemia", "Hypothyroid", "CKD II"][i]!,
        sortOrder: 0,
        createdAtUtcMs: tBase,
        updatedAtUtcMs: tBase,
      })),
    )
    .run();

  db.insert(residentAllergies)
    .values(
      residentActive.map((r, i) => ({
        id: `mal${String(i + 1).padStart(2, "0")}`,
        residentId: r.id,
        allergen: ["Egg", "Dairy protein", "Iodinated contrast", "Sulphonamides"][i]!,
        notes: null,
        sortOrder: 1,
        createdAtUtcMs: tBase,
        updatedAtUtcMs: tBase,
      })),
    )
    .run();

  db.insert(appSettings)
    .values(
      Array.from({ length: HOMES_N }, (_, i) => ({
        key: `schema_demo.flag_${String(i + 1).padStart(2, "0")}`,
        valueInt: 990 + i * 3,
        updatedAtUtcMs: tBase + i,
      })),
    )
    .run();

  db.insert(homePoNumberSeq)
    .values(
      homeRows.map((home) => ({
        homeId: home.id,
        lastSuffix: HOMES_N,
        updatedAtUtcMs: tBase,
      })),
    )
    .run();

  db.insert(homeInvNumberSeq)
    .values(
      homeRows.map((home, i) => ({
        homeId: home.id,
        lastSuffix: HOMES_N + i + 1,
        updatedAtUtcMs: tBase,
      })),
    )
    .run();

  const purchaseOrders = Array.from({ length: HOMES_N }, (_, i) => ({
    id: `mpo${String(i + 1).padStart(2, "0")}`,
    homeId: h(i),
    poNumber: `PO-${String(i + 1).padStart(5, "0")}`,
    supplierId: supplierRows[i]!.id,
    status: ("CLOSED" as const),
    currencyCode: "LKR" as string | null,
    approvedAtUtcMs: tBase + 6100 + i,
    approvedByUserId: userRows[0]!.id,
    sentAtUtcMs: tBase + 6800 + i,
    sentByUserId: userRows[0]!.id,
    createdByUserId: userRows[(i % 2) + 1]!.id,
    createdAtUtcMs: tBase,
    updatedAtUtcMs: tBase,
  }));

  db.insert(homePurchaseOrders).values(purchaseOrders).run();

  const purchaseOrderLines = purchaseOrders.map((po, i) => ({
    id: `mpol${String(i + 1).padStart(2, "0")}`,
    purchaseOrderId: po.id,
    itemId: itemRows[i]!.id,
    ownerType: "HOME",
    ownerId: po.homeId,
    purchaseUnitType: i % 2 === 0 ? "carton" : "crate",
    quantityOrderedBaseUnits: i % 2 === 0 ? 144 : 3.125,
    quantityReceivedBaseUnits: i % 2 === 0 ? 144 : 3.125,
    status: "RECEIVED",
    createdAtUtcMs: tBase,
    updatedAtUtcMs: tBase,
  }));

  db.insert(homePurchaseOrderLines).values(purchaseOrderLines).run();

  const receiveEvents = purchaseOrderLines.map((line, i) => {
    const eventId = `mrcv${String(i + 1).padStart(2, "0")}`;
    return {
      id: eventId,
      purchaseOrderId: purchaseOrders[i]!.id,
      purchaseOrderLineId: line.id,
      qtyReceivedEvent: purchaseOrderLines[i]!.quantityReceivedBaseUnits,
      baseUnitsReceivedEvent: purchaseOrderLines[i]!.quantityReceivedBaseUnits,
      unitPriceCents: 125 + i * 33,
      currencyCode: "LKR",
      receivedAtUtcMs: tBase + i * 1_990_000,
      note: "Demo goods receipt matched to GRN",
      createdByUserId: userRows[0]!.id,
      createdAtUtcMs: tBase + 990,
    };
  });

  db.insert(homePurchaseOrderReceiveEvents).values(receiveEvents).run();

  db.insert(inventoryTransactions)
    .values(
      receiveEvents.map((ev, i) => ({
        id: `mtx-${String(i + 1).padStart(2, "0")}`,
        ownerType: "HOME",
        ownerId: purchaseOrders[i]!.homeId,
        itemId: itemRows[i]!.id,
        transactionType: "RECEIVE",
        quantityDeltaBaseUnits: purchaseOrderLines[i]!.quantityReceivedBaseUnits,
        sourceType: "PO_RECEIVE_EVENT",
        sourceId: ev.id,
        note: "GRN seeded from demo script.",
        actorUserId: userRows[1]!.id,
        createdAtUtcMs: tBase + i * 1_101,
      })),
    )
    .run();

  db.insert(inventoryBalances)
    .values(
      Array.from({ length: HOMES_N }, (_, i) => ({
        id: `mbal-${String(i + 1).padStart(2, "0")}`,
        ownerType: "HOME",
        ownerId: h(i),
        itemId: itemRows[i]!.id,
        quantityBaseUnits: purchaseOrderLines[i]!.quantityReceivedBaseUnits,
        createdAtUtcMs: tBase,
        updatedAtUtcMs: tBase,
      })),
    )
    .run();

  db.insert(residentMedications)
    .values(
      residentActive.map((r, i) => ({
        id: `mmed-${String(i + 1).padStart(2, "0")}`,
        residentId: r.id,
        itemId: itemRows[i]!.id,
        quantityPerServing: i % 2 === 0 ? 2 : 0.5,
        servingsPerDay: i % 2 === 0 ? 4 : null,
        directions: `${i % 2 === 0 ? "Tablet" : "Liquid"} dose per protocol ${i + 1}`,
        prn: i === 3,
        status: i === 2 ? ("paused" as const) : ("active" as const),
        sortOrder: i,
        createdAtUtcMs: tBase,
        updatedAtUtcMs: tBase,
      })),
    )
    .run();

  const ledgerChargeCount = residentAccountRows.length * 3 + HOMES_N * 2;
  const ledgerPaymentCount = residentAccountRows.length + HOMES_N;
  assertExpectedCounts({
    invoiceLineItems: invoiceLineBulk.length,
    ledgerChargeTxns: ledgerChargeCount,
    ledgerPaymentTxns: ledgerPaymentCount,
  });

  console.log(
    `Schema demo: ${HOMES_N} homes, ${RESIDENTS_N} residents; paid resident invoices + draft + finalized home-account invoices.`,
  );
  console.log(`${DEMO_PASSWORD} for user01–user04@schema-demo.local`);
  console.log(`admin@example.com / admin`);
  console.log(userRows.slice(0, 2).map((u) => `  ${u.email}`).join("\n"));
}

main()
  .then(() => {
    closeDbConnection();
  })
  .catch((err: unknown) => {
    console.error(err);
    closeDbConnection();
    process.exit(1);
  });
