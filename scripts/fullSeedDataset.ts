/**
 * Full application seed: all tables populated with coherent demo data.
 * Shared by `seed.ts` (after migrations / reset) and `demo-seed.ts` (--force).
 */
import { and, eq, isNotNull } from "drizzle-orm";
import type { getDb } from "@/db/client";
import {
  authEvents,
  homeInterestLeadSubmitBuckets,
  homeInterestLeads,
  homes,
  otherCharges,
  residentAllergies,
  residentConditions,
  residentDepartureDetails,
  residentMedications,
  residentMonthlyCharges,
  residentPayments,
  residents,
  tasks,
  userAdditionalHomes,
  users,
  wards,
} from "@/db/schema";
import { shiftBillingMonth } from "@/lib/analytics/revenueCollections";
import { generateMonthlyCharges } from "@/lib/billing/generateMonthlyCharges";
import { utcBillingMonthFromMs } from "@/lib/billing/billingMonth";
import { getAppTimezone, zonedDateAtUtcMs } from "@/lib/config/appTimezone";
import { DEFAULT_CURRENCY_CODE } from "@/lib/homes/defaultCurrencyCode";
import { hashPassword } from "@/lib/iam/password";
import { normalizeFullNameForUniqueness } from "@/lib/residents/service";
import { randomUUID } from "node:crypto";

export type FullSeedCredentials = {
  adminEmail: string;
  adminPassword: string;
  nurseEmail: string;
  nursePassword: string;
  homesNamed: string[];
  timezoneLabel: string;
  calendarThrough: string;
};

type AppDb = ReturnType<typeof getDb>;

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

function isoDatePlusDaysUtc(utcMs: number, days: number): string {
  const d = new Date(utcMs + days * 86_400_000);
  return d.toISOString().slice(0, 10);
}

function utcDateOnlyFromMs(ms: number): string {
  const d = new Date(ms);
  return iso(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
}

function addUtcDaysIso(dateOnly: string, deltaDays: number): string {
  const [y, m, d] = dateOnly.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + deltaDays));
  return iso(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
}

function lastUtcDomForMonthKey(monthKey: string): number {
  const [y, m] = monthKey.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

function seedHash(s: string): number {
  let h = 2_166_136_261;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16_777_619);
  }
  return h >>> 0;
}

