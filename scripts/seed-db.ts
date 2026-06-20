/**
 * Seed core demo data: homes, wards, residents, staff, users, medicine catalog,
 * suppliers, resident clinical records, and tasks.
 *
 * Usage (from `web/`):
 *   npm run db:seed              — append seed rows; exits if admin@example.com exists
 *   npm run db:seed -- --reset   — wipe app tables, then seed
 *
 * Requires schema pushed first (`npm run db:push` or `npm run db:reset`).
 */
import Database from "better-sqlite3";
import { and, eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { closeDbConnection, getDb } from "@/db/client";
import {
  accounts,
  homes,
  inventoryItemCategories,
  inventoryItems,
  inventorySuppliers,
  residentAllergies,
  residentConditions,
  residentMedications,
  residents,
  staffSalaries,
  tasks,
  users,
  wards,
} from "@/db/schema";
import { seedDefaultInventoryCatalogCategoriesForHome } from "@/lib/inventory/defaultCatalogCategories";
import { hashPassword } from "@/lib/iam/password";

const DB_PATH =
  process.env.DATABASE_PATH ??
  path.join(process.cwd(), "data", "village60.sqlite");

const RESET = process.argv.includes("--reset");
const ADMIN_EMAIL = "admin@example.com";
const ADMIN_PASSWORD = "admin";

const TABLES_TO_CLEAR = [
  "salary_remittances",
  "salary_accruals",
  "staff_salaries",
  "medication_administrations",
  "resident_medications",
  "resident_allergies",
  "resident_conditions",
  "resident_departure_details",
  "billing_payments",
  "billing_transactions",
  "invoice_line_items",
  "invoices",
  "accounts",
  "residents",
  "inventory_transactions",
  "inventory_balances",
  "inventory_items",
  "inventory_item_categories",
  "home_purchase_order_receive_events",
  "home_purchase_order_lines",
  "home_purchase_orders",
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
  "app_settings",
] as const;

const MEDICINE_ITEMS = [
  {
    name: "Paracetamol tablets 500mg",
    baseUnit: "tablet",
    unitClass: "countable" as const,
  },
  {
    name: "Ibuprofen tablets 200mg",
    baseUnit: "tablet",
    unitClass: "countable" as const,
  },
  {
    name: "Amoxicillin capsules 500mg",
    baseUnit: "capsule",
    unitClass: "countable" as const,
  },
  {
    name: "Hydrocortisone cream 1%",
    baseUnit: "tube",
    unitClass: "countable" as const,
  },
  {
    name: "Sterile saline 0.9% 500ml",
    baseUnit: "bottle",
    unitClass: "countable" as const,
  },
  {
    name: "Metformin tablets 500mg",
    baseUnit: "tablet",
    unitClass: "countable" as const,
  },
] as const;

const SUPPLIER_DEFS = [
  {
    id: "seed-sup-pharmacy",
    name: "LankaCare Pharmacy Wholesale",
    address: "45 Hospital Road, Colombo 05",
    phone: "+94 11 555 0199",
    email: "orders@lankacare.example",
  },
  {
    id: "seed-sup-groceries",
    name: "Island Fresh Foods",
    address: "Warehouse 7, Peliyagoda Industrial Zone",
    phone: "+94 11 555 0288",
    email: "accounts@islandfresh.example",
  },
  {
    id: "seed-sup-linen",
    name: "Ceylon Linen Services",
    address: "12 Free Trade Zone Road, Katunayake",
    phone: "+94 11 555 0303",
    email: "sales@ceylonlinen.example",
  },
  {
    id: "seed-sup-equipment",
    name: "MedSupply Lanka",
    address: "PO Box 120, Nugegoda",
    phone: "+94 11 555 0337",
    email: "orders@medsupply.example",
  },
  {
    id: "seed-sup-maintenance",
    name: "HomeCare Maintenance Co.",
    address: "88 Baseline Road, Colombo 09",
    phone: "+94 77 555 0400",
    email: "jobs@homecaremaint.example",
  },
] as const;

const ADMIN_USER_ID = "seed-user-admin";

const RESIDENT_CONDITIONS: readonly (readonly string[])[] = [
  ["Hypertension", "Osteoarthritis"],
  ["Type 2 diabetes"],
  ["Dementia", "Hypertension"],
  ["Chronic obstructive pulmonary disease"],
  ["Heart failure", "Osteoarthritis"],
  ["Hypertension"],
  ["Stroke — residual weakness", "Hypertension"],
  ["Type 2 diabetes", "Chronic kidney disease"],
];

const RESIDENT_ALLERGIES: readonly ({ allergen: string; notes: string | null } | null)[] = [
  { allergen: "Penicillin", notes: "Documented in GP summary" },
  null,
  { allergen: "Shellfish", notes: "Mild rash reported" },
  { allergen: "Aspirin", notes: null },
  null,
  { allergen: "Latex", notes: "Use nitrile gloves only" },
  null,
  { allergen: "Ibuprofen", notes: "GI upset" },
];

type MedPreset = {
  itemName: (typeof MEDICINE_ITEMS)[number]["name"];
  quantityPerServing: number;
  servingsPerDay: number;
  directions: string;
  prn: boolean;
  scheduledSlots: string[] | null;
};

const RESIDENT_MEDICATIONS: readonly MedPreset[][] = [
  [
    {
      itemName: "Paracetamol tablets 500mg",
      quantityPerServing: 2,
      servingsPerDay: 4,
      directions: "With food if upset stomach",
      prn: false,
      scheduledSlots: ["morning", "afternoon", "evening", "night"],
    },
    {
      itemName: "Metformin tablets 500mg",
      quantityPerServing: 1,
      servingsPerDay: 2,
      directions: "Take with meals",
      prn: false,
      scheduledSlots: ["morning", "evening"],
    },
  ],
  [
    {
      itemName: "Paracetamol tablets 500mg",
      quantityPerServing: 1,
      servingsPerDay: 3,
      directions: "For mild pain",
      prn: false,
      scheduledSlots: ["morning", "afternoon", "evening"],
    },
  ],
  [
    {
      itemName: "Amoxicillin capsules 500mg",
      quantityPerServing: 1,
      servingsPerDay: 3,
      directions: "Complete full course unless stopped by GP",
      prn: false,
      scheduledSlots: ["morning", "afternoon", "evening"],
    },
    {
      itemName: "Ibuprofen tablets 200mg",
      quantityPerServing: 1,
      servingsPerDay: 0,
      directions: "For joint pain — max 3 per day",
      prn: true,
      scheduledSlots: null,
    },
  ],
  [
    {
      itemName: "Metformin tablets 500mg",
      quantityPerServing: 1,
      servingsPerDay: 2,
      directions: "Take with breakfast and dinner",
      prn: false,
      scheduledSlots: ["morning", "evening"],
    },
  ],
  [
    {
      itemName: "Paracetamol tablets 500mg",
      quantityPerServing: 2,
      servingsPerDay: 4,
      directions: "Regular analgesia",
      prn: false,
      scheduledSlots: ["morning", "afternoon", "evening", "night"],
    },
    {
      itemName: "Sterile saline 0.9% 500ml",
      quantityPerServing: 1,
      servingsPerDay: 2,
      directions: "Nebuliser diluent as directed",
      prn: false,
      scheduledSlots: ["morning", "evening"],
    },
  ],
  [
    {
      itemName: "Hydrocortisone cream 1%",
      quantityPerServing: 1,
      servingsPerDay: 2,
      directions: "Apply thin layer to affected skin",
      prn: false,
      scheduledSlots: ["morning", "evening"],
    },
  ],
  [
    {
      itemName: "Paracetamol tablets 500mg",
      quantityPerServing: 1,
      servingsPerDay: 0,
      directions: "For headache or pain",
      prn: true,
      scheduledSlots: null,
    },
    {
      itemName: "Ibuprofen tablets 200mg",
      quantityPerServing: 1,
      servingsPerDay: 3,
      directions: "Take after food",
      prn: false,
      scheduledSlots: ["morning", "afternoon", "evening"],
    },
  ],
  [
    {
      itemName: "Metformin tablets 500mg",
      quantityPerServing: 1,
      servingsPerDay: 2,
      directions: "With meals",
      prn: false,
      scheduledSlots: ["morning", "evening"],
    },
    {
      itemName: "Amoxicillin capsules 500mg",
      quantityPerServing: 1,
      servingsPerDay: 3,
      directions: "Antibiotic course — do not skip doses",
      prn: false,
      scheduledSlots: ["morning", "afternoon", "evening"],
    },
  ],
];

const TASK_DEFS = [
  {
    title: "Schedule fire drill walkthrough",
    notes: null,
    dueDate: "2026-06-25",
    priority: "urgent" as const,
    status: "open" as const,
  },
  {
    title: "Review medication fridge temperature log",
    notes: "Check weekend readings against policy.",
    dueDate: "2026-06-22",
    priority: "normal" as const,
    status: "open" as const,
  },
  {
    title: "File signed care agreement — batch 1",
    notes: "Completed and archived in shared drive.",
    dueDate: "2026-06-10",
    priority: "normal" as const,
    status: "completed" as const,
  },
  {
    title: "Confirm linen delivery with supplier",
    notes: null,
    dueDate: "2026-06-28",
    priority: "normal" as const,
    status: "open" as const,
  },
  {
    title: "Replace hallway night-light batteries",
    notes: "Ward B corridor — two units dim.",
    dueDate: "2026-06-20",
    priority: "urgent" as const,
    status: "open" as const,
  },
  {
    title: "Update emergency contact list printout",
    notes: "Printed copies filed at nurses' station.",
    dueDate: "2026-06-05",
    priority: "normal" as const,
    status: "completed" as const,
  },
] as const;

type HomeDef = {
  id: string;
  name: string;
  address: string;
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
    id: "seed-home-sunrise",
    name: "Sunrise Elder Care",
    address: "42 Lake Road, Colombo 03",
    wards: [
      {
        id: "seed-ward-sunrise-general",
        label: "General Care",
        sortOrder: 1,
        bedCount: 24,
        monthlyRateMinor: 65_000_00,
      },
      {
        id: "seed-ward-sunrise-memory",
        label: "Memory Support",
        sortOrder: 2,
        bedCount: 16,
        monthlyRateMinor: 78_000_00,
      },
    ],
  },
  {
    id: "seed-home-greenvalley",
    name: "Green Valley Home",
    address: "18 Temple Street, Kandy",
    wards: [
      {
        id: "seed-ward-gv-longterm",
        label: "Long-term Care",
        sortOrder: 1,
        bedCount: 30,
        monthlyRateMinor: 58_000_00,
      },
      {
        id: "seed-ward-gv-respiratory",
        label: "Respiratory",
        sortOrder: 2,
        bedCount: 10,
        monthlyRateMinor: 82_000_00,
      },
    ],
  },
  {
    id: "seed-home-oceanview",
    name: "Ocean View Care Centre",
    address: "7 Galle Road, Matara",
    wards: [
      {
        id: "seed-ward-ov-main",
        label: "Main Care",
        sortOrder: 1,
        bedCount: 28,
        monthlyRateMinor: 62_000_00,
      },
      {
        id: "seed-ward-ov-palliative",
        label: "Palliative Care",
        sortOrder: 2,
        bedCount: 12,
        monthlyRateMinor: 88_000_00,
      },
      {
        id: "seed-ward-ov-rehab",
        label: "Rehabilitation",
        sortOrder: 3,
        bedCount: 16,
        monthlyRateMinor: 70_000_00,
      },
      {
        id: "seed-ward-ov-memory",
        label: "Secure Memory",
        sortOrder: 4,
        bedCount: 14,
        monthlyRateMinor: 80_000_00,
      },
      {
        id: "seed-ward-ov-respite",
        label: "Respite",
        sortOrder: 5,
        bedCount: 8,
        monthlyRateMinor: 55_000_00,
      },
    ],
  },
  {
    id: "seed-home-hilltop",
    name: "Hilltop Retirement Village",
    address: "3 Gregory Lake Road, Nuwara Eliya",
    wards: [
      {
        id: "seed-ward-ht-assisted",
        label: "Assisted Living",
        sortOrder: 1,
        bedCount: 20,
        monthlyRateMinor: 60_000_00,
      },
      {
        id: "seed-ward-ht-skilled",
        label: "Skilled Nursing",
        sortOrder: 2,
        bedCount: 18,
        monthlyRateMinor: 72_000_00,
      },
      {
        id: "seed-ward-ht-dementia",
        label: "Dementia Care",
        sortOrder: 3,
        bedCount: 12,
        monthlyRateMinor: 85_000_00,
      },
      {
        id: "seed-ward-ht-shortstay",
        label: "Short Stay",
        sortOrder: 4,
        bedCount: 6,
        monthlyRateMinor: 52_000_00,
      },
    ],
  },
];

