import {
  index,
  integer,
  primaryKey,
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
    createdAtUtcMs: integer("created_at_utc_ms").notNull(),
    updatedAtUtcMs: integer("updated_at_utc_ms").notNull(),
  },
  (t) => [
    uniqueIndex("residents_home_dob_normname_uq").on(
      t.homeId,
      t.dob,
      t.normalizedFullName,
    ),
  ],
);

/** Generated monthly fee row per resident (16b); amounts are snapshots in minor units. */
export const residentMonthlyCharges = sqliteTable(
  "resident_monthly_charges",
  {
    id: text("id").primaryKey(),
    residentId: text("resident_id")
      .notNull()
      .references(() => residents.id, { onDelete: "cascade" }),
    /** UTC calendar month `YYYY-MM` (product: no TZ conversion). */
    billingMonth: text("billing_month").notNull(),
    wardIdSnapshot: text("ward_id_snapshot")
      .notNull()
      .references(() => wards.id, { onDelete: "restrict" }),
    amountMinorSnapshot: integer("amount_minor_snapshot").notNull(),
    createdAtUtcMs: integer("created_at_utc_ms").notNull(),
    updatedAtUtcMs: integer("updated_at_utc_ms").notNull(),
  },
  (t) => [
    uniqueIndex("resident_monthly_charges_resident_billing_uq").on(
      t.residentId,
      t.billingMonth,
    ),
  ],
);

/**
 * One-off line items (registration fee, deposit); separate from monthly billing.
 * At most one row per `(resident_id, type)` over the resident's lifetime.
 */
export const otherCharges = sqliteTable(
  "other_charges",
  {
    id: text("id").primaryKey(),
    residentId: text("resident_id")
      .notNull()
      .references(() => residents.id, { onDelete: "cascade" }),
    /** `registration` | `deposit` — stable string values (app-enforced in v1). */
    type: text("type").notNull(),
    amountMinor: integer("amount_minor").notNull(),
    received: integer("received", { mode: "boolean" }).notNull().default(false),
    /** ISO date-only `YYYY-MM-DD` when received; nullable when not paid. */
    paidOn: text("paid_on"),
    createdAtUtcMs: integer("created_at_utc_ms").notNull(),
    updatedAtUtcMs: integer("updated_at_utc_ms").notNull(),
  },
  (t) => [
    uniqueIndex("other_charges_resident_type_uq").on(t.residentId, t.type),
    index("other_charges_resident_idx").on(t.residentId),
  ],
);

/** At most one payment row per monthly charge (16c). */
export const residentPayments = sqliteTable("resident_payments", {
  id: text("id").primaryKey(),
  residentMonthlyChargeId: text("resident_monthly_charge_id")
    .notNull()
    .references(() => residentMonthlyCharges.id, { onDelete: "cascade" })
    .unique(),
  amountMinor: integer("amount_minor").notNull(),
  /** ISO date-only `YYYY-MM-DD`. */
  paidOn: text("paid_on").notNull(),
  notes: text("notes"),
  recordedByUserId: text("recorded_by_user_id")
    .notNull()
    .references(() => users.id, { onDelete: "restrict" }),
  createdAtUtcMs: integer("created_at_utc_ms").notNull(),
  updatedAtUtcMs: integer("updated_at_utc_ms").notNull(),
});

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

export const residentMedications = sqliteTable(
  "resident_medications",
  {
    id: text("id").primaryKey(),
    residentId: text("resident_id")
      .notNull()
      .references(() => residents.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    dose: text("dose").notNull(),
    frequency: text("frequency").notNull(),
    timingNotes: text("timing_notes"),
    prn: integer("prn", { mode: "boolean" }).notNull().default(false),
    sortOrder: integer("sort_order").notNull(),
    createdAtUtcMs: integer("created_at_utc_ms").notNull(),
    updatedAtUtcMs: integer("updated_at_utc_ms").notNull(),
  },
  (t) => [index("resident_medications_resident_idx").on(t.residentId)],
);
