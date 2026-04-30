/**
 * Wipes application data and loads a rich demo dataset so dashboard charts
 * (census, residents per home, ward mix) look realistic.
 *
 * Usage: npm run db:demo -- --force
 */
import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import {
  authEvents,
  homes,
  otherCharges,
  residentAllergies,
  residentConditions,
  residentDepartureDetails,
  residentMedications,
  residentMonthlyCharges,
  residentPayments,
  residents,
  userAdditionalHomes,
  users,
  wards,
} from "@/db/schema";
import { getAppTimezone, zonedDateAtUtcMs } from "@/lib/config/appTimezone";
import { DEFAULT_CURRENCY_CODE } from "@/lib/homes/defaultCurrencyCode";
import { hashPassword } from "@/lib/iam/password";
import { normalizeFullNameForUniqueness } from "@/lib/residents/service";
import { randomUUID } from "node:crypto";

const adminEmail = (process.env.SEED_ADMIN_EMAIL ?? "admin@example.com")
  .trim()
  .toLowerCase();
const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? "ChangeMeNow!1";

const nurseEmail = (process.env.SEED_DEMO_NURSE_EMAIL ?? "nurse@demo.local")
  .trim()
  .toLowerCase();
const nursePassword = process.env.SEED_DEMO_NURSE_PASSWORD ?? "DemoNurse!1";

