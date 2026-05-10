/**
 * Full application seed: coherent demo rows for all active schema modules.
 * Shared by `seed.ts` and `demo-seed.ts`.
 *
 * Financial / analytics: spreads resident invoices (`monthly_fee` + other lines),
 * ledger charges, receipts, home operating payments, and operating expenses across
 * the last twelve billing months from “today” UTC so dashboards have visible trends.
 */
import type { getDb } from "@/db/client";
import { eq } from "drizzle-orm";
import {
  accounts,
  appSettings,
  authEvents,
  billingPayments,
  billingTransactions,
  homeInterestLeadSubmitBuckets,
  homeInterestLeads,
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
import {
  shiftBillingMonth,
  utcBillingMonthFromMs,
} from "@/lib/billing/billingMonth";
import { getAppTimezone } from "@/lib/config/appTimezone";
import { DEFAULT_CURRENCY_CODE } from "@/lib/homes/defaultCurrencyCode";
import { hashPassword } from "@/lib/iam/password";
import { normalizeFullNameForUniqueness } from "@/lib/residents/service";
import { randomUUID } from "node:crypto";

type AppDb = ReturnType<typeof getDb>;
type Tx = Parameters<Parameters<AppDb["transaction"]>[0]>[0];

export type FullSeedCredentials = {
  adminEmail: string;
  adminPassword: string;
  nurseEmail: string;
  nursePassword: string;
  careAccounts: { email: string; password: string; displayName: string }[];
  homesNamed: string[];
  timezoneLabel: string;
  calendarThrough: string;
};

const adminEmail = (process.env.SEED_ADMIN_EMAIL ?? "admin@example.com").trim().toLowerCase();
const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? "ChangeMeNow!1";
const nurseEmail = (process.env.SEED_DEMO_NURSE_EMAIL ?? "nurse@demo.local").trim().toLowerCase();
const nursePassword = process.env.SEED_DEMO_NURSE_PASSWORD ?? "DemoNurse!1";

const DAY_MS = 86_400_000;

function dateOnlyFromUtcMs(utcMs: number): string {
  return new Date(utcMs).toISOString().slice(0, 10);
}

function daysAgo(nowUtcMs: number, days: number): number {
  return nowUtcMs - days * DAY_MS;
}

/** Midday UTC for a `YYYY-MM-DD` date (stable ordering for seeded ledger rows). */
function utcMsFromIsoDate(isoDay: string): number {
  const [yP, moP, dP] = isoDay.split("-").map(Number);
  return Date.UTC(yP, moP - 1, dP, 12, 0, 0, 0);
}

/** Months of resident invoice + payment history (financial analytics presets). */
const SEED_FINANCIAL_HISTORY_MONTHS = 12;

function avatarFor(name: string): string {
  const safe = encodeURIComponent(name.replace(/\s+/g, " ").trim());
  return `https://ui-avatars.com/api/?name=${safe}&size=128&background=0f766e&color=fff`;
}

function wipeApplicationData(tx: Tx): void {
  tx.delete(invoiceLineItems).run();
  tx.delete(invoices).run();
  tx.delete(billingPayments).run();
  tx.delete(billingTransactions).run();
  tx.delete(accounts).run();

  tx.delete(homePurchaseOrderReceiveEvents).run();
  tx.delete(homePurchaseOrderLines).run();
  tx.delete(homePurchaseOrders).run();

  tx.delete(inventoryTransactions).run();
  tx.delete(inventoryBalances).run();
  tx.delete(residentMedications).run();
  tx.delete(inventoryItems).run();
  tx.delete(inventoryItemCategories).run();
  tx.delete(inventorySuppliers).run();

  tx.delete(residentDepartureDetails).run();
  tx.delete(residentConditions).run();
  tx.delete(residentAllergies).run();
  tx.delete(tasks).run();
  tx.delete(residents).run();
  tx.delete(wards).run();

  tx.delete(userAdditionalHomes).run();
  tx.delete(homeInterestLeads).run();
  tx.delete(homeInterestLeadSubmitBuckets).run();
  tx.delete(authEvents).run();

  tx.delete(appSettings).run();

  tx.update(users).set({ primaryHomeId: null }).run();
  tx.delete(homes).run();
  tx.delete(users).run();
}

type BuiltHome = { id: string; name: string; address: string; wardIds: string[] };
type ResidentRef = { id: string; homeId: string; status: "active" | "departed"; wardId: string | null };
type CareSeed = { id: string; email: string; displayName: string; phone: string; primaryHomeIndex: number };

export async function runFullApplicationSeed(db: AppDb): Promise<FullSeedCredentials> {
  const nowUtcMs = Date.now();
  const ts = nowUtcMs;
  const billingMonth = utcBillingMonthFromMs(nowUtcMs);
  const timezoneLabel = getAppTimezone();

  const adminHash = await hashPassword(adminPassword);
  const careHash = await hashPassword(nursePassword);

  const adminUserId = randomUUID();
  const careUsers: CareSeed[] = [
    {
      id: randomUUID(),
      email: nurseEmail,
      displayName: "Sam Demo RN",
      phone: "+64 21 555 0144",
      primaryHomeIndex: 0,
    },
    {
      id: randomUUID(),
      email: "jordan@demo.local",
      displayName: "Jordan Fraser EN",
      phone: "+64 27 555 0288",
      primaryHomeIndex: 1,
    },
    {
      id: randomUUID(),
      email: "alex@demo.local",
      displayName: "Alex Chen RN",
      phone: "+64 22 555 0361",
      primaryHomeIndex: 2,
    },
  ];

  const homesBuilt: BuiltHome[] = [];
  const residentsBuilt: ResidentRef[] = [];
  const residentAccountByResidentId = new Map<string, string>();
  const homeAccountByHomeId = new Map<string, string>();

  db.transaction((tx) => {
    wipeApplicationData(tx);

    tx.insert(users)
      .values({
        id: adminUserId,
        email: adminEmail,
        passwordHash: adminHash,
        role: "admin",
        failureTimestampsUtcMs: "[]",
        lockedUntilUtcMs: null,
        createdAtUtcMs: ts,
        primaryHomeId: null,
        displayName: "Jamie Administrator",
        phone: "+64 9 555 0101",
        avatarUrl: avatarFor("Jamie Administrator"),
      })
      .run();

    for (const care of careUsers) {
      tx.insert(users)
        .values({
          id: care.id,
          email: care.email,
          passwordHash: careHash,
          role: "care",
          failureTimestampsUtcMs: "[]",
          lockedUntilUtcMs: null,
          createdAtUtcMs: ts,
          primaryHomeId: null,
          displayName: care.displayName,
          phone: care.phone,
          avatarUrl: avatarFor(care.displayName),
        })
        .run();
    }

    const homeSpecs = [
      {
        name: "Maple",
        address: "42 Kauri Road, Mount Eden, Auckland 1024, New Zealand",
        wards: [
          { label: "Memory Care", sortOrder: 1, bedCount: 14, monthlyRatePerPersonMinor: 680000 },
          { label: "General Care", sortOrder: 2, bedCount: 20, monthlyRatePerPersonMinor: 520000 },
        ],
      },
      {
        name: "Harbor",
        address: "180 Marina Parade, Evans Bay, Wellington 6011, New Zealand",
        wards: [
          { label: "East Wing", sortOrder: 1, bedCount: 16, monthlyRatePerPersonMinor: 495000 },
          { label: "West Wing", sortOrder: 2, bedCount: 16, monthlyRatePerPersonMinor: 495000 },
        ],
      },
      {
        name: "Riverside",
        address: "9 Oxford Terrace, Christchurch Central 8011, New Zealand",
        wards: [
          { label: "Ground Floor", sortOrder: 1, bedCount: 12, monthlyRatePerPersonMinor: 500000 },
          { label: "Upper Floor", sortOrder: 2, bedCount: 12, monthlyRatePerPersonMinor: 500000 },
        ],
      },
    ] as const;

    for (const homeSpec of homeSpecs) {
      const homeId = randomUUID();
      tx.insert(homes)
        .values({
          id: homeId,
          name: homeSpec.name,
          address: homeSpec.address,
          defaultCurrencyCode: DEFAULT_CURRENCY_CODE,
          archivedAtUtcMs: null,
          createdAtUtcMs: ts,
          updatedAtUtcMs: ts,
        })
        .run();

      const wardIds: string[] = [];
      for (const ward of homeSpec.wards) {
        const wardId = randomUUID();
        wardIds.push(wardId);
        tx.insert(wards)
          .values({
            id: wardId,
            homeId,
            label: ward.label,
            sortOrder: ward.sortOrder,
            bedCount: ward.bedCount,
            monthlyRatePerPersonMinor: ward.monthlyRatePerPersonMinor,
            archivedAtUtcMs: null,
            createdAtUtcMs: ts,
            updatedAtUtcMs: ts,
          })
          .run();
      }

      homesBuilt.push({
        id: homeId,
        name: homeSpec.name,
        address: homeSpec.address,
        wardIds,
      });
    }

    tx.update(users)
      .set({ primaryHomeId: homesBuilt[0]!.id })
      .where(eq(users.id, adminUserId))
      .run();

    for (const care of careUsers) {
      tx.update(users)
        .set({ primaryHomeId: homesBuilt[care.primaryHomeIndex]!.id })
        .where(eq(users.id, care.id))
        .run();
    }

    tx.insert(userAdditionalHomes)
      .values({
        userId: careUsers[0]!.id,
        homeId: homesBuilt[1]!.id,
      })
      .run();
    tx.insert(userAdditionalHomes)
      .values({
        userId: careUsers[1]!.id,
        homeId: homesBuilt[2]!.id,
      })
      .run();

    const leadFixtures = [
      {
        home: 0,
        contactName: "Michael Hurst",
        phone: "+64 9 555 0801",
        email: "m.hurst@example.com",
        note: "Asked about memory-care beds.",
        source: "web" as const,
        status: "new",
        daysOld: 1,
      },
      {
        home: 1,
        contactName: "Priya Maharaj",
        phone: "+64 4 555 0902",
        email: "priya.m@gmail.com",
        note: "Tour booked for next week.",
        source: "web" as const,
        status: "contacted",
        daysOld: 4,
      },
      {
        home: 2,
        contactName: "Campbell Trustees",
        phone: "+64 3 555 0703",
        email: "enquiries@campbell-trust.co.nz",
        note: "Two-week respite in June.",
        source: "admin" as const,
        status: "closed",
        daysOld: 15,
      },
    ];

    const leadStatusesCycle = ["new", "contacted", "cancelled", "closed"] as const;

    const leadExtras = Array.from({ length: 14 }, (_, i) => ({
      home: i % 3,
      contactName: `Walk-in Prospect ${String(i + 1).padStart(2, "0")}`,
      phone: `+64 21 558 ${1000 + i}`,
      email: `prospect.${i + 1}@example.com`,
      note: i % 4 === 0 ? "Referred by local GP surgery." : "Website enquiry form.",
      source: i % 3 === 0 ? ("web" as const) : ("admin" as const),
      status: leadStatusesCycle[i % leadStatusesCycle.length]!,
      daysOld: 8 + i * 19,
    }));
    for (const lead of [...leadFixtures, ...leadExtras]) {
      const home = homesBuilt[lead.home]!;
      const createdAtUtcMs = daysAgo(ts, lead.daysOld);
      tx.insert(homeInterestLeads)
        .values({
          id: randomUUID(),
          homeId: home.id,
          homeNameSnapshot: home.name,
          homeAddressSnapshot: home.address,
          contactName: lead.contactName,
          phone: lead.phone,
          email: lead.email,
          note: lead.note,
          source: lead.source,
          consentAccepted: true,
          status: lead.status,
          createdByUserId: lead.source === "admin" ? adminUserId : null,
          createdAtUtcMs,
          updatedAtUtcMs: createdAtUtcMs,
        })
        .run();
    }

    tx.insert(homeInterestLeadSubmitBuckets)
      .values({
        ipKey: "seed::127.0.0.1",
        windowStartUtcMs: daysAgo(ts, 1),
        count: 2,
      })
      .run();

    for (const [index, home] of homesBuilt.entries()) {
      const activeResidentId = randomUUID();
      const activeName = `Resident ${index + 1} Active`;
      tx.insert(residents)
        .values({
          id: activeResidentId,
          homeId: home.id,
          fullName: activeName,
          normalizedFullName: normalizeFullNameForUniqueness(activeName),
          dob: `19${54 + index}-0${index + 4}-1${index + 1}`,
          admissionDate: dateOnlyFromUtcMs(daysAgo(ts, 220 + index * 30)),
          wardId: home.wardIds[0]!,
          roomText: `${home.name} Room ${200 + index}`,
          status: "active",
          nokName: `Family Contact ${index + 1}`,
          nokContact: `+64 21 555 01${40 + index}`,
          nokRelationship: "Child",
          poaSameAsNok: index % 2 === 0,
          poaName: index % 2 === 0 ? null : `POA Contact ${index + 1}`,
          poaContact: index % 2 === 0 ? null : `+64 22 555 01${60 + index}`,
          poaRelationship: index % 2 === 0 ? null : "Power of attorney",
          assignedNurseUserId: careUsers[index]!.id,
          assignedNurseDisplayOverride: null,
          portraitStoredRelativePath: null,
          portraitContentType: null,
          portraitSizeBytes: null,
          portraitUpdatedAtUtcMs: null,
          createdAtUtcMs: ts,
          updatedAtUtcMs: ts,
        })
        .run();
      residentsBuilt.push({
        id: activeResidentId,
        homeId: home.id,
        status: "active",
        wardId: home.wardIds[0]!,
      });

      const departedResidentId = randomUUID();
      const departedName = `Resident ${index + 1} Departed`;
      tx.insert(residents)
        .values({
          id: departedResidentId,
          homeId: home.id,
          fullName: departedName,
          normalizedFullName: normalizeFullNameForUniqueness(departedName),
          dob: `19${48 + index}-1${index + 1}-0${index + 2}`,
          admissionDate: dateOnlyFromUtcMs(daysAgo(ts, 500 + index * 45)),
          wardId: home.wardIds[1] ?? home.wardIds[0]!,
          roomText: `${home.name} Room ${300 + index}`,
          status: "departed",
          nokName: `Family Contact D${index + 1}`,
          nokContact: `+64 27 555 02${20 + index}`,
          nokRelationship: "Sibling",
          poaSameAsNok: false,
          poaName: `POA D${index + 1}`,
          poaContact: `+64 29 555 03${10 + index}`,
          poaRelationship: "Legal guardian",
          assignedNurseUserId: careUsers[index]!.id,
          assignedNurseDisplayOverride: null,
          portraitStoredRelativePath: null,
          portraitContentType: null,
          portraitSizeBytes: null,
          portraitUpdatedAtUtcMs: null,
          createdAtUtcMs: ts,
          updatedAtUtcMs: ts,
        })
        .run();
      tx.insert(residentDepartureDetails)
        .values({
          residentId: departedResidentId,
          reason: "Transferred to another care home",
          departedAtUtcMs: daysAgo(ts, 30 + index * 10),
        })
        .run();
      residentsBuilt.push({
        id: departedResidentId,
        homeId: home.id,
        status: "departed",
        wardId: home.wardIds[1] ?? home.wardIds[0]!,
      });
    }

    for (const [idx, resident] of residentsBuilt.entries()) {
      tx.insert(residentConditions)
        .values({
          id: randomUUID(),
          residentId: resident.id,
          label: idx % 2 === 0 ? "Hypertension" : "Osteoarthritis",
          sortOrder: 0,
          createdAtUtcMs: ts,
          updatedAtUtcMs: ts,
        })
        .run();
      tx.insert(residentAllergies)
        .values({
          id: randomUUID(),
          residentId: resident.id,
          allergen: idx % 2 === 0 ? "Penicillin" : "Shellfish",
          notes: idx % 2 === 0 ? "Mild rash" : null,
          sortOrder: 0,
          createdAtUtcMs: ts,
          updatedAtUtcMs: ts,
        })
        .run();
    }

    const supplierId = randomUUID();
    tx.insert(inventorySuppliers)
      .values({
        id: supplierId,
        name: "Care Supply Co",
        address: "101 Industry Road, Auckland",
        phone: "+64 9 555 7070",
        email: "orders@caresupply.example",
        createdAtUtcMs: ts,
        updatedAtUtcMs: ts,
      })
      .run();

    const itemByHome = new Map<string, string>();
    for (const home of homesBuilt) {
      const categoryId = randomUUID();
      tx.insert(inventoryItemCategories)
        .values({
          id: categoryId,
          homeId: home.id,
          name: "Medication",
          createdAtUtcMs: ts,
          updatedAtUtcMs: ts,
        })
        .run();

      const itemId = randomUUID();
      itemByHome.set(home.id, itemId);
      tx.insert(inventoryItems)
        .values({
          id: itemId,
          homeId: home.id,
          categoryId,
          name: "Paracetamol 500mg",
          baseUnit: "tablet",
          unitClass: "countable",
          createdAtUtcMs: ts,
          updatedAtUtcMs: ts,
        })
        .run();

      const balanceId = randomUUID();
      tx.insert(inventoryBalances)
        .values({
          id: balanceId,
          ownerType: "HOME",
          ownerId: home.id,
          itemId,
          quantityBaseUnits: 120,
          createdAtUtcMs: ts,
          updatedAtUtcMs: ts,
        })
        .run();

      tx.insert(inventoryTransactions)
        .values({
          id: randomUUID(),
          ownerType: "HOME",
          ownerId: home.id,
          itemId,
          transactionType: "RECEIVE",
          transferId: null,
          quantityDeltaBaseUnits: 120,
          sourceType: "PO_RECEIVE",
          sourceId: balanceId,
          note: "Initial stock",
          actorUserId: adminUserId,
          createdAtUtcMs: ts,
        })
        .run();
    }

    for (const [idx, resident] of residentsBuilt.entries()) {
      if (resident.status !== "active") {
        continue;
      }
      const itemId = itemByHome.get(resident.homeId);
      if (!itemId) {
        continue;
      }
      tx.insert(residentMedications)
        .values({
          id: randomUUID(),
          residentId: resident.id,
          itemId,
          quantityPerServing: 2,
          servingsPerDay: 3,
          directions: "After meals",
          prn: false,
          status: "active",
          sortOrder: idx,
          createdAtUtcMs: ts,
          updatedAtUtcMs: ts,
        })
        .run();
    }

    for (const home of homesBuilt) {
      const accountId = randomUUID();
      homeAccountByHomeId.set(home.id, accountId);
      tx.insert(accounts)
        .values({
          id: accountId,
          accountType: "home",
          residentId: null,
          homeId: home.id,
          currencyCode: DEFAULT_CURRENCY_CODE,
          createdAtUtcMs: ts,
          updatedAtUtcMs: ts,
        })
        .run();
    }
    for (const resident of residentsBuilt) {
      const accountId = randomUUID();
      residentAccountByResidentId.set(resident.id, accountId);
      tx.insert(accounts)
        .values({
          id: accountId,
          accountType: "resident",
          residentId: resident.id,
          homeId: null,
          currencyCode: DEFAULT_CURRENCY_CODE,
          createdAtUtcMs: ts,
          updatedAtUtcMs: ts,
        })
        .run();
    }

    const homeIndexById = new Map(homesBuilt.map((h, i) => [h.id, i]));
    const wardHeadlineFeeByHomeIdx = [680000, 495000, 500000] as const;
    const receiptMethodsCycle = ["bank_transfer", "cash", "cheque"] as const;

    for (const resident of residentsBuilt) {
      const accountId = residentAccountByResidentId.get(resident.id);
      if (!accountId) {
        continue;
      }
      const hi = homeIndexById.get(resident.homeId) ?? 0;

      if (resident.status === "departed") {
        const departedInvoiceId = randomUUID();
        tx.insert(invoices)
          .values({
            id: departedInvoiceId,
            accountId,
            homeId: resident.homeId,
            invNo: `INV-D-${String(hi + 1).padStart(2, "0")}-${resident.id.replace(/-/g, "").slice(0, 6)}`,
            purchaseOrderId: null,
            status: "draft",
            issuedOn: `${billingMonth}-01`,
            totalMinorSnapshot: 520000,
            createdAtUtcMs: ts,
            updatedAtUtcMs: ts,
          })
          .run();
        tx.insert(invoiceLineItems)
          .values({
            id: randomUUID(),
            invoiceId: departedInvoiceId,
            category: "monthly_fee",
            description: "Draft carry-forward (departed resident)",
            amountMinor: 520000,
            serviceMonth: billingMonth,
            quantity: 1,
            createdAtUtcMs: ts,
            updatedAtUtcMs: ts,
          })
          .run();
        continue;
      }

      for (let mi = 0; mi < SEED_FINANCIAL_HISTORY_MONTHS; mi++) {
        const ym = shiftBillingMonth(billingMonth, -mi);
        const issuedOn = `${ym}-15`;
        const feeMinor =
          wardHeadlineFeeByHomeIdx[hi] + (mi % 5) * 2800 + hi * 1100;
        const miscMinor = 38000 + mi * 700 + hi * 350;
        const otherMinor = 9200 + mi * 120;
        const totalSnap = feeMinor + miscMinor + otherMinor;

        const invoiceId = randomUUID();
        const lineFeeId = randomUUID();
        const lineMiscId = randomUUID();
        const lineOtherId = randomUUID();
        tx.insert(invoices)
          .values({
            id: invoiceId,
            accountId,
            homeId: resident.homeId,
            invNo: `INV-${String(hi + 1).padStart(2, "0")}-${ym}-${String(mi).padStart(2, "0")}`,
            purchaseOrderId: null,
            status: "finalized",
            issuedOn,
            totalMinorSnapshot: totalSnap,
            createdAtUtcMs: utcMsFromIsoDate(issuedOn),
            updatedAtUtcMs: utcMsFromIsoDate(issuedOn),
          })
          .run();

        tx.insert(invoiceLineItems)
          .values({
            id: lineFeeId,
            invoiceId,
            category: "monthly_fee",
            description: `Residential board (${ym})`,
            amountMinor: feeMinor,
            serviceMonth: ym,
            quantity: 1,
            createdAtUtcMs: ts,
            updatedAtUtcMs: ts,
          })
          .run();
        tx.insert(invoiceLineItems)
          .values({
            id: lineMiscId,
            invoiceId,
            category: "misc",
            description: "Clinical consumables & incidentals",
            amountMinor: miscMinor,
            serviceMonth: null,
            quantity: 1,
            createdAtUtcMs: ts,
            updatedAtUtcMs: ts,
          })
          .run();
        tx.insert(invoiceLineItems)
          .values({
            id: lineOtherId,
            invoiceId,
            category: "other_charge",
            description: "Therapy equipment rental",
            amountMinor: otherMinor,
            serviceMonth: null,
            quantity: 1,
            createdAtUtcMs: ts,
            updatedAtUtcMs: ts,
          })
          .run();

        const monthlySourceId = `${accountId}:${ym}`;
        const postedChargeAt = utcMsFromIsoDate(issuedOn);

        tx.insert(billingTransactions)
          .values({
            id: randomUUID(),
            accountId,
            accountType: "resident",
            txnType: "charge",
            amountMinor: feeMinor,
            sourceKind: "invoice_monthly_fee",
            sourceId: monthlySourceId,
            memo: `Board ${ym}`,
            recordedByUserId: adminUserId,
            postedAtUtcMs: postedChargeAt + 3600,
          })
          .run();
        tx.insert(billingTransactions)
          .values({
            id: randomUUID(),
            accountId,
            accountType: "resident",
            txnType: "charge",
            amountMinor: miscMinor,
            sourceKind: "invoice_line_item",
            sourceId: lineMiscId,
            memo: "Clinical consumables & incidentals",
            recordedByUserId: adminUserId,
            postedAtUtcMs: postedChargeAt + 7200,
          })
          .run();
        tx.insert(billingTransactions)
          .values({
            id: randomUUID(),
            accountId,
            accountType: "resident",
            txnType: "charge",
            amountMinor: otherMinor,
            sourceKind: "invoice_line_item",
            sourceId: lineOtherId,
            memo: "Therapy equipment rental",
            recordedByUserId: adminUserId,
            postedAtUtcMs: postedChargeAt + 10_800,
          })
          .run();

        const payPortion =
          mi % 7 === 0
            ? 1
            : mi % 5 === 0
              ? 0.92
              : 0.55 + ((mi + hi) % 5) * 0.08;
        const payMinor = Math.max(5000, Math.floor(totalSnap * payPortion));
        const receivedOnDay =
          ym < billingMonth
            ? `${ym}-${String(Math.min(22 + (mi % 7), 28)).padStart(2, "0")}`
            : dateOnlyFromUtcMs(daysAgo(ts, 1 + mi));
        const receivedOnUtcMs = utcMsFromIsoDate(receivedOnDay);
        const paymentId = randomUUID();
        const paymentTxnId = randomUUID();
        tx.insert(billingTransactions)
          .values({
            id: paymentTxnId,
            accountId,
            accountType: "resident",
            txnType: "payment",
            amountMinor: -payMinor,
            sourceKind: "payment",
            sourceId: paymentId,
            memo: mi % 3 === 0 ? "Standing order instalment" : "Family transfer",
            recordedByUserId: adminUserId,
            postedAtUtcMs: receivedOnUtcMs,
          })
          .run();
        tx.insert(billingPayments)
          .values({
            id: paymentId,
            accountId,
            amountMinor: payMinor,
            receivedOn: receivedOnUtcMs,
            method: receiptMethodsCycle[(mi + hi) % receiptMethodsCycle.length]!,
            externalReference:
              receiptMethodsCycle[(mi + hi) % receiptMethodsCycle.length] ===
              "bank_transfer"
                ? `NZD-SEED-${ym}-${resident.id.slice(0, 4)}`
                : null,
            notes: `Seeded receipt — ${ym}`,
            recordedByUserId: adminUserId,
            ledgerTransactionId: paymentTxnId,
            updatedAtUtcMs: receivedOnUtcMs,
          })
          .run();
      }

      const draftPeekId = randomUUID();
      const draftYmRecent = billingMonth;
      tx.insert(invoices)
        .values({
          id: draftPeekId,
          accountId,
          homeId: resident.homeId,
          invNo: null,
          purchaseOrderId: null,
          status: "draft",
          issuedOn: null,
          totalMinorSnapshot: null,
          createdAtUtcMs: ts,
          updatedAtUtcMs: ts,
        })
        .run();
      tx.insert(invoiceLineItems)
        .values({
          id: randomUUID(),
          invoiceId: draftPeekId,
          category: "monthly_fee",
          description: `Upcoming board — ${draftYmRecent} (estimate)`,
          amountMinor: wardHeadlineFeeByHomeIdx[hi] + 5500,
          serviceMonth: draftYmRecent,
          quantity: 1,
          createdAtUtcMs: ts,
          updatedAtUtcMs: ts,
        })
        .run();
    }

    for (const [hi, home] of homesBuilt.entries()) {
      const homeAcct = homeAccountByHomeId.get(home.id);
      if (!homeAcct) {
        continue;
      }
      for (const miOffset of [0, 2, 4, 6, 8, 10]) {
        const ym = shiftBillingMonth(billingMonth, -miOffset);
        const recv = `${ym}-${String(12 + hi).padStart(2, "0")}`;
        const payAmt = 125000 + miOffset * 2800 + hi * 9100;
        const paymentId = randomUUID();
        const paymentTxnId = randomUUID();
        tx.insert(billingTransactions)
          .values({
            id: paymentTxnId,
            accountId: homeAcct,
            accountType: "home",
            txnType: "payment",
            amountMinor: -payAmt,
            sourceKind: "payment",
            sourceId: paymentId,
            memo: `Operating levy (${ym})`,
            recordedByUserId: adminUserId,
            postedAtUtcMs: utcMsFromIsoDate(recv),
          })
          .run();
        tx.insert(billingPayments)
          .values({
            id: paymentId,
            accountId: homeAcct,
            amountMinor: payAmt,
            receivedOn: utcMsFromIsoDate(recv),
            method: miOffset % 2 === 0 ? "bank_transfer" : "cheque",
            externalReference: `HOME-LEVY-${home.name}-${ym}`,
            notes: "Seeded home operating receipt",
            recordedByUserId: adminUserId,
            ledgerTransactionId: paymentTxnId,
            updatedAtUtcMs: utcMsFromIsoDate(recv),
          })
          .run();
      }
    }
    for (const [index, home] of homesBuilt.entries()) {
      const itemId = itemByHome.get(home.id);
      if (!itemId) {
        continue;
      }
      const poId = randomUUID();
      tx.insert(homePurchaseOrders)
        .values({
          id: poId,
          homeId: home.id,
          poNumber: `PO-${home.name.toUpperCase()}-00${index + 1}`,
          supplierId,
          status: "SENT",
          currencyCode: DEFAULT_CURRENCY_CODE,
          approvedAtUtcMs: daysAgo(ts, 5),
          approvedByUserId: adminUserId,
          sentAtUtcMs: daysAgo(ts, 4),
          sentByUserId: adminUserId,
          createdByUserId: adminUserId,
          createdAtUtcMs: ts,
          updatedAtUtcMs: ts,
        })
        .run();

      const lineId = randomUUID();
      tx.insert(homePurchaseOrderLines)
        .values({
          id: lineId,
          purchaseOrderId: poId,
          itemId,
          ownerType: "HOME",
          ownerId: home.id,
          purchaseUnitType: "tablet",
          quantityOrderedBaseUnits: 200,
          quantityReceivedBaseUnits: 200,
          status: "CLOSED",
          createdAtUtcMs: ts,
          updatedAtUtcMs: ts,
        })
        .run();

      tx.insert(homePurchaseOrderReceiveEvents)
        .values({
          id: randomUUID(),
          purchaseOrderId: poId,
          purchaseOrderLineId: lineId,
          qtyReceivedEvent: 200,
          baseUnitsReceivedEvent: 200,
          unitPriceCents: 15,
          currencyCode: DEFAULT_CURRENCY_CODE,
          receivedAtUtcMs: daysAgo(ts, 3),
          note: "Full delivery",
          createdByUserId: adminUserId,
          createdAtUtcMs: ts,
        })
        .run();
    }

    tx.insert(tasks)
      .values({
        id: randomUUID(),
        homeId: homesBuilt[0]!.id,
        title: "Upload fire drill attendance sheet",
        notes: "Signed by all shift leads.",
        dueDate: dateOnlyFromUtcMs(daysAgo(ts, -3)),
        priority: "urgent",
        status: "open",
        createdByUserId: adminUserId,
        completedAtUtcMs: null,
        createdAtUtcMs: ts,
        updatedAtUtcMs: ts,
      })
      .run();
    tx.insert(tasks)
      .values({
        id: randomUUID(),
        homeId: homesBuilt[1]!.id,
        title: "Replace dining room handrails",
        notes: "Contractor booked.",
        dueDate: dateOnlyFromUtcMs(daysAgo(ts, 5)),
        priority: "normal",
        status: "completed",
        createdByUserId: careUsers[1]!.id,
        completedAtUtcMs: daysAgo(ts, 2),
        createdAtUtcMs: daysAgo(ts, 9),
        updatedAtUtcMs: ts,
      })
      .run();

    const taskSubjects = [
      "Review hoist sling inventory",
      "Family meeting invites — quarterly",
      "Linens reorder (facecloths)",
      "Medic fridge temp log audit",
      "Garden pathway lighting check",
      "Staff hand hygiene observations",
      "Activity calendar April publish",
      "Window restrictor signage walkthrough",
      "Backup generator test log",
      "Hydration rounding pilot debrief",
    ];
    for (let ti = 0; ti < taskSubjects.length; ti++) {
      const homeTi = homesBuilt[ti % homesBuilt.length]!;
      const doneOpen = ti % 3 !== 1;
      tx.insert(tasks)
        .values({
          id: randomUUID(),
          homeId: homeTi.id,
          title: taskSubjects[ti]!,
          notes: ti % 2 === 0 ? "Tracked in schema seed batch." : null,
          dueDate: dateOnlyFromUtcMs(daysAgo(ts, 45 - ti * 3)),
          priority: ti % 4 === 0 ? "urgent" : "normal",
          status: doneOpen ? "completed" : "open",
          createdByUserId: ti % 2 === 0 ? adminUserId : careUsers[ti % careUsers.length]!.id,
          completedAtUtcMs: doneOpen ? daysAgo(ts, 38 - ti * 2) : null,
          createdAtUtcMs: daysAgo(ts, 62 - ti),
          updatedAtUtcMs: ts,
        })
        .run();
    }
    tx.insert(authEvents)
      .values({
        id: randomUUID(),
        userId: adminUserId,
        email: adminEmail,
        eventType: "sign_in",
        occurredAtUtcMs: daysAgo(ts, 1),
      })
      .run();
    for (const [index, care] of careUsers.entries()) {
      tx.insert(authEvents)
        .values({
          id: randomUUID(),
          userId: care.id,
          email: care.email,
          eventType: "sign_in",
          occurredAtUtcMs: daysAgo(ts, 2 + index),
        })
        .run();
    }

    tx.insert(appSettings)
      .values({
        key: "billing.finalizedInvoiceGraceDays",
        valueInt: 5,
        updatedAtUtcMs: ts,
      })
      .run();
  });

  return {
    adminEmail,
    adminPassword,
    nurseEmail,
    nursePassword,
    careAccounts: careUsers.map((c) => ({
      email: c.email,
      password: nursePassword,
      displayName: c.displayName,
    })),
    homesNamed: homesBuilt.map((h) => h.name),
    timezoneLabel,
    calendarThrough: billingMonth,
  };
}
