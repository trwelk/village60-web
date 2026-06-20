import { sql } from "drizzle-orm";
import {
  index,
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: text("role").notNull(),
  failureTimestampsUtcMs: text("failure_timestamps_utc_ms").notNull().default("[]"),
  lockedUntilUtcMs: integer("locked_until_utc_ms"),
  createdAtUtcMs: integer("created_at_utc_ms").notNull(),
  primaryHomeId: text("primary_home_id").references(() => homes.id, {
    onDelete: "restrict",
  }),
  displayName: text("display_name"),
  phone: text("phone"),
  avatarUrl: text("avatar_url"),
  preferredLocale: text("preferred_locale").notNull().default("en"),
});

export const authEvents = sqliteTable("auth_events", {
  id: text("id").primaryKey(),
  userId: text("user_id"),
  email: text("email").notNull(),
  eventType: text("event_type").notNull(),
  occurredAtUtcMs: integer("occurred_at_utc_ms").notNull(),
});

export const homes = sqliteTable("homes", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  /** Physical / postal site address for public enquiry copy; nullable. */
  address: text("address"),
  defaultCurrencyCode: text("default_currency_code").notNull(),
  /** Scheduled meds: flag when days of stock remaining fall below this. */
  medLowStockDaysThreshold: integer("med_low_stock_days_threshold")
    .notNull()
    .default(5),
  /** PRN meds: flag when servings remaining fall below this. */
  medLowStockServingsThreshold: integer("med_low_stock_servings_threshold")
    .notNull()
    .default(5),
  /** Scheduled meds: suggested PO qty targets this many days of supply. */
  medReorderDaysSupply: integer("med_reorder_days_supply").notNull().default(14),
  /** PRN meds: suggested PO qty targets this many servings. */
  medReorderServingsSupply: integer("med_reorder_servings_supply")
    .notNull()
    .default(10),
  archivedAtUtcMs: integer("archived_at_utc_ms"),
  createdAtUtcMs: integer("created_at_utc_ms").notNull(),
  updatedAtUtcMs: integer("updated_at_utc_ms").notNull(),
});

/** Public enquiry leads (`source = web` | `admin`). FK: deleting a home is blocked while leads reference it. */
export const homeInterestLeads = sqliteTable("home_interest_leads", {
  id: text("id").primaryKey(),
  homeId: text("home_id")
    .notNull()
    .references(() => homes.id, { onDelete: "restrict" }),
  homeNameSnapshot: text("home_name_snapshot").notNull(),
  homeAddressSnapshot: text("home_address_snapshot"),
  contactName: text("contact_name").notNull(),
  phone: text("phone").notNull(),
  email: text("email"),
  note: text("note"),
  source: text("source").notNull(),
  consentAccepted: integer("consent_accepted", { mode: "boolean" }).notNull(),
  status: text("status").notNull(),
  createdByUserId: text("created_by_user_id").references(() => users.id, {
    onDelete: "set null",
  }),
  createdAtUtcMs: integer("created_at_utc_ms").notNull(),
  updatedAtUtcMs: integer("updated_at_utc_ms").notNull(),
});

/**
 * Rolling-window submit counters per client IP key for `/interest` abuse control.
 * One row per IP key; window resets when expired.
 */
export const homeInterestLeadSubmitBuckets = sqliteTable(
  "home_interest_lead_submit_buckets",
  {
    ipKey: text("ip_key").primaryKey(),
    windowStartUtcMs: integer("window_start_utc_ms").notNull(),
    count: integer("count").notNull(),
  },
);

export const wards = sqliteTable("wards", {
  id: text("id").primaryKey(),
  homeId: text("home_id")
    .notNull()
    .references(() => homes.id, { onDelete: "cascade" }),
  label: text("label").notNull(),
  sortOrder: integer("sort_order"),
  bedCount: integer("bed_count"),
  /** Home currency minor units per resident per month; see homes.defaultCurrencyCode. */
  monthlyRatePerPersonMinor: integer("monthly_rate_per_person_minor"),
  archivedAtUtcMs: integer("archived_at_utc_ms"),
  createdAtUtcMs: integer("created_at_utc_ms").notNull(),
  updatedAtUtcMs: integer("updated_at_utc_ms").notNull(),
});

/** Care users: extra homes beyond `users.primary_home_id` (floaters). */
export const userAdditionalHomes = sqliteTable(
  "user_additional_homes",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    homeId: text("home_id")
      .notNull()
      .references(() => homes.id, { onDelete: "restrict" }),
  },
  (t) => [primaryKey({ columns: [t.userId, t.homeId] })],
);