function iso(y: number, m: number, d: number): string {
  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

type WardSeed = {
  label: string;
  sortOrder: number;
  bedCount: number;
  /** Per-person monthly fee in home currency minor units (e.g. cents). */
  monthlyRatePerPersonMinor: number | null;
};

type HomeSeed = {
  name: string;
  currency: string;
  wards: WardSeed[];
};

const HOME_SEEDS: HomeSeed[] = [
  {
    name: "Maple Grove Care Home",
    currency: DEFAULT_CURRENCY_CODE,
    wards: [
      {
        label: "Memory Care",
        sortOrder: 1,
        bedCount: 14,
        monthlyRatePerPersonMinor: 6_800_00,
      },
      {
        label: "General Care",
        sortOrder: 2,
        bedCount: 20,
        monthlyRatePerPersonMinor: 5_200_00,
      },
      {
        label: "Respite",
        sortOrder: 3,
        bedCount: 6,
        monthlyRatePerPersonMinor: 5_800_00,
      },
    ],
  },
  {
    name: "Harbor View Rest Home",
    currency: DEFAULT_CURRENCY_CODE,
    wards: [
      {
        label: "East Wing",
        sortOrder: 1,
        bedCount: 16,
        monthlyRatePerPersonMinor: 4_950_00,
      },
      {
        label: "West Wing",
        sortOrder: 2,
        bedCount: 16,
        monthlyRatePerPersonMinor: 4_950_00,
      },
      {
        label: "Garden Studios",
        sortOrder: 3,
        bedCount: 8,
        monthlyRatePerPersonMinor: 5_400_00,
      },
    ],
  },
  {
    name: "Riverside Lodge",
    currency: DEFAULT_CURRENCY_CODE,
    wards: [
      {
        label: "Ground Floor",
        sortOrder: 1,
        bedCount: 12,
        monthlyRatePerPersonMinor: 5_000_00,
      },
      {
        label: "Upper Floor",
        sortOrder: 2,
        bedCount: 12,
        monthlyRatePerPersonMinor: 5_000_00,
      },
    ],
  },
];

/** Residents per ward column (home index → ward index → count). Unassigned use -1. */
const ACTIVE_COUNTS_BY_WARD: number[][] = [
  [6, 11, 2, 1],
  [7, 6, 3, 0],
  [8, 7, -1, -1],
];

const FIRST_NAMES = [
  "Margaret",
  "James",
  "Eleanor",
  "Arthur",
  "Patricia",
  "William",
  "Dorothy",
  "Robert",
  "Joan",
  "David",
  "Helen",
  "Brian",
  "Betty",
  "Graham",
  "Audrey",
  "Keith",
  "Iris",
  "Neville",
  "Joyce",
  "Colin",
  "Marjorie",
  "Raymond",
  "Linda",
  "Stanley",
  "Carol",
  "Murray",
  "Sandra",
  "Allan",
  "Pamela",
  "Ross",
  "Shirley",
  "Wayne",
  "Raewyn",
  "Barry",
  "Sue",
  "Kevin",
  "Janice",
  "Peter",
  "Glenda",
  "Nigel",
];

const LAST_NAMES = [
  "Thompson",
  "Ngata",
  "Patel",
  "Williams",
  "Chen",
  "O'Brien",
  "Singh",
  "Walker",
  "Kumar",
  "Murphy",
  "Zhang",
  "Kelly",
  "Robinson",
  "Lee",
  "Anderson",
  "Brown",
  "Taylor",
  "Martin",
  "Wilson",
  "Davies",
  "Cooper",
  "Bennett",
  "Richardson",
  "Scott",
  "Watson",
  "Hughes",
  "Edwards",
  "Stewart",
  "Morris",
  "Rogers",
];

function pickName(i: number): string {
  return `${FIRST_NAMES[i % FIRST_NAMES.length]} ${LAST_NAMES[(i * 7) % LAST_NAMES.length]}`;
}

type HomeBuilt = {
  id: string;
  wardIds: string[];
};

async function main() {
  if (!process.argv.includes("--force")) {
    console.error(
      "This script deletes all homes, residents, and users.\n" +
        "Run: npm run db:demo -- --force",
    );
    process.exit(1);
  }

  const db = getDb();
  const nowUtcMs = Date.now();
  const tz = getAppTimezone();
  const { year, month: monthThrough } = zonedDateAtUtcMs(nowUtcMs, tz);

  const adminHash = await hashPassword(adminPassword);
  const nurseHash = await hashPassword(nursePassword);
  const adminId = randomUUID();
  const nurseId = randomUUID();

  const homeRows: HomeBuilt[] = [];

  db.transaction((tx) => {
    tx.delete(residentPayments).run();
    tx.delete(residentMonthlyCharges).run();
    tx.delete(otherCharges).run();
    tx.delete(residentDepartureDetails).run();
    tx.delete(residentConditions).run();
    tx.delete(residentAllergies).run();
    tx.delete(residentMedications).run();
    tx.delete(residents).run();
    tx.delete(wards).run();
    tx.delete(userAdditionalHomes).run();
    tx.update(users).set({ primaryHomeId: null }).run();
    tx.delete(homes).run();
    tx.delete(authEvents).run();
    tx.delete(users).run();

    tx.insert(users)
      .values({
        id: adminId,
        email: adminEmail,
        passwordHash: adminHash,
        role: "admin",
        failureTimestampsUtcMs: "[]",
        lockedUntilUtcMs: null,
        createdAtUtcMs: nowUtcMs,
        primaryHomeId: null,
      })
      .run();

    tx.insert(users)
      .values({
        id: nurseId,
        email: nurseEmail,
        passwordHash: nurseHash,
        role: "care",
        failureTimestampsUtcMs: "[]",
        lockedUntilUtcMs: null,
        createdAtUtcMs: nowUtcMs,
        primaryHomeId: null,
      })
      .run();

    const t = Date.now();
    for (let hi = 0; hi < HOME_SEEDS.length; hi += 1) {
      const h = HOME_SEEDS[hi]!;
      const homeId = randomUUID();
      const wardIds: string[] = [];
      tx.insert(homes)
        .values({
          id: homeId,
          name: h.name,
          defaultCurrencyCode: h.currency,
          archivedAtUtcMs: null,
          createdAtUtcMs: t,
          updatedAtUtcMs: t,
        })
        .run();
      for (const w of h.wards) {
        const wid = randomUUID();
        wardIds.push(wid);
        tx.insert(wards)
          .values({
            id: wid,
            homeId,
            label: w.label,
            sortOrder: w.sortOrder,
            bedCount: w.bedCount,
            monthlyRatePerPersonMinor: w.monthlyRatePerPersonMinor,
            archivedAtUtcMs: null,
            createdAtUtcMs: t,
            updatedAtUtcMs: t,
          })
          .run();
      }
      homeRows.push({ id: homeId, wardIds });
    }

    tx.update(users)
      .set({ primaryHomeId: homeRows[0]?.id ?? null })
      .where(eq(users.id, nurseId))
      .run();
  });

  let nameIdx = 0;
  const residentIdsByHome = new Map<string, string[]>();

  /** Departed residents: `resident_departure_details` holds reason + instant (13a/13c). */
  const departedForCensus: {
    homeId: string;
    wardId: string | null;
    departMs: number;
    admit: string;
    reason: string;
  }[] = [
    {
      homeId: homeRows[0]!.id,
      wardId: homeRows[0]!.wardIds[1]!,
      departMs: Date.UTC(year, 2, 8, 14, 0, 0),
      admit: iso(year, 1, 6),
      reason: "Transferred to public hospital — acute care",
    },
    {
      homeId: homeRows[1]!.id,
      wardId: homeRows[1]!.wardIds[0]!,
      departMs: Date.UTC(year, 2, 22, 10, 0, 0),
      admit: iso(year - 1, 9, 12),
      reason: "Family requested transfer closer to relatives",
    },
    {
      homeId: homeRows[2]!.id,
      wardId: null,
      departMs: Date.UTC(year, 3, 4, 9, 30, 0),
      admit: iso(year, 2, 1),
      reason: "Deceased",
    },
    {
      homeId: homeRows[0]!.id,
      wardId: homeRows[0]!.wardIds[0]!,
      departMs: Date.UTC(year, 3, 12, 16, 0, 0),
      admit: iso(year - 1, 11, 3),
      reason:
        "Permanent move to another aged residential care facility following family review of care needs and location preferences.",
    },
    {
      homeId: homeRows[1]!.id,
      wardId: homeRows[1]!.wardIds[2]!,
      departMs: Date.UTC(year, 3, 18, 11, 15, 0),
      admit: iso(year, 1, 20),
      reason: "Respite stay ended; returned home with supports",
    },
    {
      homeId: homeRows[2]!.id,
      wardId: homeRows[2]!.wardIds[1]!,
      departMs: Date.UTC(year, 3, 25, 8, 45, 0),
      admit: iso(year - 2, 6, 1),
      reason: "Rest home level care — transferred within group",
    },
  ];

  db.transaction((tx) => {
    const t = Date.now();

    for (let hi = 0; hi < homeRows.length; hi += 1) {
      const home = homeRows[hi]!;
      const counts = ACTIVE_COUNTS_BY_WARD[hi]!;
      const list: string[] = [];

      for (let wi = 0; wi < counts.length; wi += 1) {
        const n = counts[wi]!;
        if (n <= 0) {
          continue;
        }
        const wardId = wi < home.wardIds.length ? home.wardIds[wi]! : null;
        for (let k = 0; k < n; k += 1) {
          const fullName = pickName(nameIdx);
          nameIdx += 1;
          const dobYear = 1938 + (nameIdx % 22);
          const dob = iso(dobYear, 1 + (nameIdx % 12), 1 + (nameIdx % 28));
          const admissionDate = iso(year, 1 + ((nameIdx + hi + k) % monthThrough), 1 + ((nameIdx + k) % 20));
          const id = randomUUID();

          tx.insert(residents)
            .values({
              id,
              homeId: home.id,
              fullName,
              normalizedFullName: normalizeFullNameForUniqueness(fullName),
              dob,
              admissionDate,
              wardId,
              roomText: `Room ${100 + nameIdx}`,
              status: "active",
              nokName: "Family contact",
              nokContact: "+64 21 555 0100",
              nokRelationship: "Child",
              poaSameAsNok: false,
              poaName: null,
              poaContact: null,
              poaRelationship: null,
              assignedNurseUserId: nurseId,
              assignedNurseDisplayOverride: null,
              createdAtUtcMs: t,
              updatedAtUtcMs: t,
            })
            .run();
          list.push(id);
        }
      }

      residentIdsByHome.set(home.id, list);
    }

    for (const d of departedForCensus) {
      const fullName = pickName(nameIdx);
      nameIdx += 1;
      const dob = iso(1941 + (nameIdx % 15), 4, 10 + (nameIdx % 15));
      const id = randomUUID();
      tx.insert(residents)
        .values({
          id,
          homeId: d.homeId,
          fullName,
          normalizedFullName: normalizeFullNameForUniqueness(fullName),
          dob,
          admissionDate: d.admit,
          wardId: d.wardId,
          roomText: null,
          status: "departed",
          nokName: "Family contact",
          nokContact: "+64 27 555 0200",
          nokRelationship: "Sibling",
          poaSameAsNok: true,
          poaName: null,
          poaContact: null,
          poaRelationship: null,
          assignedNurseUserId: null,
          assignedNurseDisplayOverride: null,
          createdAtUtcMs: t,
          updatedAtUtcMs: t,
        })
        .run();
      tx.insert(residentDepartureDetails)
        .values({
          residentId: id,
          reason: d.reason,
          departedAtUtcMs: d.departMs,
        })
        .run();
    }
  });

  console.log(
    `Demo data loaded (${tz}, YTD through month ${monthThrough} of ${year}).\n` +
      `  Admin: ${adminEmail} / ${adminPassword}\n` +
      `  Care:  ${nurseEmail} / ${nursePassword}\n` +
      `  Homes: ${homeRows.map((_, i) => HOME_SEEDS[i]!.name).join(", ")}`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
