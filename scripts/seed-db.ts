/**
 * Populate the SQLite database with rich demo data (homes, residents, billing,
 * inventory, purchase orders, tasks, and leads).
 *
 * Usage (from `web/`):
 *   npm run db:seed              — append seed rows; exits if admin@example.com exists
 *   npm run db:seed -- --reset   — wipe app tables (keeps migrations), then seed
 *
 * Requires a migrated database (`npm run db:migrate` or `npm run db:reset`).
 */
import Database from "better-sqlite3";
import { eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { closeDbConnection, getDb } from "@/db/client";
import { DEFAULT_INVENTORY_CATALOG_CATEGORY_NAMES } from "@/lib/inventory/defaultCatalogCategories";
import {
  accounts,
  authEvents,
  billingPayments,
  billingTransactions,
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
import { calendarDateIsoToUtcMs } from "@/lib/billing/receivedOnUtcMs";
import { hashPassword } from "@/lib/iam/password";

const DB_PATH =
  process.env.DATABASE_PATH ??
  path.join(process.cwd(), "data", "village60.sqlite");

const RESET = process.argv.includes("--reset");

/** Application tables only (order does not matter; FK checks are disabled). */
const TABLES_TO_CLEAR = [
  "home_purchase_order_receive_events",
  "home_purchase_order_lines",
  "home_purchase_orders",
  "billing_payments",
  "billing_transactions",
  "invoice_line_items",
  "invoices",
  "resident_medications",
  "resident_allergies",
  "resident_conditions",
  "resident_departure_details",
  "accounts",
  "residents",
  "inventory_transactions",
  "inventory_balances",
  "inventory_items",
  "inventory_item_categories",
  "tasks",
  "home_interest_leads",
  "user_additional_homes",
  "wards",
  "auth_events",
  "users",
  "homes",
  "inventory_suppliers",
  "home_po_number_seq",
  "home_inv_number_seq",
] as const;

function wipeAllApplicationRows() {
  closeDbConnection();
  const sqlite = new Database(DB_PATH);
  try {
    sqlite.pragma("foreign_keys = OFF");
    for (const name of TABLES_TO_CLEAR) {
      sqlite.prepare(`DELETE FROM ${name}`).run();
    }
  } finally {
    sqlite.pragma("foreign_keys = ON");
    sqlite.close();
  }
}

function normFullName(raw: string): string {
  return raw.trim().replace(/\s+/g, " ").toLowerCase();
}

function isoFromYmd(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

type HomeDef = {
  id: string;
  name: string;
  address: string;
  currency: string;
  wards: {
    id: string;
    label: string;
    sortOrder: number;
    bedCount: number;
    monthlyRateMinor: number;
  }[];
};

const HOME_DEFS: HomeDef[] = [
  {
    id: "seed-home-northview",
    name: "Northview Care Residence",
    address: "14 Totara Road, Wellington 6011",
    currency: "LKR",
    wards: [
      {
        id: "seed-ward-nv-mem",
        label: "Memory Support",
        sortOrder: 1,
        bedCount: 18,
        monthlyRateMinor: 7_800_00,
      },
      {
        id: "seed-ward-nv-rest",
        label: "Rest Home",
        sortOrder: 2,
        bedCount: 32,
        monthlyRateMinor: 6_200_00,
      },
      {
        id: "seed-ward-nv-hosp",
        label: "Hospital",
        sortOrder: 3,
        bedCount: 12,
        monthlyRateMinor: 8_950_00,
      },
    ],
  },
  {
    id: "seed-home-riverside",
    name: "Riverside Retirement Villas",
    address: "220 Great South Road, Auckland 1051",
    currency: "LKR",
    wards: [
      {
        id: "seed-ward-rv-care",
        label: "Care Suites",
        sortOrder: 1,
        bedCount: 24,
        monthlyRateMinor: 5_850_00,
      },
      {
        id: "seed-ward-rv-dementia",
        label: "Secure Dementia Unit",
        sortOrder: 2,
        bedCount: 16,
        monthlyRateMinor: 7_200_00,
      },
    ],
  },
  {
    id: "seed-home-harbour",
    name: "Harbour Lights Rest Home",
    address: "9 Marine Parade, Napier 4110",
    currency: "LKR",
    wards: [
      {
        id: "seed-ward-hb-long",
        label: "Long-term Care",
        sortOrder: 1,
        bedCount: 40,
        monthlyRateMinor: 6_450_00,
      },
      {
        id: "seed-ward-hb-resp",
        label: "Respiratory",
        sortOrder: 2,
        bedCount: 8,
        monthlyRateMinor: 9_100_00,
      },
    ],
  },
  {
    id: "seed-home-alpine",
    name: "Alpine View Lodge",
    address: "88 Mountain View Drive, Queenstown 9300",
    currency: "LKR",
    wards: [
      {
        id: "seed-ward-ap-gen",
        label: "General",
        sortOrder: 1,
        bedCount: 28,
        monthlyRateMinor: 6_800_00,
      },
    ],
  },
  {
    id: "seed-home-brookfield",
    name: "Brookfield Manor (UK demo)",
    address: "3 Church Lane, Bath BA1 5BT, United Kingdom",
    currency: "LKR",
    wards: [
      {
        id: "seed-ward-bf-east",
        label: "East Wing",
        sortOrder: 1,
        bedCount: 22,
        monthlyRateMinor: 4_250_00,
      },
      {
        id: "seed-ward-bf-west",
        label: "West Wing",
        sortOrder: 2,
        bedCount: 22,
        monthlyRateMinor: 4_100_00,
      },
    ],
  },
];

const GIVEN = [
  "Margaret",
  "Arthur",
  "Joyce",
  "William",
  "Patricia",
  "Edward",
  "Helen",
  "Robert",
  "Dorothy",
  "James",
  "Barbara",
  "Richard",
  "Linda",
  "Charles",
  "Susan",
  "George",
  "Karen",
  "Thomas",
  "Nancy",
  "Christopher",
];

const FAMILY = [
  "Thompson",
  "Singh",
  "Williams",
  "Chen",
  "Patel",
  "Williams-Brown",
  "Nguyen",
  "O'Connor",
  "Kumar",
  "Murphy",
  "Davies",
  "Wilson",
  "Koroheke",
  "Fernandez",
  "Li",
  "Anderson",
  "Taylor",
  "Martin",
  "Clarke",
  "Robinson",
];

const SUPPLIER_DEFS = [
  {
    id: "seed-sup-pharm",
    name: "CareFirst Pharmacy Wholesale",
    address: "Unit 4, 90 Industry Road, Penrose, Auckland",
    phone: "+64 9 555 0199",
    email: "orders@carefirst.example",
  },
  {
    id: "seed-sup-food",
    name: "Southern Foods Collective",
    address: "Cold store 12, Christchurch Logistics Park",
    phone: "+64 3 555 0288",
    email: "accounts@southernfoods.example",
  },
  {
    id: "seed-sup-lin",
    name: "Pacific Linen Services Ltd",
    address: "17 Freight Drive, Lower Hutt",
    phone: "+64 4 555 0303",
    email: "sales@pacificlinen.example",
  },
  {
    id: "seed-sup-equip",
    name: "MedEquip Supplies NZ",
    address: "PO Box 9080, Newmarket, Auckland",
    phone: "+64 800 662 337",
    email: "orders@mediequip.example",
  },
  {
    id: "seed-sup-office",
    name: "General Stationery Co.",
    address: "Online fulfilment — Auckland DC",
    phone: "+64 9 555 0400",
    email: "b2b@genstat.example",
  },
  {
    id: "seed-sup-uk",
    name: "UK Clinical Consumables Ltd",
    address: "Bristol BS1 6QJ",
    phone: "+44 117 555 0101",
    email: "orders@ukclinical.example",
  },
];

async function main() {
  if (!RESET) {
    closeDbConnection();
    const probe = new Database(DB_PATH);
    try {
      const row = probe
        .prepare(`select 1 as ok from users where lower(email) = lower(?) limit 1`)
        .get("admin@example.com") as { ok: number } | undefined;
      if (row) {
        console.error(
          "admin@example.com already exists. Re-run with --reset to wipe app tables and re-seed, or use npm run db:reset for a full rebuild.",
        );
        process.exit(1);
      }
    } finally {
      probe.close();
    }
  } else {
    console.log("Wiping application tables…");
    wipeAllApplicationRows();
  }

  const adminPasswordHash = await hashPassword("admin");
  const t0 = Date.UTC(2026, 3, 1, 10, 0, 0, 0);

  const db = getDb();

  const userIdAdmin = "seed-user-admin";
  const careUserIds: string[] = [];
  for (let i = 0; i < 12; i++) {
    careUserIds.push(`seed-user-care-${String(i + 1).padStart(2, "0")}`);
  }

  for (const h of HOME_DEFS) {
    db.insert(homes)
      .values({
        id: h.id,
        name: h.name,
        address: h.address,
        defaultCurrencyCode: h.currency,
        archivedAtUtcMs: null,
        createdAtUtcMs: t0,
        updatedAtUtcMs: t0,
      })
      .run();

    for (const w of h.wards) {
      db.insert(wards)
        .values({
          id: w.id,
          homeId: h.id,
          label: w.label,
          sortOrder: w.sortOrder,
          bedCount: w.bedCount,
          monthlyRatePerPersonMinor: w.monthlyRateMinor,
          archivedAtUtcMs: null,
          createdAtUtcMs: t0,
          updatedAtUtcMs: t0,
        })
        .run();
    }
  }

  db.insert(users)
    .values({
      id: userIdAdmin,
      email: "admin@example.com",
      passwordHash: adminPasswordHash,
      role: "admin",
      failureTimestampsUtcMs: "[]",
      lockedUntilUtcMs: null,
      createdAtUtcMs: t0,
      primaryHomeId: HOME_DEFS[0].id,
      displayName: "Village60 Admin",
      phone: "+64 21 555 0100",
      avatarUrl: null,
    })
    .run();

  const careNames = [
    "Sarah Blake",
    "Michael Ho",
    "Emma Patel",
    "Lucy Martin",
    "Daniel Cruz",
    "Hannah Roy",
    "Chris Walker",
    "Priya Nair",
    "Tom Edwards",
    "Riley Ngata",
    "Anna Kowalski",
    "Ben Olsen",
  ];

  for (let i = 0; i < careUserIds.length; i++) {
    const home = HOME_DEFS[i % HOME_DEFS.length];
    db.insert(users)
      .values({
        id: careUserIds[i],
        email: `care.${String(i + 1).padStart(2, "0")}@example.com`,
        passwordHash: adminPasswordHash,
        role: "care",
        failureTimestampsUtcMs: "[]",
        lockedUntilUtcMs: null,
        createdAtUtcMs: t0 + i * 3600_000,
        primaryHomeId: home.id,
        displayName: careNames[i] ?? `Care Staff ${i + 1}`,
        phone: `+64 21 555 ${String(200 + i).padStart(4, "0")}`,
        avatarUrl: null,
      })
      .run();
  }

  /** Two “floater” carers with access to extra homes */
  db.insert(userAdditionalHomes)
    .values([
      { userId: careUserIds[0], homeId: HOME_DEFS[1].id },
      { userId: careUserIds[0], homeId: HOME_DEFS[2].id },
      { userId: careUserIds[1], homeId: HOME_DEFS[3].id },
    ])
    .run();

  for (const s of SUPPLIER_DEFS) {
    const now = t0 + 1;
    db.insert(inventorySuppliers)
      .values({
        id: s.id,
        name: s.name,
        address: s.address,
        phone: s.phone,
        email: s.email,
        createdAtUtcMs: now,
        updatedAtUtcMs: now,
      })
      .run();
  }

  /** Categories + catalog items per home */
  type ItemSeed = {
    id: string;
    categoryIdx: number;
    name: string;
    baseUnit: string;
    unitClass: "countable" | "measurable";
  };

  const homeItems = new Map<string, ItemSeed[]>();
  for (const h of HOME_DEFS) {
    const catIds = DEFAULT_INVENTORY_CATALOG_CATEGORY_NAMES.map((name, idx) => {
      const id = `seed-cat-${h.id}-${idx}`;
      const now = t0 + 2 + idx;
      db.insert(inventoryItemCategories)
        .values({
          id,
          homeId: h.id,
          name,
          createdAtUtcMs: now,
          updatedAtUtcMs: now,
        })
        .run();
      return id;
    });

    const items: ItemSeed[] = [
      {
        id: `seed-item-${h.id}-parac`,
        categoryIdx: 0,
        name: "Paracetamol tablets 500mg",
        baseUnit: "tablet",
        unitClass: "countable",
      },
      {
        id: `seed-item-${h.id}-ibup`,
        categoryIdx: 0,
        name: "Ibuprofen tablets 200mg",
        baseUnit: "tablet",
        unitClass: "countable",
      },
      {
        id: `seed-item-${h.id}-abx`,
        categoryIdx: 0,
        name: "Amoxicillin capsules 500mg",
        baseUnit: "capsule",
        unitClass: "countable",
      },
      {
        id: `seed-item-${h.id}-cream`,
        categoryIdx: 0,
        name: "Hydrocortisone cream 1%",
        baseUnit: "tube",
        unitClass: "countable",
      },
      {
        id: `seed-item-${h.id}-saline`,
        categoryIdx: 0,
        name: "Sterile saline 0.9% 500ml",
        baseUnit: "bottle",
        unitClass: "countable",
      },
      {
        id: `seed-item-${h.id}-ensure`,
        categoryIdx: 1,
        name: "Oral nutrition supplement — vanilla",
        baseUnit: "bottle",
        unitClass: "countable",
      },
      {
        id: `seed-item-${h.id}-slip-m`,
        categoryIdx: 2,
        name: "Adult slip — medium",
        baseUnit: "each",
        unitClass: "countable",
      },
      {
        id: `seed-item-${h.id}-glove`,
        categoryIdx: 2,
        name: "Nitrile gloves — small",
        baseUnit: "each",
        unitClass: "countable",
      },
      {
        id: `seed-item-${h.id}-glove-m`,
        categoryIdx: 2,
        name: "Nitrile gloves — medium",
        baseUnit: "each",
        unitClass: "countable",
      },
      {
        id: `seed-item-${h.id}-purigel`,
        categoryIdx: 2,
        name: "Hand sanitiser gel 1L",
        baseUnit: "bottle",
        unitClass: "measurable",
      },
      {
        id: `seed-item-${h.id}-sheet`,
        categoryIdx: 2,
        name: "Flat sheet — single",
        baseUnit: "each",
        unitClass: "countable",
      },
    ];

    for (const it of items) {
      const now = t0 + 100;
      db.insert(inventoryItems)
        .values({
          id: it.id,
          homeId: h.id,
          categoryId: catIds[it.categoryIdx],
          name: it.name,
          baseUnit: it.baseUnit,
          unitClass: it.unitClass,
          createdAtUtcMs: now,
          updatedAtUtcMs: now,
        })
        .run();
    }
    homeItems.set(h.id, items);
  }

  type ResidentRow = {
    id: string;
    homeId: string;
    wardId: string;
    accountId: string;
    fullName: string;
    status: "active" | "departed";
    assignedNurseUserId: string | null;
  };

  const residentRows: ResidentRow[] = [];
  /** Populated when inserting home-level billing accounts (for invoice + payment seed). */
  const homeAccountByHomeId = new Map<string, string>();
  let globalPerson = 0;

  for (let hi = 0; hi < HOME_DEFS.length; hi++) {
    const h = HOME_DEFS[hi];
    const wardIds = h.wards.map((w) => w.id);
    const residentsThisHome = hi === 4 ? 12 : 18;
    const departedCount = hi === 1 ? 5 : hi === 3 ? 4 : 3;

    for (let k = 0; k < residentsThisHome; k++) {
      const id = randomUUID();
      const wardId = wardIds[k % wardIds.length];
      const gn = GIVEN[globalPerson % GIVEN.length];
      const sn = FAMILY[(globalPerson + hi * 3) % FAMILY.length];
      const fullName = `${gn} ${sn}`;
      const y = 1930 + (globalPerson % 28);
      const mo = (globalPerson + hi) % 12 + 1;
      const d = (globalPerson * 5 + hi + k) % 28 + 1;
      const dob = isoFromYmd(y, mo, d);
      const admission = isoFromYmd(2023 + (k % 3), ((k + hi) % 12) + 1, (k % 26) + 1);
      const departed = k < departedCount;
      const status: "active" | "departed" = departed ? "departed" : "active";
      const nurse = careUserIds[(hi + k) % careUserIds.length];

      const nowMs = t0 + globalPerson * 77_000;

      db.insert(residents)
        .values({
          id,
          homeId: h.id,
          fullName,
          normalizedFullName: normFullName(fullName),
          dob,
          admissionDate: admission,
          wardId,
          roomText: departed ? `Room ${100 + k}` : `Room ${200 + k}`,
          status,
          nokName: k % 4 === 0 ? null : `${GIVEN[(k + 3) % GIVEN.length]} ${FAMILY[(k + 1) % FAMILY.length]}`,
          nokContact: k % 4 === 0 ? null : `+64 27 ${String(400 + k).padStart(3, "0")} ${String(1000 + k).slice(-4)}`,
          nokRelationship: k % 4 === 0 ? null : "spouse",
          poaSameAsNok: k % 5 !== 0,
          poaName: k % 5 === 0 ? "Alexandra Pierce" : null,
          poaContact: k % 5 === 0 ? "+64 29 555 7788" : null,
          poaRelationship: k % 5 === 0 ? "daughter" : null,
          assignedNurseUserId: nurse,
          assignedNurseDisplayOverride:
            k % 11 === 0 ? "Agency RN — Nightingale Staff" : null,
          portraitStoredRelativePath: null,
          portraitContentType: null,
          portraitSizeBytes: null,
          portraitUpdatedAtUtcMs: null,
          publicToken: randomUUID(),
          createdAtUtcMs: nowMs,
          updatedAtUtcMs: nowMs,
        })
        .run();

      if (departed) {
        db.insert(residentDepartureDetails)
          .values({
            residentId: id,
            reason:
              k % 3 === 0
                ? "Transferred to acute hospital"
                : k % 3 === 1
                  ? "Family requested discharge"
                  : "Deceased — natural causes",
            departedAtUtcMs: t0 + 86400_000 * (30 + k + hi * 2),
          })
          .run();
      }

      const accountId = randomUUID();
      db.insert(accounts)
        .values({
          id: accountId,
          accountType: "resident",
          residentId: id,
          homeId: null,
          currencyCode: h.currency,
          createdAtUtcMs: nowMs,
          updatedAtUtcMs: nowMs,
        })
        .run();

      residentRows.push({
        id,
        homeId: h.id,
        wardId,
        accountId,
        fullName,
        status,
        assignedNurseUserId: nurse,
      });

      /** Clinical convenience lists */
      if (!departed && k % 2 === 0) {
        db.insert(residentConditions)
          .values([
            {
              id: randomUUID(),
              residentId: id,
              label: k % 3 === 0 ? "Type 2 diabetes" : "Hypertension",
              sortOrder: 0,
              createdAtUtcMs: nowMs,
              updatedAtUtcMs: nowMs,
            },
            {
              id: randomUUID(),
              residentId: id,
              label: "Osteoarthritis",
              sortOrder: 1,
              createdAtUtcMs: nowMs,
              updatedAtUtcMs: nowMs,
            },
          ])
          .run();
      }

      if (!departed && k % 3 === 0) {
        db.insert(residentAllergies)
          .values({
            id: randomUUID(),
            residentId: id,
            allergen: k % 2 === 0 ? "Penicillin" : "Shellfish",
            notes: "Documented in GP summary",
            sortOrder: 0,
            createdAtUtcMs: nowMs,
            updatedAtUtcMs: nowMs,
          })
          .run();
      }

      globalPerson += 1;
    }

    /** Home-level billing account */
    const homeAccountId = randomUUID();
    db.insert(accounts)
      .values({
        id: homeAccountId,
        accountType: "home",
        residentId: null,
        homeId: h.id,
        currencyCode: h.currency,
        createdAtUtcMs: t0,
        updatedAtUtcMs: t0,
      })
      .run();

    /** Operational expenses on home account */
    const expenseMemo = ["Laundry contractor", "Fire panel service", "Lift certification", "Catering overflow"];
    for (let e = 0; e < 8; e++) {
      const tid = randomUUID();
      const posted = t0 + 3_600_000 * e;
      db.insert(billingTransactions)
        .values({
          id: tid,
          accountId: homeAccountId,
          accountType: "home",
          txnType: "charge",
          amountMinor: 120_00 + e * 25_00,
          sourceKind: "seed_home_expense",
          sourceId: `${h.id}-exp-${e}`,
          memo: expenseMemo[e % expenseMemo.length],
          recordedByUserId: userIdAdmin,
          postedAtUtcMs: posted,
        })
        .run();
    }

    homeAccountByHomeId.set(h.id, homeAccountId);
  }

  /** Resident ledger activity — monthly-style charges + payments for active residents */
  const actives = residentRows.filter((r) => r.status === "active");
  const nextInvSuffixByHome = new Map<string, number>();
  for (let i = 0; i < actives.length; i++) {
    const r = actives[i];
    const months = ["2025-11", "2025-12", "2026-01", "2026-02", "2026-03"];
    const home = HOME_DEFS.find((h) => h.id === r.homeId)!;
    const wardRate = home.wards.find((w) => w.id === r.wardId)!.monthlyRateMinor;

    for (const bm of months) {
      const chargeTxn = randomUUID();
      db.insert(billingTransactions)
        .values({
          id: chargeTxn,
          accountId: r.accountId,
          accountType: "resident",
          txnType: "charge",
          amountMinor: wardRate,
          sourceKind: "invoice_monthly_fee",
          sourceId: `${r.accountId}:${bm}`,
          memo: `Residential care — ${bm}`,
          recordedByUserId: userIdAdmin,
          postedAtUtcMs: t0 + i * 1000 + months.indexOf(bm) * 500_000,
        })
        .run();

      /** Optional matching draft/finalized style invoice rows for subset */
      if (i % 14 === 0 && bm === "2026-03") {
        const invId = randomUUID();
        const nextSuf = (nextInvSuffixByHome.get(r.homeId) ?? 0) + 1;
        nextInvSuffixByHome.set(r.homeId, nextSuf);
        const invNoSuffix = String(nextSuf).padStart(5, "0");
        db.insert(invoices)
          .values({
            id: invId,
            accountId: r.accountId,
            homeId: r.homeId,
            invNo: `INV-${invNoSuffix}`,
            purchaseOrderId: null,
            status: "finalized",
            issuedOn: "2026-03-31",
            totalMinorSnapshot: wardRate + 45_00,
            createdAtUtcMs: t0,
            updatedAtUtcMs: t0,
          })
          .run();
        const li1 = randomUUID();
        const li2 = randomUUID();
        db.insert(invoiceLineItems)
          .values([
            {
              id: li1,
              invoiceId: invId,
              category: "monthly_fee",
              description: `Monthly care fee (${bm})`,
              amountMinor: wardRate,
              serviceMonth: bm,
              quantity: 1,
              createdAtUtcMs: t0,
              updatedAtUtcMs: t0,
            },
            {
              id: li2,
              invoiceId: invId,
              category: "supplies",
              description: "Incidentals — toiletries bundle",
              amountMinor: 45_00,
              serviceMonth: null,
              quantity: 1,
              createdAtUtcMs: t0,
              updatedAtUtcMs: t0,
            },
          ])
          .run();
        /** Standalone charge for supplies line (monthly fees already posted above) */
        db.insert(billingTransactions)
          .values({
            id: randomUUID(),
            accountId: r.accountId,
            accountType: "resident",
            txnType: "charge",
            amountMinor: 45_00,
            sourceKind: "invoice_line_item",
            sourceId: li2,
            memo: "Incidentals — toiletries bundle",
            recordedByUserId: userIdAdmin,
            postedAtUtcMs: t0 + 400_000,
          })
          .run();
      }
    }

    /** Partial payments — most residents paid something */
    if (i % 7 !== 0) {
      const payId = randomUUID();
      const legId = randomUUID();
      const amountMinor = Math.min(
        wardRate * 3,
        Math.floor(wardRate * 2.5 * (0.6 + (i % 5) * 0.08)),
      );
      db.insert(billingTransactions)
        .values({
          id: legId,
          accountId: r.accountId,
          accountType: "resident",
          txnType: "payment",
          amountMinor: -amountMinor,
          sourceKind: "payment",
          sourceId: payId,
          memo: i % 2 === 0 ? "Batch receipt — families portal" : null,
          recordedByUserId: userIdAdmin,
          postedAtUtcMs: t0 + i * 900_000 + 50_000,
        })
        .run();
      db.insert(billingPayments)
        .values({
          id: payId,
          accountId: r.accountId,
          amountMinor,
          receivedOn: calendarDateIsoToUtcMs(
            i % 3 === 0 ? "2026-03-15" : "2026-04-02",
          ),
          method: i % 4 === 0 ? "bank_transfer" : "direct_debit",
          externalReference:
            i % 4 === 0 ? `REF-${String(i).padStart(6, "0")}` : null,
          notes: null,
          recordedByUserId: userIdAdmin,
          ledgerTransactionId: legId,
          updatedAtUtcMs: t0 + i * 900_000 + 50_000,
        })
        .run();
    }
  }

  /** Home-account invoices (ops) + ledger charges + payments */
  for (let hi = 0; hi < HOME_DEFS.length; hi++) {
    const h = HOME_DEFS[hi];
    const homeAccountId = homeAccountByHomeId.get(h.id)!;
    const bumpInvNo = () => {
      const n = (nextInvSuffixByHome.get(h.id) ?? 0) + 1;
      nextInvSuffixByHome.set(h.id, n);
      return `INV-${String(n).padStart(5, "0")}`;
    };

    const ts1 = t0 + 11_800_000 + hi * 113_000;
    const inv1 = randomUUID();
    const line1a = randomUUID();
    const line1b = randomUUID();
    const line1c = randomUUID();
    const amt1a = 418_000 + hi * 14_000;
    const amt1b = 263_500 + hi * 9000;
    const amt1c = 91_250 + hi * 3500;
    const total1 = amt1a + amt1b + amt1c;

    db.insert(invoices)
      .values({
        id: inv1,
        accountId: homeAccountId,
        homeId: h.id,
        invNo: bumpInvNo(),
        purchaseOrderId: null,
        status: "finalized",
        issuedOn: "2026-03-22",
        totalMinorSnapshot: total1,
        createdAtUtcMs: ts1,
        updatedAtUtcMs: ts1,
      })
      .run();

    db.insert(invoiceLineItems)
      .values([
        {
          id: line1a,
          invoiceId: inv1,
          category: "utilities",
          description: "Electricity — metering & line charges",
          amountMinor: amt1a,
          serviceMonth: null,
          quantity: 1,
          createdAtUtcMs: ts1,
          updatedAtUtcMs: ts1,
        },
        {
          id: line1b,
          invoiceId: inv1,
          category: "services",
          description: "Water & wastewater — council",
          amountMinor: amt1b,
          serviceMonth: null,
          quantity: 1,
          createdAtUtcMs: ts1,
          updatedAtUtcMs: ts1,
        },
        {
          id: line1c,
          invoiceId: inv1,
          category: "operations",
          description: "Security monitoring — quarterly allocation",
          amountMinor: amt1c,
          serviceMonth: null,
          quantity: 1,
          createdAtUtcMs: ts1,
          updatedAtUtcMs: ts1,
        },
      ])
      .run();

    for (const row of [
      {
        id: line1a,
        amount: amt1a,
        memo: "Electricity — metering & line charges",
      },
      {
        id: line1b,
        amount: amt1b,
        memo: "Water & wastewater — council",
      },
      {
        id: line1c,
        amount: amt1c,
        memo: "Security monitoring — quarterly allocation",
      },
    ]) {
      db.insert(billingTransactions)
        .values({
          id: randomUUID(),
          accountId: homeAccountId,
          accountType: "home",
          txnType: "charge",
          amountMinor: row.amount,
          sourceKind: "invoice_line_item",
          sourceId: row.id,
          memo: row.memo,
          recordedByUserId: userIdAdmin,
          postedAtUtcMs: ts1,
        })
        .run();
    }

    const ts2 = t0 + 10_100_000 + hi * 113_000;
    const inv2 = randomUUID();
    const line2a = randomUUID();
    const line2b = randomUUID();
    const amt2a = 336_000 + hi * 22_000;
    const amt2b = 127_400 + hi * 8000;
    const total2 = amt2a + amt2b;

    db.insert(invoices)
      .values({
        id: inv2,
        accountId: homeAccountId,
        homeId: h.id,
        invNo: bumpInvNo(),
        purchaseOrderId: null,
        status: "finalized",
        issuedOn: "2026-02-14",
        totalMinorSnapshot: total2,
        createdAtUtcMs: ts2,
        updatedAtUtcMs: ts2,
      })
      .run();

    db.insert(invoiceLineItems)
      .values([
        {
          id: line2a,
          invoiceId: inv2,
          category: "maintenance",
          description: "HVAC service contract — February",
          amountMinor: amt2a,
          serviceMonth: null,
          quantity: 1,
          createdAtUtcMs: ts2,
          updatedAtUtcMs: ts2,
        },
        {
          id: line2b,
          invoiceId: inv2,
          category: "catering",
          description: "Resident meals — overflow tray order",
          amountMinor: amt2b,
          serviceMonth: null,
          quantity: 1,
          createdAtUtcMs: ts2,
          updatedAtUtcMs: ts2,
        },
      ])
      .run();

    for (const row of [
      {
        id: line2a,
        amount: amt2a,
        memo: "HVAC service contract — February",
      },
      {
        id: line2b,
        amount: amt2b,
        memo: "Resident meals — overflow tray order",
      },
    ]) {
      db.insert(billingTransactions)
        .values({
          id: randomUUID(),
          accountId: homeAccountId,
          accountType: "home",
          txnType: "charge",
          amountMinor: row.amount,
          sourceKind: "invoice_line_item",
          sourceId: row.id,
          memo: row.memo,
          recordedByUserId: userIdAdmin,
          postedAtUtcMs: ts2,
        })
        .run();
    }

    const pay1Id = randomUUID();
    const pay1Leg = randomUUID();
    const pay1Amt = 280_000 + hi * 25_000;
    const tsP1 = ts1 + 86400_000;
    db.insert(billingTransactions)
      .values({
        id: pay1Leg,
        accountId: homeAccountId,
        accountType: "home",
        txnType: "payment",
        amountMinor: -pay1Amt,
        sourceKind: "payment",
        sourceId: pay1Id,
        memo: "HO remittance — facility operations",
        recordedByUserId: userIdAdmin,
        postedAtUtcMs: tsP1,
      })
      .run();
    db.insert(billingPayments)
      .values({
        id: pay1Id,
        accountId: homeAccountId,
        amountMinor: pay1Amt,
        receivedOn: calendarDateIsoToUtcMs("2026-03-29"),
        method: "bank_transfer",
        externalReference: `HOME-OPS-${String(hi + 1).padStart(3, "0")}`,
        notes: null,
        recordedByUserId: userIdAdmin,
        ledgerTransactionId: pay1Leg,
        updatedAtUtcMs: tsP1,
      })
      .run();

    const pay2Id = randomUUID();
    const pay2Leg = randomUUID();
    const pay2Amt = 195_000 + hi * 12_000;
    const tsP2 = ts2 + 43200_000;
    db.insert(billingTransactions)
      .values({
        id: pay2Leg,
        accountId: homeAccountId,
        accountType: "home",
        txnType: "payment",
        amountMinor: -pay2Amt,
        sourceKind: "payment",
        sourceId: pay2Id,
        memo: "Part-pay — maintenance & utilities",
        recordedByUserId: userIdAdmin,
        postedAtUtcMs: tsP2,
      })
      .run();
    db.insert(billingPayments)
      .values({
        id: pay2Id,
        accountId: homeAccountId,
        amountMinor: pay2Amt,
        receivedOn: calendarDateIsoToUtcMs("2026-02-21"),
        method: hi % 2 === 0 ? "cheque" : "bank_transfer",
        externalReference: hi % 2 === 0 ? null : `HOME-P2-${String(hi + 1).padStart(3, "0")}`,
        notes: null,
        recordedByUserId: userIdAdmin,
        ledgerTransactionId: pay2Leg,
        updatedAtUtcMs: tsP2,
      })
      .run();
  }

  /** Medication rows for first N active residents per home */
  const byHome = new Map<string, ResidentRow[]>();
  for (const r of actives) {
    const list = byHome.get(r.homeId) ?? [];
    list.push(r);
    byHome.set(r.homeId, list);
  }
  for (const [hid, list] of byHome) {
    const items = homeItems.get(hid) ?? [];
    const tabletItem = items.find((x) => x.name.startsWith("Paracetamol"))!;
    const capItem = items.find((x) => x.name.startsWith("Amoxicillin"))!;
    const top = list.slice(0, 10);
    for (let ri = 0; ri < top.length; ri++) {
      const res = top[ri];
      const nowMs = t0 + ri * 1000;
      db.insert(residentMedications)
        .values([
          {
            id: randomUUID(),
            residentId: res.id,
            itemId: tabletItem.id,
            quantityPerServing: 2,
            servingsPerDay: 4,
            directions: "With food if upset stomach",
            prn: false,
            scheduledSlots: JSON.stringify(["morning", "afternoon", "evening", "night"]),
            status: "active",
            sortOrder: 0,
            createdAtUtcMs: nowMs,
            updatedAtUtcMs: nowMs,
          },
          {
            id: randomUUID(),
            residentId: res.id,
            itemId: capItem.id,
            quantityPerServing: 1,
            servingsPerDay: 3,
            directions: "Complete full course unless stopped by GP",
            prn: false,
            scheduledSlots: JSON.stringify(["morning", "afternoon", "evening"]),
            status: "active",
            sortOrder: 1,
            createdAtUtcMs: nowMs,
            updatedAtUtcMs: nowMs,
          },
        ])
        .run();
    }
  }

  /** Stock receipts + balances for HOME-level inventory */
  for (const h of HOME_DEFS) {
    const items = homeItems.get(h.id)!;
    for (let j = 0; j < Math.min(6, items.length); j++) {
      const it = items[j];
      const qty = j % 2 === 0 ? 120 : 18.5;
      const balId = randomUUID();
      const txId = randomUUID();
      const ts = t0 + j * 50_000;
      db.insert(inventoryBalances)
        .values({
          id: balId,
          ownerType: "HOME",
          ownerId: h.id,
          itemId: it.id,
          quantityBaseUnits: qty,
          createdAtUtcMs: ts,
          updatedAtUtcMs: ts,
        })
        .run();
      db.insert(inventoryTransactions)
        .values({
          id: txId,
          ownerType: "HOME",
          ownerId: h.id,
          itemId: it.id,
          transactionType: "RECEIVE",
          transferId: null,
          quantityDeltaBaseUnits: qty,
          sourceType: "SEED_SCRIPT",
          sourceId: randomUUID(),
          note: "Opening stock from seed",
          actorUserId: userIdAdmin,
          createdAtUtcMs: ts,
        })
        .run();
    }
  }

  /** Purchase orders — mix of lifecycle states (PO numbers are per home) */
  for (let hi = 0; hi < HOME_DEFS.length; hi++) {
    const h = HOME_DEFS[hi];
    const supplierId = SUPPLIER_DEFS[hi % SUPPLIER_DEFS.length].id;
    const poId = randomUUID();
    const poNum = "PO-00001";
    const created = t0 + (hi + 1) * 120_000;
    const items = homeItems.get(h.id)!;
    const status =
      hi % 3 === 0 ? "SENT" : hi % 3 === 1 ? "APPROVED" : "CLOSED";

    db.insert(homePurchaseOrders)
      .values({
        id: poId,
        homeId: h.id,
        poNumber: poNum,
        supplierId,
        status,
        currencyCode: h.currency,
        approvedAtUtcMs: created + 3_600_000,
        approvedByUserId: userIdAdmin,
        sentAtUtcMs: status === "SENT" || status === "CLOSED" ? created + 7_200_000 : null,
        sentByUserId:
          status === "SENT" || status === "CLOSED" ? userIdAdmin : null,
        createdByUserId: userIdAdmin,
        createdAtUtcMs: created,
        updatedAtUtcMs: created + 8_000_000,
      })
      .run();

    const line1Id = randomUUID();
    const line2Id = randomUUID();
    const line1Qty = 200;
    const line2Qty = 24;
    db.insert(homePurchaseOrderLines)
      .values([
        {
          id: line1Id,
          purchaseOrderId: poId,
          itemId: items[0].id,
          ownerType: "HOME",
          ownerId: h.id,
          purchaseUnitType: "carton",
          quantityOrderedBaseUnits: line1Qty,
          quantityReceivedBaseUnits: status === "CLOSED" ? line1Qty : 0,
          status: status === "CLOSED" ? "CLOSED" : "OPEN",
          createdAtUtcMs: created,
          updatedAtUtcMs: created + 8_000_000,
        },
        {
          id: line2Id,
          purchaseOrderId: poId,
          itemId: items[4].id,
          ownerType: "HOME",
          ownerId: h.id,
          purchaseUnitType: "case",
          quantityOrderedBaseUnits: line2Qty,
          quantityReceivedBaseUnits: status === "CLOSED" ? line2Qty : 0,
          status: status === "CLOSED" ? "CLOSED" : "OPEN",
          createdAtUtcMs: created,
          updatedAtUtcMs: created + 8_000_000,
        },
      ])
      .run();

    if (status === "CLOSED") {
      const recvTs = created + 9_000_000;
      db.insert(homePurchaseOrderReceiveEvents)
        .values([
          {
            id: randomUUID(),
            purchaseOrderId: poId,
            purchaseOrderLineId: line1Id,
            qtyReceivedEvent: line1Qty,
            baseUnitsReceivedEvent: line1Qty,
            unitPriceCents: 8,
            currencyCode: h.currency,
            receivedAtUtcMs: recvTs,
            note: "Full line receipt",
            createdByUserId: userIdAdmin,
            createdAtUtcMs: recvTs,
          },
          {
            id: randomUUID(),
            purchaseOrderId: poId,
            purchaseOrderLineId: line2Id,
            qtyReceivedEvent: line2Qty,
            baseUnitsReceivedEvent: line2Qty,
            unitPriceCents: 185,
            currencyCode: h.currency,
            receivedAtUtcMs: recvTs + 60_000,
            note: null,
            createdByUserId: userIdAdmin,
            createdAtUtcMs: recvTs + 60_000,
          },
        ])
        .run();
    }
  }

  /** Per-home PO / invoice number sequences */
  for (const h of HOME_DEFS) {
    db.insert(homePoNumberSeq)
      .values({
        homeId: h.id,
        lastSuffix: 1,
        updatedAtUtcMs: t0,
      })
      .run();

    const invRows = db
      .select({ invNo: invoices.invNo })
      .from(invoices)
      .where(eq(invoices.homeId, h.id))
      .all();
    let maxSuf = 0;
    for (const row of invRows) {
      const m = row.invNo && /^INV-(\d+)$/.exec(row.invNo);
      if (m) maxSuf = Math.max(maxSuf, Number.parseInt(m[1], 10));
    }
    db.insert(homeInvNumberSeq)
      .values({
        homeId: h.id,
        lastSuffix: maxSuf,
        updatedAtUtcMs: t0,
      })
      .run();
  }

  /** Manual tasks */
  const priorities = ["normal", "urgent"] as const;
  const taskStatuses = ["open", "completed"] as const;
  let ti = 0;
  for (const h of HOME_DEFS) {
    for (let x = 0; x < 6; x++) {
      const done = x % 4 === 0;
      const ts = t0 + ti++ * 33_000;
      db.insert(tasks)
        .values({
          id: randomUUID(),
          homeId: h.id,
          title: done
            ? `File signed care agreement — batch ${x}`
            : `Schedule fire drill walkthrough — ${h.name.slice(0, 18)}`,
          notes: done ? "Completed and archived in shared drive." : null,
          dueDate: isoFromYmd(2026, 5, 10 + x),
          priority: x % 3 === 0 ? priorities[1] : priorities[0],
          status: done ? taskStatuses[1] : taskStatuses[0],
          createdByUserId: userIdAdmin,
          completedAtUtcMs: done ? ts + 3600_000 : null,
          createdAtUtcMs: ts,
          updatedAtUtcMs: done ? ts + 3600_000 : ts,
        })
        .run();
    }
  }

  /** Enquiry leads */
  const leadStatuses = ["new", "contacted", "closed", "cancelled"] as const;
  let li = 0;
  for (const h of HOME_DEFS) {
    for (let j = 0; j < 8; j++) {
      const web = j % 2 === 0;
      const ts = t0 + li++ * 99_000;
      db.insert(homeInterestLeads)
        .values({
          id: randomUUID(),
          homeId: h.id,
          homeNameSnapshot: h.name,
          homeAddressSnapshot: h.address,
          contactName: `${GIVEN[(j + li) % GIVEN.length]} ${FAMILY[(j + li + 2) % FAMILY.length]}`,
          phone: `+64 21 ${String(300 + li).padStart(3, "0")} ${String(1200 + li).slice(-4)}`,
          email: web ? `enquiry${li}@example.com` : null,
          note:
            j % 3 === 0
              ? "Asked about memory care wait times."
              : "Looking for respite — 2 weeks.",
          source: web ? "web" : "admin",
          consentAccepted: web,
          status: leadStatuses[li % leadStatuses.length],
          createdByUserId: web ? null : userIdAdmin,
          createdAtUtcMs: ts,
          updatedAtUtcMs: ts,
        })
        .run();
    }
  }

  db.insert(authEvents)
    .values([
      {
        id: randomUUID(),
        userId: userIdAdmin,
        email: "admin@example.com",
        eventType: "sign_in",
        occurredAtUtcMs: t0 + 10_000,
      },
      {
        id: randomUUID(),
        userId: careUserIds[0],
        email: `care.01@example.com`,
        eventType: "sign_in",
        occurredAtUtcMs: t0 + 20_000,
      },
    ])
    .run();

  console.log(
    `Seed complete (${RESET ? "after reset" : "append"}). Login: admin@example.com / admin`,
  );
  console.log(`Care staff share the same password for demo logins (care.01@example.com …).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