/** Manual operational tasks scoped to a home (25a). */
export const tasks = sqliteTable(
  "tasks",
  {
    id: text("id").primaryKey(),
    homeId: text("home_id")
      .notNull()
      .references(() => homes.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    notes: text("notes"),
    /** ISO date-only `YYYY-MM-DD`; nullable when unscheduled. */
    dueDate: text("due_date"),
    /** `normal` | `urgent` — app-enforced in v1. */
    priority: text("priority").notNull(),
    /** `open` | `completed` — app-enforced in v1. */
    status: text("status").notNull(),
    createdByUserId: text("created_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    completedAtUtcMs: integer("completed_at_utc_ms"),
    createdAtUtcMs: integer("created_at_utc_ms").notNull(),
    updatedAtUtcMs: integer("updated_at_utc_ms").notNull(),
  },
  (t) => [
    index("tasks_home_status_idx").on(t.homeId, t.status),
    index("tasks_status_created_idx").on(t.status, t.createdAtUtcMs),
  ],
);

/** Core resident record; date-only fields are ISO `YYYY-MM-DD` (no TZ conversion). */
export const residents = sqliteTable(
  "residents",
  {
    id: text("id").primaryKey(),
    homeId: text("home_id")
      .notNull()
      .references(() => homes.id, { onDelete: "cascade" }),
    fullName: text("full_name").notNull(),
    /** Trim, collapse internal whitespace, lowercase ASCII — see `normalizeFullNameForUniqueness`. */
    normalizedFullName: text("normalized_full_name").notNull(),
    dob: text("dob").notNull(),
    admissionDate: text("admission_date").notNull(),
    wardId: text("ward_id").references(() => wards.id, { onDelete: "set null" }),
    roomText: text("room_text"),
    status: text("status").notNull(),
    nokName: text("nok_name"),
    nokContact: text("nok_contact"),
    nokRelationship: text("nok_relationship"),
    poaSameAsNok: integer("poa_same_as_nok", { mode: "boolean" })
      .notNull()
      .default(false),
    poaName: text("poa_name"),
    poaContact: text("poa_contact"),
    poaRelationship: text("poa_relationship"),
    /** Care user assigned to this resident's home; optional display line (e.g. agency). */
    assignedNurseUserId: text("assigned_nurse_user_id").references(
      () => users.id,
      { onDelete: "set null" },
    ),
    assignedNurseDisplayOverride: text("assigned_nurse_display_override"),
    /** **33a**: Single portrait; bytes under `RESIDENT_PORTRAITS_DIR`; path relative to that base. */
    portraitStoredRelativePath: text("portrait_stored_relative_path"),
    portraitContentType: text("portrait_content_type"),
    portraitSizeBytes: integer("portrait_size_bytes"),
    portraitUpdatedAtUtcMs: integer("portrait_updated_at_utc_ms"),
    /** Unguessable token for public profile page `/r/{publicToken}` and QR codes. */
    publicToken: text("public_token"),
    createdAtUtcMs: integer("created_at_utc_ms").notNull(),
    updatedAtUtcMs: integer("updated_at_utc_ms").notNull(),
  },
  (t) => [
    uniqueIndex("residents_home_dob_normname_uq").on(
      t.homeId,
      t.dob,
      t.normalizedFullName,
    ),
    uniqueIndex("residents_public_token_uq").on(t.publicToken),
  ],
);

/**
 * Unified billing accounts table.
 *
 * Exactly one owner pointer is set by `accountType`:
 * - `resident`: `residentId` set, `homeId` null
 * - `home`: `homeId` set, `residentId` null
 */
export const accounts = sqliteTable(
  "accounts",
  {
    id: text("id").primaryKey(),
    accountType: text("account_type")
      .notNull()
      .default("resident")
      .$type<"resident" | "home">(),
    residentId: text("resident_id").references(() => residents.id, { onDelete: "cascade" }),
    homeId: text("home_id").references(() => homes.id, { onDelete: "restrict" }),
    currencyCode: text("currency_code").notNull(),
    createdAtUtcMs: integer("created_at_utc_ms").notNull(),
    updatedAtUtcMs: integer("updated_at_utc_ms").notNull(),
  },
  (t) => [
    uniqueIndex("accounts_resident_uq").on(t.residentId),
    uniqueIndex("accounts_home_uq").on(t.homeId),
  ],
);


export const billingTransactions = sqliteTable(
  "billing_transactions",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    /** Discriminator: `'resident'` (default) or `'home'`. */
    accountType: text("account_type")
      .notNull()
      .default("resident")
      .$type<"resident" | "home">(),
    txnType: text("txn_type").notNull(),
    amountMinor: integer("amount_minor").notNull(),
    sourceKind: text("source_kind").notNull(),
    sourceId: text("source_id"),
    memo: text("memo"),
    recordedByUserId: text("recorded_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    postedAtUtcMs: integer("posted_at_utc_ms").notNull(),
  },
  (t) => [
    index("billing_transactions_account_posted_idx").on(t.accountId, t.postedAtUtcMs),
    uniqueIndex("billing_transactions_source_uq").on(t.sourceKind, t.sourceId),
  ],
);

/** Payment receipt metadata; each row maps to one posted ledger transaction. */
export const billingPayments = sqliteTable(
  "billing_payments",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    amountMinor: integer("amount_minor").notNull(),
    /** When the payment was received (UTC milliseconds; calendar date at midnight UTC). */
    receivedOn: integer("received_on").notNull(),
    method: text("method").notNull(),
    externalReference: text("external_reference"),
    notes: text("notes"),
    recordedByUserId: text("recorded_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    ledgerTransactionId: text("ledger_transaction_id")
      .notNull()
      .references(() => billingTransactions.id, { onDelete: "restrict" }),
    updatedAtUtcMs: integer("updated_at_utc_ms").notNull(),
  },
  (t) => [
    uniqueIndex("billing_payments_ledger_transaction_uq").on(t.ledgerTransactionId),
    index("billing_payments_account_received_idx").on(t.accountId, t.receivedOn),
  ],
);

/** Resident billing docs for period statements and charge grouping. */
export const invoices = sqliteTable(
  "invoices",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    /** Home scope for display and monotonic `invNo` (matches PO numbering per home). */
    homeId: text("home_id").references(() => homes.id, { onDelete: "restrict" }),
    /** Human-readable invoice number unique per `homeId` (e.g. INV-00001). */
    invNo: text("inv_no"),
    /** When set, draft invoice was spawned when this PO auto-closed (one row per PO + account). */
    purchaseOrderId: text("purchase_order_id").references(() => homePurchaseOrders.id, {
      onDelete: "set null",
    }),
    status: text("status").notNull(),
    /** Invoice document date (UTC calendar `YYYY-MM-DD`). */
    issuedOn: text("issued_on"),
    totalMinorSnapshot: integer("total_minor_snapshot"),
    createdAtUtcMs: integer("created_at_utc_ms").notNull(),
    updatedAtUtcMs: integer("updated_at_utc_ms").notNull(),
  },
  (t) => [
    index("invoices_account_status_issued_idx").on(t.accountId, t.status, t.issuedOn),
    index("invoices_home_created_idx").on(t.homeId, t.createdAtUtcMs),
    uniqueIndex("invoices_home_inv_no_uq")
      .on(t.homeId, t.invNo)
      .where(sql`${t.invNo} IS NOT NULL AND ${t.homeId} IS NOT NULL`),
    uniqueIndex("invoices_po_account_uq")
      .on(t.purchaseOrderId, t.accountId)
      .where(sql`${t.purchaseOrderId} IS NOT NULL`),
  ],
);

/** Lines that make up an invoice, with category for billing semantics. */
export const invoiceLineItems = sqliteTable(
  "invoice_line_items",
  {
    id: text("id").primaryKey(),
    invoiceId: text("invoice_id")
      .notNull()
      .references(() => invoices.id, { onDelete: "cascade" }),
    purchaseOrderLineId: text("purchase_order_line_id").references(
      () => homePurchaseOrderLines.id,
      { onDelete: "set null" },
    ),
    category: text("category").notNull(),
    description: text("description").notNull(),
    amountMinor: integer("amount_minor").notNull(),
    serviceMonth: text("service_month"),
    quantity: integer("quantity").notNull().default(1),
    createdAtUtcMs: integer("created_at_utc_ms").notNull(),
    updatedAtUtcMs: integer("updated_at_utc_ms").notNull(),
  },
  (t) => [
    index("invoice_line_items_invoice_idx").on(t.invoiceId),
    index("invoice_line_items_po_line_idx").on(t.purchaseOrderLineId),
  ],
);

/**
 * Departure reason and instant for departed residents (1:1 with `residents`).
 * `ON DELETE CASCADE` so home→resident cascades and resident deletes succeed.
 */
export const residentDepartureDetails = sqliteTable("resident_departure_details", {
  residentId: text("resident_id")
    .primaryKey()
    .references(() => residents.id, { onDelete: "cascade" }),
  reason: text("reason").notNull(),
  departedAtUtcMs: integer("departed_at_utc_ms").notNull(),
});

/** Current diagnosed conditions (short labels); Phase 1 has no history rows. */
export const residentConditions = sqliteTable(
  "resident_conditions",
  {
    id: text("id").primaryKey(),
    residentId: text("resident_id")
      .notNull()
      .references(() => residents.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
    sortOrder: integer("sort_order").notNull(),
    createdAtUtcMs: integer("created_at_utc_ms").notNull(),
    updatedAtUtcMs: integer("updated_at_utc_ms").notNull(),
  },
  (t) => [index("resident_conditions_resident_idx").on(t.residentId)],
);

export const residentAllergies = sqliteTable(
  "resident_allergies",
  {
    id: text("id").primaryKey(),
    residentId: text("resident_id")
      .notNull()
      .references(() => residents.id, { onDelete: "cascade" }),
    allergen: text("allergen").notNull(),
    notes: text("notes"),
    sortOrder: integer("sort_order").notNull(),
    createdAtUtcMs: integer("created_at_utc_ms").notNull(),
    updatedAtUtcMs: integer("updated_at_utc_ms").notNull(),
  },
  (t) => [index("resident_allergies_resident_idx").on(t.residentId)],
);

/**
 * Inventory item catalog for stockable products. `unitClass` drives backend
 * quantity precision validation:
 * - `countable`: integer-only base units
 * - `measurable`: fractional base units (up to 3 decimals in v1)
 */
export const inventoryItems = sqliteTable(
  "inventory_items",
  {
    id: text("id").primaryKey(),
    homeId: text("home_id")
      .notNull()
      .references(() => homes.id, { onDelete: "cascade" }),
    categoryId: text("category_id")
      .notNull()
      .references(() => inventoryItemCategories.id, { onDelete: "restrict" }),
    name: text("name").notNull(),
    baseUnit: text("base_unit").notNull(),
    unitClass: text("unit_class").notNull(),
    createdAtUtcMs: integer("created_at_utc_ms").notNull(),
    updatedAtUtcMs: integer("updated_at_utc_ms").notNull(),
  },
  (t) => [
    index("inventory_items_home_idx").on(t.homeId),
    index("inventory_items_category_idx").on(t.categoryId),
    uniqueIndex("inventory_items_home_name_base_unit_uq").on(
      t.homeId,
      sql`lower(trim(${t.name}))`,
      sql`trim(${t.baseUnit})`,
    ),
  ],
);

/** Home-scoped inventory item categories for catalog grouping/filtering. */
export const inventoryItemCategories = sqliteTable(
  "inventory_item_categories",
  {
    id: text("id").primaryKey(),
    homeId: text("home_id")
      .notNull()
      .references(() => homes.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    createdAtUtcMs: integer("created_at_utc_ms").notNull(),
    updatedAtUtcMs: integer("updated_at_utc_ms").notNull(),
  },
  (t) => [
    index("inventory_item_categories_home_idx").on(t.homeId),
    uniqueIndex("inventory_item_categories_home_name_uq").on(
      t.homeId,
      sql`lower(trim(${t.name}))`,
    ),
  ],
);

/** Global purchasing suppliers for inventory POs (36f). */
export const inventorySuppliers = sqliteTable(
  "inventory_suppliers",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    address: text("address"),
    phone: text("phone"),
    email: text("email"),
    createdAtUtcMs: integer("created_at_utc_ms").notNull(),
    updatedAtUtcMs: integer("updated_at_utc_ms").notNull(),
  },
  (t) => [
    uniqueIndex("inventory_suppliers_name_uq").on(sql`lower(trim(${t.name}))`),
  ],
);

/** Materialized current stock balance by polymorphic owner + item. */
export const inventoryBalances = sqliteTable(
  "inventory_balances",
  {
    id: text("id").primaryKey(),
    ownerType: text("owner_type").notNull(),
    ownerId: text("owner_id").notNull(),
    itemId: text("item_id")
      .notNull()
      .references(() => inventoryItems.id, { onDelete: "restrict" }),
    quantityBaseUnits: real("quantity_base_units").notNull(),
    createdAtUtcMs: integer("created_at_utc_ms").notNull(),
    updatedAtUtcMs: integer("updated_at_utc_ms").notNull(),
  },
  (t) => [
    uniqueIndex("inventory_balances_owner_item_uq").on(
      t.ownerType,
      t.ownerId,
      t.itemId,
    ),
    index("inventory_balances_item_idx").on(t.itemId),
  ],
);

/** Append-only stock movement ledger keyed to external source rows. */
export const inventoryTransactions = sqliteTable(
  "inventory_transactions",
  {
    id: text("id").primaryKey(),
    ownerType: text("owner_type").notNull(),
    ownerId: text("owner_id").notNull(),
    itemId: text("item_id")
      .notNull()
      .references(() => inventoryItems.id, { onDelete: "restrict" }),
    transactionType: text("transaction_type").notNull(),
    transferId: text("transfer_id"),
    quantityDeltaBaseUnits: real("quantity_delta_base_units").notNull(),
    sourceType: text("source_type").notNull(),
    sourceId: text("source_id").notNull(),
    note: text("note"),
    actorUserId: text("actor_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    createdAtUtcMs: integer("created_at_utc_ms").notNull(),
  },
  (t) => [
    index("inventory_transactions_owner_item_created_idx").on(
      t.ownerType,
      t.ownerId,
      t.itemId,
      t.createdAtUtcMs,
    ),
    index("inventory_transactions_source_idx").on(t.sourceType, t.sourceId),
    index("inventory_transactions_transfer_idx").on(t.transferId),
  ],
);

export const residentMedications = sqliteTable(
  "resident_medications",
  {
    id: text("id").primaryKey(),
    residentId: text("resident_id")
      .notNull()
      .references(() => residents.id, { onDelete: "cascade" }),
    itemId: text("item_id")
      .notNull()
      .references(() => inventoryItems.id, {
        onDelete: "restrict",
      }),
    quantityPerServing: real("quantity_per_serving").notNull(),
    servingsPerDay: integer("servings_per_day"),
    directions: text("directions").notNull(),
    prn: integer("prn", { mode: "boolean" }).notNull().default(false),
    /** JSON array of slot ids: morning | afternoon | evening | night */
    scheduledSlots: text("scheduled_slots"),
    status: text("status").notNull().default("active"),
    sortOrder: integer("sort_order").notNull(),
    createdAtUtcMs: integer("created_at_utc_ms").notNull(),
    updatedAtUtcMs: integer("updated_at_utc_ms").notNull(),
  },
  (t) => [
    index("resident_medications_resident_idx").on(t.residentId),
    uniqueIndex("resident_medications_resident_item_uq").on(
      t.residentId,
      t.itemId,
    ),
  ],
);

/** Medication administration audit trail (MAR). */
export const medicationAdministrations = sqliteTable(
  "medication_administrations",
  {
    id: text("id").primaryKey(),
    homeId: text("home_id")
      .notNull()
      .references(() => homes.id, { onDelete: "cascade" }),
    residentId: text("resident_id")
      .notNull()
      .references(() => residents.id, { onDelete: "cascade" }),
    residentMedicationId: text("resident_medication_id")
      .notNull()
      .references(() => residentMedications.id, { onDelete: "cascade" }),
    slot: text("slot").notNull(),
    date: text("date").notNull(),
    administeredByUserId: text("administered_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    notes: text("notes"),
    administeredAtUtcMs: integer("administered_at_utc_ms").notNull(),
    createdAtUtcMs: integer("created_at_utc_ms").notNull(),
  },
  (t) => [
    index("medication_administrations_home_date_idx").on(t.homeId, t.date),
    index("medication_administrations_resident_medication_idx").on(
      t.residentMedicationId,
      t.date,
    ),
    uniqueIndex("medication_administrations_scheduled_uq")
      .on(t.residentMedicationId, t.slot, t.date)
      .where(sql`${t.slot} != 'prn'`),
  ],
);

/**
 * Global key/value settings (**34a**). Integer values only in v1; extend as needed.
 */
export const appSettings = sqliteTable("app_settings", {
  key: text("key").primaryKey(),
  valueInt: integer("value_int").notNull(),
  updatedAtUtcMs: integer("updated_at_utc_ms").notNull(),
});

/** Last assigned numeric `po_number` suffix per home (PO-`lastSuffix`). */
export const homePoNumberSeq = sqliteTable("home_po_number_seq", {
  homeId: text("home_id")
    .primaryKey()
    .references(() => homes.id, { onDelete: "cascade" }),
  lastSuffix: integer("last_suffix").notNull(),
  updatedAtUtcMs: integer("updated_at_utc_ms").notNull(),
});

/** Last assigned numeric `inv_no` suffix per home (INV-`lastSuffix`). */
export const homeInvNumberSeq = sqliteTable("home_inv_number_seq", {
  homeId: text("home_id")
    .primaryKey()
    .references(() => homes.id, { onDelete: "cascade" }),
  lastSuffix: integer("last_suffix").notNull(),
  updatedAtUtcMs: integer("updated_at_utc_ms").notNull(),
});

/** Home-scoped purchase order header lifecycle (36b). */
export const homePurchaseOrders = sqliteTable(
  "home_purchase_orders",
  {
    id: text("id").primaryKey(),
    homeId: text("home_id")
      .notNull()
      .references(() => homes.id, { onDelete: "restrict" }),
    poNumber: text("po_number").notNull(),
    supplierId: text("supplier_id")
      .notNull()
      .references(() => inventorySuppliers.id, { onDelete: "restrict" }),
    status: text("status").notNull(),
    currencyCode: text("currency_code"),
    approvedAtUtcMs: integer("approved_at_utc_ms"),
    approvedByUserId: text("approved_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    sentAtUtcMs: integer("sent_at_utc_ms"),
    sentByUserId: text("sent_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdByUserId: text("created_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    /** PO creation instant (Unix ms UTC). Shown as “Create date” in inventory orders UI (app timezone). */
    createdAtUtcMs: integer("created_at_utc_ms").notNull(),
    updatedAtUtcMs: integer("updated_at_utc_ms").notNull(),
  },
  (t) => [
    uniqueIndex("home_purchase_orders_home_po_number_uq").on(t.homeId, t.poNumber),
    index("home_purchase_orders_home_status_idx").on(t.homeId, t.status),
  ],
);

/** Purchase order lines with explicit ownership and line status (36b). */
export const homePurchaseOrderLines = sqliteTable(
  "home_purchase_order_lines",
  {
    id: text("id").primaryKey(),
    purchaseOrderId: text("purchase_order_id")
      .notNull()
      .references(() => homePurchaseOrders.id, { onDelete: "cascade" }),
    itemId: text("item_id")
      .notNull()
      .references(() => inventoryItems.id, { onDelete: "restrict" }),
    ownerType: text("owner_type").notNull(),
    ownerId: text("owner_id").notNull(),
    /** Supplier-facing ordering unit label (e.g. bottle); may match catalog base unit. */
    purchaseUnitType: text("purchase_unit_type").notNull().default(""),
    quantityOrderedBaseUnits: real("quantity_ordered_base_units").notNull(),
    quantityReceivedBaseUnits: real("quantity_received_base_units")
      .notNull()
      .default(0),
    status: text("status").notNull().default("OPEN"),
    createdAtUtcMs: integer("created_at_utc_ms").notNull(),
    updatedAtUtcMs: integer("updated_at_utc_ms").notNull(),
  },
  (t) => [
    index("home_purchase_order_lines_order_idx").on(t.purchaseOrderId),
    index("home_purchase_order_lines_owner_idx").on(t.ownerType, t.ownerId),
  ],
);

/** Immutable receive events for purchase-order line receipts (36c). */
export const homePurchaseOrderReceiveEvents = sqliteTable(
  "home_purchase_order_receive_events",
  {
    id: text("id").primaryKey(),
    purchaseOrderId: text("purchase_order_id")
      .notNull()
      .references(() => homePurchaseOrders.id, { onDelete: "cascade" }),
    purchaseOrderLineId: text("purchase_order_line_id")
      .notNull()
      .references(() => homePurchaseOrderLines.id, { onDelete: "cascade" }),
    qtyReceivedEvent: real("qty_received_event").notNull(),
    baseUnitsReceivedEvent: real("base_units_received_event").notNull(),
    unitPriceCents: integer("unit_price_cents").notNull(),
    currencyCode: text("currency_code").notNull(),
    receivedAtUtcMs: integer("received_at_utc_ms").notNull(),
    note: text("note"),
    createdByUserId: text("created_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    createdAtUtcMs: integer("created_at_utc_ms").notNull(),
  },
  (t) => [
    index("home_po_receive_events_po_line_idx").on(
      t.purchaseOrderLineId,
      t.receivedAtUtcMs,
    ),
    index("home_po_receive_events_po_currency_idx").on(t.purchaseOrderId, t.currencyCode),
  ],
);

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