const RESIDENT_DEFS = [
  { homeIdx: 0, wardIdx: 0, fullName: "Nimal Perera", dob: "1942-03-14", room: "201" },
  { homeIdx: 0, wardIdx: 0, fullName: "Kamala Fernando", dob: "1938-07-22", room: "203" },
  { homeIdx: 0, wardIdx: 1, fullName: "Sunil Jayawardena", dob: "1945-11-05", room: "301" },
  { homeIdx: 0, wardIdx: 1, fullName: "Malini Silva", dob: "1940-01-18", room: "305" },
  { homeIdx: 1, wardIdx: 0, fullName: "Rohan Wickramasinghe", dob: "1939-09-30", room: "112" },
  { homeIdx: 1, wardIdx: 0, fullName: "Anoma Rajapaksa", dob: "1943-06-12", room: "114" },
  { homeIdx: 1, wardIdx: 1, fullName: "Priya Bandara", dob: "1941-12-08", room: "401" },
  { homeIdx: 1, wardIdx: 1, fullName: "Lasantha Mendis", dob: "1937-04-25", room: "402" },
  // Ocean View — 5 wards, 2–3 residents each
  { homeIdx: 2, wardIdx: 0, fullName: "Dilani Gunasekara", dob: "1944-02-11", room: "101" },
  { homeIdx: 2, wardIdx: 0, fullName: "Ajith Wijesinghe", dob: "1936-08-19", room: "103" },
  { homeIdx: 2, wardIdx: 0, fullName: "Sandya Ekanayake", dob: "1940-05-27", room: "105" },
  { homeIdx: 2, wardIdx: 1, fullName: "Bandula Ratnayake", dob: "1935-11-03", room: "201" },
  { homeIdx: 2, wardIdx: 1, fullName: "Chitra Abeysekera", dob: "1938-12-14", room: "203" },
  { homeIdx: 2, wardIdx: 2, fullName: "Upul Dissanayake", dob: "1943-07-08", room: "301" },
  { homeIdx: 2, wardIdx: 2, fullName: "Nirosha Peiris", dob: "1946-01-22", room: "304" },
  { homeIdx: 2, wardIdx: 2, fullName: "Gamini Herath", dob: "1939-04-16", room: "306" },
  { homeIdx: 2, wardIdx: 3, fullName: "Lalith Senanayake", dob: "1942-09-30", room: "401" },
  { homeIdx: 2, wardIdx: 3, fullName: "Indira Weerasinghe", dob: "1945-03-05", room: "405" },
  { homeIdx: 2, wardIdx: 4, fullName: "Thilini Karunaratne", dob: "1947-06-18", room: "501" },
  { homeIdx: 2, wardIdx: 4, fullName: "Mahesh Ranasinghe", dob: "1941-10-09", room: "502" },
  // Hilltop — 4 wards, 2–3 residents each
  { homeIdx: 3, wardIdx: 0, fullName: "Harsha de Silva", dob: "1943-08-24", room: "A12" },
  { homeIdx: 3, wardIdx: 0, fullName: "Kumari Jayasinghe", dob: "1937-02-07", room: "A14" },
  { homeIdx: 3, wardIdx: 0, fullName: "Ravi Alwis", dob: "1940-11-29", room: "A16" },
  { homeIdx: 3, wardIdx: 1, fullName: "Shanthi Wijeratne", dob: "1936-05-13", room: "B08" },
  { homeIdx: 3, wardIdx: 1, fullName: "Nishantha Perera", dob: "1938-09-21", room: "B10" },
  { homeIdx: 3, wardIdx: 2, fullName: "Geetha Fonseka", dob: "1944-04-02", room: "C03" },
  { homeIdx: 3, wardIdx: 2, fullName: "Wasantha Goonetilleke", dob: "1935-12-26", room: "C05" },
  { homeIdx: 3, wardIdx: 3, fullName: "Dinesh Navaratne", dob: "1946-07-15", room: "D01" },
  { homeIdx: 3, wardIdx: 3, fullName: "Priyanka Munasinghe", dob: "1942-01-31", room: "D02" },
  { homeIdx: 3, wardIdx: 3, fullName: "Saman Kumara", dob: "1939-06-08", room: "D04" },
] as const;