/** Calendar date `paidOn` that is `daysAfterMonthEnd` days after the UTC last day of `billingMonth`. */
function paidOnAfterBillingMonthEnd(billingMonth: string, daysAfterMonthEnd: number): string {
  const [y, m] = billingMonth.split("-").map(Number);
  const lastDom = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const dt = new Date(Date.UTC(y, m - 1, lastDom + daysAfterMonthEnd));
  return iso(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
}

/** Next birthdays landing on UTC today + 1 … + 8 for dashboard week/month boards. */
function dobWeekBirthday(slot: number, nowUtcMs: number): string {
  const utcToday = utcDateOnlyFromMs(nowUtcMs);
  const [uy, um, ud] = utcToday.split("-").map(Number);
  const dt = new Date(Date.UTC(uy, um - 1, ud + 1 + slot));
  const tm = dt.getUTCMonth() + 1;
  const td = dt.getUTCDate();
  const birthYear = 1934 + (slot % 17);
  return iso(birthYear, tm, td);
}

/** Spread remaining birthdays across the next ~50 UTC days for month view density. */
function dobMonthScatter(slot: number, nowUtcMs: number): string {
  const utcToday = utcDateOnlyFromMs(nowUtcMs);
  const advance = 9 + ((slot * 13) % 50);
  const occur = addUtcDaysIso(utcToday, advance);
  const [, om, od] = occur.split("-").map(Number);
  const birthYear = 1936 + ((slot * 5) % 15);
  return iso(birthYear, om!, od!);
}

type WardSeed = {
  label: string;
  sortOrder: number;
  bedCount: number;
  monthlyRatePerPersonMinor: number | null;
};

type HomeSeed = {
  name: string;
  currency: string;
  wards: WardSeed[];
};

const HOME_SEEDS: HomeSeed[] = [
  {
    name: "Maple",
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
    name: "Harbor",
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
    name: "Riverside",
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

/** Departed resident fixtures — timing derived from UTC billing months for analytics charts. */
type DepartedSeedSpec = { hi: number; wi: number | null; reason: string };

const DEPARTED_SEED_SPECS: DepartedSeedSpec[] = [
  { hi: 0, wi: 1, reason: "Transferred to public hospital — acute care" },
  { hi: 1, wi: 0, reason: "Family requested transfer closer to relatives" },
  { hi: 2, wi: null, reason: "Deceased" },
  {
    hi: 0,
    wi: 0,
    reason:
      "Permanent move to another aged residential care facility following family review of care needs and location preferences.",
  },
  { hi: 1, wi: 2, reason: "Respite stay ended; returned home with supports" },
  { hi: 2, wi: 1, reason: "Rest home level care — transferred within group" },
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

function wipeApplicationData(tx: Parameters<Parameters<AppDb["transaction"]>[0]>[0]) {
  tx.delete(tasks).run();
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
  tx.delete(homeInterestLeads).run();
  tx.delete(homeInterestLeadSubmitBuckets).run();
  tx.delete(homes).run();
  tx.delete(authEvents).run();
  tx.delete(users).run();
}

export async function runFullApplicationSeed(db: AppDb): Promise<FullSeedCredentials> {
  const tz = getAppTimezone();
  const nowUtcMs = Date.now();
  const { year, month: monthThrough, day } = zonedDateAtUtcMs(nowUtcMs, tz);

  const adminHash = await hashPassword(adminPassword);
  const nurseHash = await hashPassword(nursePassword);
  const adminId = randomUUID();
  const nurseId = randomUUID();

  /** UTC calendar months — aligned with analytics revenue/admissions queries. */
  const bm0 = utcBillingMonthFromMs(nowUtcMs);
  const bmMinus1 = shiftBillingMonth(bm0, -1);
  const bmMinus2 = shiftBillingMonth(bm0, -2);

  const homeRows: HomeBuilt[] = [];
  /** Active residents with a ward — billing/clinical priorities use earlier rows first. */
  const activeWithWard: { id: string; wardId: string }[] = [];
  let nameIdx = 0;
  let activeResidentSlot = 0;

  db.transaction((tx) => {
    wipeApplicationData(tx);

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
        displayName: "Jamie Administrator",
        phone: "+64 9 555 0101",
        avatarUrl: null,
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
        displayName: "Sam Demo RN",
        phone: "+64 21 555 0144",
        avatarUrl: null,
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
          address: null,
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

    if (homeRows[1]) {
      tx.insert(userAdditionalHomes)
        .values({ userId: nurseId, homeId: homeRows[1]!.id })
        .run();
    }

    tx.insert(authEvents)
      .values({
        id: randomUUID(),
        userId: adminId,
        email: adminEmail,
        eventType: "sign_in",
        occurredAtUtcMs: nowUtcMs - 3 * 86_400_000,
      })
      .run();
    tx.insert(authEvents)
      .values({
        id: randomUUID(),
        userId: nurseId,
        email: nurseEmail,
        eventType: "sign_in",
        occurredAtUtcMs: nowUtcMs - 86_400_000,
      })
      .run();
    tx.insert(authEvents)
      .values({
        id: randomUUID(),
        userId: null,
        email: "unknown.person@example.com",
        eventType: "sign_in_failed",
        occurredAtUtcMs: nowUtcMs - 3_600_000,
      })
      .run();

    const departedForCensus = DEPARTED_SEED_SPECS.map((spec, di) => {
      const departMonthKey = shiftBillingMonth(bm0, -di * 2);
      const [dy, dm] = departMonthKey.split("-").map(Number);
      const departDom = Math.min(28, 8 + di * 3);
      const departMs = Date.UTC(dy, dm - 1, departDom, 14, 30, 0);
      const admitYm = shiftBillingMonth(departMonthKey, -(14 + di * 3));
      const admitDom = Math.min(28, 6 + di * 2);
      const admit = `${admitYm}-${String(admitDom).padStart(2, "0")}`;
      const wardId =
        spec.wi === null ? null : homeRows[spec.hi]!.wardIds[spec.wi]!;
      return {
        homeId: homeRows[spec.hi]!.id,
        wardId,
        departMs,
        admit,
        reason: spec.reason,
      };
    });

    for (let hi = 0; hi < homeRows.length; hi += 1) {
      const home = homeRows[hi]!;
      const counts = ACTIVE_COUNTS_BY_WARD[hi]!;

      for (let wi = 0; wi < counts.length; wi += 1) {
        const n = counts[wi]!;
        if (n <= 0) {
          continue;
        }
        const wardId = wi < home.wardIds.length ? home.wardIds[wi]! : null;
        for (let k = 0; k < n; k += 1) {
          const fullName = pickName(nameIdx);
          nameIdx += 1;
          const admitMonthRolling = shiftBillingMonth(bm0, -(activeResidentSlot % 12));
          const admitDom = Math.min(
            lastUtcDomForMonthKey(admitMonthRolling),
            8 + ((activeResidentSlot + hi + k) % 17),
          );
          const admissionDate = `${admitMonthRolling}-${String(admitDom).padStart(2, "0")}`;

          const dob =
            activeResidentSlot < 8
              ? dobWeekBirthday(activeResidentSlot, nowUtcMs)
              : dobMonthScatter(activeResidentSlot, nowUtcMs);

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
          if (wardId) {
            activeWithWard.push({ id, wardId });
          }
          activeResidentSlot += 1;
        }
      }
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

    const clinicalSubjects = activeWithWard.slice(0, 6);
    const clinicalDefs: {
      conditions: string[];
      allergies: { allergen: string; notes: string | null }[];
      medications: {
        name: string;
        dose: string;
        frequency: string;
        timingNotes: string | null;
        prn: boolean;
      }[];
    }[] = [
      {
        conditions: ["Hypertension", "Type 2 diabetes mellitus"],
        allergies: [{ allergen: "Penicillin", notes: "Anaphylaxis history — avoid beta-lactams." }],
        medications: [
          {
            name: "Metformin",
            dose: "500 mg",
            frequency: "Twice daily",
            timingNotes: "With breakfast and evening meal",
            prn: false,
          },
          {
            name: "Amlodipine",
            dose: "5 mg",
            frequency: "Once daily",
            timingNotes: null,
            prn: false,
          },
        ],
      },
      {
        conditions: ["Osteoarthritis", "Vitamin D deficiency"],
        allergies: [{ allergen: "Shellfish", notes: "Mild rash only." }],
        medications: [
          {
            name: "Paracetamol",
            dose: "1 g",
            frequency: "Three times daily",
            timingNotes: null,
            prn: false,
          },
        ],
      },
      {
        conditions: ["Atrial fibrillation"],
        allergies: [],
        medications: [
          {
            name: "Apixaban",
            dose: "5 mg",
            frequency: "Twice daily",
            timingNotes: "12 hours apart",
            prn: false,
          },
        ],
      },
      {
        conditions: ["Dementia — Alzheimer's type"],
        allergies: [{ allergen: "Latex", notes: null }],
        medications: [
          {
            name: "Donepezil",
            dose: "10 mg",
            frequency: "Once daily at night",
            timingNotes: null,
            prn: false,
          },
        ],
      },
      {
        conditions: ["Chronic kidney disease stage 3"],
        allergies: [],
        medications: [
          {
            name: "Furosemide",
            dose: "40 mg",
            frequency: "Morning",
            timingNotes: "Monitor fluid balance",
            prn: false,
          },
        ],
      },
      {
        conditions: ["COPD"],
        allergies: [{ allergen: "NSAIDs", notes: "GI bleed risk — prefer paracetamol." }],
        medications: [
          {
            name: "Salbutamol inhaler",
            dose: "100 mcg",
            frequency: "As needed",
            timingNotes: "For wheeze or SOB",
            prn: true,
          },
        ],
      },
    ];

    let clinicalIdx = 0;
    for (const sub of clinicalSubjects) {
      const def = clinicalDefs[clinicalIdx]!;
      clinicalIdx += 1;
      let sort = 0;
      for (const label of def.conditions) {
        tx.insert(residentConditions)
          .values({
            id: randomUUID(),
            residentId: sub.id,
            label,
            sortOrder: sort++,
            createdAtUtcMs: t,
            updatedAtUtcMs: t,
          })
          .run();
      }
      sort = 0;
      for (const a of def.allergies) {
        tx.insert(residentAllergies)
          .values({
            id: randomUUID(),
            residentId: sub.id,
            allergen: a.allergen,
            notes: a.notes,
            sortOrder: sort++,
            createdAtUtcMs: t,
            updatedAtUtcMs: t,
          })
          .run();
      }
      sort = 0;
      for (const m of def.medications) {
        tx.insert(residentMedications)
          .values({
            id: randomUUID(),
            residentId: sub.id,
            name: m.name,
            dose: m.dose,
            frequency: m.frequency,
            timingNotes: m.timingNotes,
            prn: m.prn,
            sortOrder: sort++,
            createdAtUtcMs: t,
            updatedAtUtcMs: t,
          })
          .run();
      }
    }

    const h0 = homeRows[0]!;
    const h1 = homeRows[1]!;
    const h2 = homeRows[2]!;
    const dueSoon = isoDatePlusDaysUtc(nowUtcMs, 3);
    const dueDone = isoDatePlusDaysUtc(nowUtcMs, -10);

    tx.insert(tasks)
      .values({
        id: randomUUID(),
        homeId: h0.id,
        title: "Fire drill paperwork — upload signed attendance sheet",
        notes:
          "District health board audit folder; scan and attach PDF once ward managers sign.",
        dueDate: dueSoon,
        priority: "urgent",
        status: "open",
        createdByUserId: adminId,
        completedAtUtcMs: null,
        createdAtUtcMs: t,
        updatedAtUtcMs: t,
      })
      .run();
    tx.insert(tasks)
      .values({
        id: randomUUID(),
        homeId: h0.id,
        title: "Replace guest Wi-Fi poster in main lounge",
        notes: null,
        dueDate: dueDone,
        priority: "normal",
        status: "completed",
        createdByUserId: nurseId,
        completedAtUtcMs: nowUtcMs - 9 * 86_400_000,
        createdAtUtcMs: t - 12 * 86_400_000,
        updatedAtUtcMs: t,
      })
      .run();
    tx.insert(tasks)
      .values({
        id: randomUUID(),
        homeId: h1.id,
        title: "Review respite bedding inventory before long weekend",
        notes: "Cross-check linen cupboard labels with spreadsheet.",
        dueDate: null,
        priority: "normal",
        status: "open",
        createdByUserId: adminId,
        completedAtUtcMs: null,
        createdAtUtcMs: t,
        updatedAtUtcMs: t,
      })
      .run();
    tx.insert(tasks)
      .values({
        id: randomUUID(),
        homeId: h2.id,
        title: "Lift service certificate filed",
        notes: "Annual certification completed by contractor.",
        dueDate: iso(year, monthThrough, Math.min(day, 28)),
        priority: "urgent",
        status: "completed",
        createdByUserId: adminId,
        completedAtUtcMs: nowUtcMs - 2 * 86_400_000,
        createdAtUtcMs: t - 5 * 86_400_000,
        updatedAtUtcMs: t,
      })
      .run();
  });

  let cursorGen = shiftBillingMonth(bm0, -11);
  while (cursorGen <= bm0) {
    generateMonthlyCharges(db, { billingMonth: cursorGen });
    cursorGen = shiftBillingMonth(cursorGen, 1);
  }

  const tsPay = Date.now();
  const allCharges = db.select().from(residentMonthlyCharges).all();
  for (const ch of allCharges) {
    const h = seedHash(`${ch.residentId}:${ch.billingMonth}`);
    const isPastMonth = ch.billingMonth.localeCompare(bm0) < 0;
    /** Past months: ~84% collected; current UTC month: partial (~40%). */
    const payCutoff = isPastMonth ? 840 : 400;
    if (h % 1000 >= payCutoff) {
      continue;
    }
    const lagDays = isPastMonth ? (h % 23) : (h % 11);
    const paidOn = paidOnAfterBillingMonthEnd(ch.billingMonth, lagDays);
    const notes =
      h % 19 === 0
        ? isPastMonth
          ? "Demo: automatic payment feed"
          : "Demo: early partial payment"
        : null;
    db.insert(residentPayments)
      .values({
        id: randomUUID(),
        residentMonthlyChargeId: ch.id,
        amountMinor: ch.amountMinorSnapshot,
        paidOn,
        notes,
        recordedByUserId: adminId,
        createdAtUtcMs: tsPay,
        updatedAtUtcMs: tsPay,
      })
      .run();
  }

  const tsOther = Date.now();
  const safeDay = (i: number, span: number) =>
    String(Math.min(28, (i % span) + 1)).padStart(2, "0");

  for (let i = 0; i < activeWithWard.length; i += 1) {
    const r = activeWithWard[i]!;
    const regReceived = i % 4 !== 3;
    db.insert(otherCharges)
      .values({
        id: randomUUID(),
        residentId: r.id,
        type: "registration",
        amountMinor: 450_00,
        received: regReceived,
        paidOn: regReceived ? `${bmMinus2}-${safeDay(i, 27)}` : null,
        createdAtUtcMs: tsOther,
        updatedAtUtcMs: tsOther,
      })
      .run();

    if (i % 3 !== 2) {
      const depReceived = i % 5 !== 4;
      db.insert(otherCharges)
        .values({
          id: randomUUID(),
          residentId: r.id,
          type: "deposit",
          amountMinor: 2_500_00,
          received: depReceived,
          paidOn: depReceived ? `${bmMinus1}-${safeDay(i + 3, 26)}` : null,
          createdAtUtcMs: tsOther,
          updatedAtUtcMs: tsOther,
        })
        .run();
    }
  }

  const sanity = db
    .select({ id: residents.id })
    .from(residents)
    .where(and(eq(residents.status, "active"), isNotNull(residents.wardId)))
    .all();
  if (sanity.length !== activeWithWard.length) {
    throw new Error("Seed invariant failed: active-with-ward resident count mismatch.");
  }

  return {
    adminEmail,
    adminPassword,
    nurseEmail,
    nursePassword,
    homesNamed: HOME_SEEDS.map((h) => h.name),
    timezoneLabel: tz,
    calendarThrough: bm0,
  };
}