const CARE_USERS = [
  {
    id: "seed-user-care-01",
    email: "care.01@example.com",
    displayName: "Nadeesha Perera",
    homeIdx: 0,
  },
  {
    id: "seed-user-care-02",
    email: "care.02@example.com",
    displayName: "Ruwan Silva",
    homeIdx: 0,
  },
  {
    id: "seed-user-care-03",
    email: "care.03@example.com",
    displayName: "Chathuri Kumari",
    homeIdx: 1,
  },
  {
    id: "seed-user-care-04",
    email: "care.04@example.com",
    displayName: "Tharindu Jayawardena",
    homeIdx: 2,
  },
  {
    id: "seed-user-care-05",
    email: "care.05@example.com",
    displayName: "Ishara Wickramasinghe",
    homeIdx: 3,
  },
] as const;

/** First care user assigned as nurse per home (by `homeIdx`). */
const PRIMARY_CARE_USER_BY_HOME = new Map<number, string>(
  CARE_USERS.map((u) => [u.homeIdx, u.id]),
);

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

function seedMedicineCatalogForHome(
  db: ReturnType<typeof getDb>,
  homeId: string,
  nowUtcMs: number,
): Map<string, string> {
  seedDefaultInventoryCatalogCategoriesForHome(db, homeId, nowUtcMs);

  const medicineCategory = db
    .select({ id: inventoryItemCategories.id })
    .from(inventoryItemCategories)
    .where(
      and(
        eq(inventoryItemCategories.homeId, homeId),
        eq(inventoryItemCategories.name, "Medicine"),
      ),
    )
    .get();

  if (!medicineCategory) {
    throw new Error(`Medicine category missing for home ${homeId}`);
  }

  const itemsByName = new Map<string, string>();
  for (const item of MEDICINE_ITEMS) {
    const id = randomUUID();
    db.insert(inventoryItems)
      .values({
        id,
        homeId,
        categoryId: medicineCategory.id,
        name: item.name,
        baseUnit: item.baseUnit,
        unitClass: item.unitClass,
        createdAtUtcMs: nowUtcMs,
        updatedAtUtcMs: nowUtcMs,
      })
      .run();
    itemsByName.set(item.name, id);
  }
  return itemsByName;
}

type SeededResident = {
  id: string;
  homeId: string;
  idx: number;
};

function seedResidentClinicalData(
  db: ReturnType<typeof getDb>,
  resident: SeededResident,
  medicineByName: Map<string, string>,
  nowUtcMs: number,
) {
  const conditions = RESIDENT_CONDITIONS[resident.idx % RESIDENT_CONDITIONS.length];
  for (let c = 0; c < conditions.length; c++) {
    db.insert(residentConditions)
      .values({
        id: randomUUID(),
        residentId: resident.id,
        label: conditions[c],
        sortOrder: c,
        createdAtUtcMs: nowUtcMs,
        updatedAtUtcMs: nowUtcMs,
      })
      .run();
  }

  const allergy = RESIDENT_ALLERGIES[resident.idx % RESIDENT_ALLERGIES.length];
  if (allergy) {
    db.insert(residentAllergies)
      .values({
        id: randomUUID(),
        residentId: resident.id,
        allergen: allergy.allergen,
        notes: allergy.notes,
        sortOrder: 0,
        createdAtUtcMs: nowUtcMs,
        updatedAtUtcMs: nowUtcMs,
      })
      .run();
  }

  const medPresets = RESIDENT_MEDICATIONS[resident.idx % RESIDENT_MEDICATIONS.length];
  for (let m = 0; m < medPresets.length; m++) {
    const preset = medPresets[m];
    const itemId = medicineByName.get(preset.itemName);
    if (!itemId) {
      throw new Error(`Medicine item not found for home ${resident.homeId}: ${preset.itemName}`);
    }
    db.insert(residentMedications)
      .values({
        id: randomUUID(),
        residentId: resident.id,
        itemId,
        quantityPerServing: preset.quantityPerServing,
        servingsPerDay: preset.prn ? null : preset.servingsPerDay,
        directions: preset.directions,
        prn: preset.prn,
        scheduledSlots: preset.scheduledSlots
          ? JSON.stringify(preset.scheduledSlots)
          : null,
        status: "active",
        sortOrder: m,
        createdAtUtcMs: nowUtcMs,
        updatedAtUtcMs: nowUtcMs,
      })
      .run();
  }
}

function seedTasksForHome(
  db: ReturnType<typeof getDb>,
  homeId: string,
  homeName: string,
  createdByUserId: string,
  baseUtcMs: number,
) {
  for (let i = 0; i < TASK_DEFS.length; i++) {
    const task = TASK_DEFS[i];
    const ts = baseUtcMs + i * 33_000;
    const completed = task.status === "completed";
    db.insert(tasks)
      .values({
        id: randomUUID(),
        homeId,
        title: completed ? task.title : `${task.title} — ${homeName.slice(0, 20)}`,
        notes: task.notes,
        dueDate: task.dueDate,
        priority: task.priority,
        status: task.status,
        createdByUserId,
        completedAtUtcMs: completed ? ts + 3600_000 : null,
        createdAtUtcMs: ts,
        updatedAtUtcMs: completed ? ts + 3600_000 : ts,
      })
      .run();
  }
}

async function main() {
  if (!RESET) {
    closeDbConnection();
    const probe = new Database(DB_PATH);
    try {
      const row = probe
        .prepare(`select 1 as ok from users where lower(email) = lower(?) limit 1`)
        .get(ADMIN_EMAIL) as { ok: number } | undefined;
      if (row) {
        console.error(
          `${ADMIN_EMAIL} already exists. Re-run with --reset to wipe app tables and re-seed, or use npm run db:reset for a full rebuild.`,
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

  const passwordHash = await hashPassword(ADMIN_PASSWORD);
  const t0 = Date.UTC(2026, 0, 15, 8, 0, 0, 0);
  const db = getDb();
  const medicineByHome = new Map<string, Map<string, string>>();
  const seededResidents: SeededResident[] = [];

  for (const s of SUPPLIER_DEFS) {
    db.insert(inventorySuppliers)
      .values({
        id: s.id,
        name: s.name,
        address: s.address,
        phone: s.phone,
        email: s.email,
        createdAtUtcMs: t0,
        updatedAtUtcMs: t0,
      })
      .run();
  }

  for (const h of HOME_DEFS) {
    db.insert(homes)
      .values({
        id: h.id,
        name: h.name,
        address: h.address,
        defaultCurrencyCode: "LKR",
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

    medicineByHome.set(h.id, seedMedicineCatalogForHome(db, h.id, t0));

    db.insert(accounts)
      .values({
        id: randomUUID(),
        accountType: "home",
        residentId: null,
        homeId: h.id,
        currencyCode: "LKR",
        createdAtUtcMs: t0,
        updatedAtUtcMs: t0,
      })
      .run();
  }

  db.insert(users)
    .values({
      id: ADMIN_USER_ID,
      email: ADMIN_EMAIL,
      passwordHash,
      role: "admin",
      failureTimestampsUtcMs: "[]",
      lockedUntilUtcMs: null,
      createdAtUtcMs: t0,
      primaryHomeId: HOME_DEFS[0].id,
      displayName: "Village60 Admin",
      phone: "+94 77 555 0100",
      avatarUrl: null,
    })
    .run();

  for (let i = 0; i < CARE_USERS.length; i++) {
    const care = CARE_USERS[i];
    const home = HOME_DEFS[care.homeIdx];
    db.insert(users)
      .values({
        id: care.id,
        email: care.email,
        passwordHash,
        role: "care",
        failureTimestampsUtcMs: "[]",
        lockedUntilUtcMs: null,
        createdAtUtcMs: t0 + (i + 1) * 3600_000,
        primaryHomeId: home.id,
        displayName: care.displayName,
        phone: `+94 77 555 ${String(200 + i).padStart(4, "0")}`,
        avatarUrl: null,
      })
      .run();
  }

  for (let i = 0; i < RESIDENT_DEFS.length; i++) {
    const def = RESIDENT_DEFS[i];
    const home = HOME_DEFS[def.homeIdx];
    const ward = home.wards[def.wardIdx];
    const residentId = randomUUID();
    const nowMs = t0 + (i + 1) * 60_000;

    db.insert(residents)
      .values({
        id: residentId,
        homeId: home.id,
        fullName: def.fullName,
        normalizedFullName: normFullName(def.fullName),
        dob: def.dob,
        admissionDate: "2024-06-01",
        wardId: ward.id,
        roomText: `Room ${def.room}`,
        status: "active",
        nokName: "Family contact",
        nokContact: "+94 71 555 1234",
        nokRelationship: "daughter",
        poaSameAsNok: true,
        poaName: null,
        poaContact: null,
        poaRelationship: null,
        assignedNurseUserId:
          PRIMARY_CARE_USER_BY_HOME.get(def.homeIdx) ?? CARE_USERS[0].id,
        assignedNurseDisplayOverride: null,
        portraitStoredRelativePath: null,
        portraitContentType: null,
        portraitSizeBytes: null,
        portraitUpdatedAtUtcMs: null,
        publicToken: randomUUID(),
        createdAtUtcMs: nowMs,
        updatedAtUtcMs: nowMs,
      })
      .run();

    db.insert(accounts)
      .values({
        id: randomUUID(),
        accountType: "resident",
        residentId,
        homeId: null,
        currencyCode: "LKR",
        createdAtUtcMs: nowMs,
        updatedAtUtcMs: nowMs,
      })
      .run();

    seededResidents.push({ id: residentId, homeId: home.id, idx: i });
  }

  for (const resident of seededResidents) {
    const homeMedicines = medicineByHome.get(resident.homeId);
    if (!homeMedicines) {
      throw new Error(`Medicine catalog missing for home ${resident.homeId}`);
    }
    seedResidentClinicalData(
      db,
      resident,
      homeMedicines,
      t0 + (resident.idx + 1) * 60_000,
    );
  }

  for (let hi = 0; hi < HOME_DEFS.length; hi++) {
    const h = HOME_DEFS[hi];
    seedTasksForHome(db, h.id, h.name, ADMIN_USER_ID, t0 + 500_000 + hi * 100_000);
  }

  const staffDefs = [
    {
      homeIdx: 0,
      userId: CARE_USERS[0].id,
      fullName: CARE_USERS[0].displayName,
      roleTitle: "Registered Nurse",
      monthlySalaryMinor: 120_000_00,
    },
    {
      homeIdx: 0,
      userId: CARE_USERS[1].id,
      fullName: CARE_USERS[1].displayName,
      roleTitle: "Care Assistant",
      monthlySalaryMinor: 85_000_00,
    },
    {
      homeIdx: 1,
      userId: CARE_USERS[2].id,
      fullName: CARE_USERS[2].displayName,
      roleTitle: "Registered Nurse",
      monthlySalaryMinor: 115_000_00,
    },
    {
      homeIdx: 1,
      userId: null,
      fullName: "Sunil Karunaratne",
      roleTitle: "Night Porter",
      monthlySalaryMinor: 72_000_00,
    },
    {
      homeIdx: 2,
      userId: CARE_USERS[3].id,
      fullName: CARE_USERS[3].displayName,
      roleTitle: "Registered Nurse",
      monthlySalaryMinor: 118_000_00,
    },
    {
      homeIdx: 2,
      userId: null,
      fullName: "Kasun Ratnayake",
      roleTitle: "Care Assistant",
      monthlySalaryMinor: 82_000_00,
    },
    {
      homeIdx: 3,
      userId: CARE_USERS[4].id,
      fullName: CARE_USERS[4].displayName,
      roleTitle: "Registered Nurse",
      monthlySalaryMinor: 122_000_00,
    },
    {
      homeIdx: 3,
      userId: null,
      fullName: "Niluka Fernando",
      roleTitle: "Activities Coordinator",
      monthlySalaryMinor: 78_000_00,
    },
  ] as const;

  for (const staff of staffDefs) {
    const home = HOME_DEFS[staff.homeIdx];
    db.insert(staffSalaries)
      .values({
        id: randomUUID(),
        homeId: home.id,
        userId: staff.userId,
        fullName: staff.fullName,
        roleTitle: staff.roleTitle,
        monthlySalaryMinor: staff.monthlySalaryMinor,
        effectiveFrom: "2025-01-01",
        effectiveTo: null,
        status: "active",
        phone: null,
        notes: null,
        createdAtUtcMs: t0,
        updatedAtUtcMs: t0,
      })
      .run();
  }

  console.log(`Seed complete (${RESET ? "after reset" : "append"}).`);
  console.log(`Login: ${ADMIN_EMAIL} / ${ADMIN_PASSWORD}`);
  console.log(`Suppliers: ${SUPPLIER_DEFS.length} global inventory suppliers.`);
  console.log(
    `Care staff share the same password (${CARE_USERS.map((u) => u.email).join(", ")}).`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
