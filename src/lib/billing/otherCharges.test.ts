import { randomUUID } from "node:crypto";
import { pushTestSchema } from "@/test/pushTestSchema";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { and, eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { closeDbConnection, getDb } from "@/db/client";
import { accounts, invoiceLineItems, invoices, users } from "@/db/schema";
import { createHome } from "@/lib/homes/service";
import { ForbiddenError, NotFoundError } from "@/lib/homes/errors";
import { createResident } from "@/lib/residents/service";
import { createWard } from "@/lib/wards/service";
import { ValidationError } from "@/lib/homes/errors";
import {
  initializeMissingResidentOtherCharges,
  listResidentOtherCharges,
  updateResidentOtherCharge,
} from "./otherCharges";

const adminActor = { userId: "admin-oc", role: "admin" as const };
const careActor = { userId: "care-oc", role: "care" as const };

function seedAdminUser(db: ReturnType<typeof getDb>, userId: string) {
  const now = Date.now();
  db.insert(users)
    .values({
      id: userId,
      email: `${userId}@oc.test`,
      passwordHash: "x",
      role: "admin",
      failureTimestampsUtcMs: "[]",
      lockedUntilUtcMs: null,
      createdAtUtcMs: now,
      primaryHomeId: null,
    })
    .run();
}

function seedCareUser(db: ReturnType<typeof getDb>, userId: string) {
  const now = Date.now();
  db.insert(users)
    .values({
      id: userId,
      email: `${userId}@oc.test`,
      passwordHash: "x",
      role: "care",
      failureTimestampsUtcMs: "[]",
      lockedUntilUtcMs: null,
      createdAtUtcMs: now,
      primaryHomeId: null,
    })
    .run();
}

function residentAccountId(db: ReturnType<typeof getDb>, residentId: string) {
  const account = db
    .select()
    .from(accounts)
    .where(and(eq(accounts.accountType, "resident"), eq(accounts.residentId, residentId)))
    .get();
  if (!account) throw new Error("Resident billing account not found.");
  return account.id;
}

function seedOtherChargeLineItems(
  db: ReturnType<typeof getDb>,
  homeId: string,
  residentId: string,
  lines: { type: "registration" | "deposit"; amountMinor: number }[],
) {
  const now = Date.now();
  const invoiceId = randomUUID();
  db.insert(invoices)
    .values({
      id: invoiceId,
      accountId: residentAccountId(db, residentId),
      homeId,
      invNo: `INV-${invoiceId.replace(/-/g, "").slice(0, 8)}`,
      purchaseOrderId: null,
      status: "draft",
      issuedOn: "2026-01-01",
      totalMinorSnapshot: null,
      createdAtUtcMs: now,
      updatedAtUtcMs: now,
    })
    .run();

  const chargeIds = new Map<"registration" | "deposit", string>();
  for (const line of lines) {
    const id = randomUUID();
    db.insert(invoiceLineItems)
      .values({
        id,
        invoiceId,
        category: line.type,
        description: `${line.type} charge`,
        amountMinor: line.amountMinor,
        serviceMonth: null,
        quantity: 1,
        createdAtUtcMs: now,
        updatedAtUtcMs: now,
      })
      .run();
    chargeIds.set(line.type, id);
  }
  return chargeIds;
}

describe("other charges (17a)", () => {
  let dbPath: string;

  beforeEach(() => {
    dbPath = path.join(os.tmpdir(), `village60-oc-${randomUUID()}.sqlite`);
    process.env.DATABASE_PATH = dbPath;
    closeDbConnection();
    pushTestSchema(dbPath);
  });

  afterEach(() => {
    closeDbConnection();
    try {
      fs.unlinkSync(dbPath);
    } catch {
      /* ignore */
    }
  });

  it("returns an empty list when no rows exist", () => {
    const db = getDb();
    seedAdminUser(db, adminActor.userId);
    const home = createHome(db, "admin", {
      name: "H",
      defaultCurrencyCode: "NZD",
    });
    const ward = createWard(db, adminActor, home.id, {
      label: "W1",
      monthlyRatePerPersonMinor: 1000,
    });
    const res = createResident(db, adminActor, {
      homeId: home.id,
      fullName: "Pat Resident",
      dob: "1950-01-01",
      admissionDate: "2024-01-01",
      wardId: ward.id,
    });

    const list = listResidentOtherCharges(db, adminActor, home.id, res.id);
    expect(list).toEqual([]);
  });

  it("lists deposit before registration and exposes amounts", () => {
    const db = getDb();
    seedAdminUser(db, adminActor.userId);
    const home = createHome(db, "admin", {
      name: "H",
      defaultCurrencyCode: "NZD",
    });
    const ward = createWard(db, adminActor, home.id, {
      label: "W1",
      monthlyRatePerPersonMinor: 1000,
    });
    const res = createResident(db, adminActor, {
      homeId: home.id,
      fullName: "Pat Resident",
      dob: "1950-01-01",
      admissionDate: "2024-01-01",
      wardId: ward.id,
    });

    seedOtherChargeLineItems(db, home.id, res.id, [
      { type: "deposit", amountMinor: 500_00 },
      { type: "registration", amountMinor: 250_00 },
    ]);

    const list = listResidentOtherCharges(
      db,
      adminActor,
      home.id,
      res.id,
    );
    expect(list.map((x) => x.type)).toEqual(["deposit", "registration"]);
    expect(list[0]).toMatchObject({
      type: "deposit",
      amountMinor: 500_00,
      residentId: res.id,
    });
    expect(list[1]).toMatchObject({
      type: "registration",
      amountMinor: 250_00,
      residentId: res.id,
    });
  });

  it("rejects non-admin callers", () => {
    const db = getDb();
    seedAdminUser(db, adminActor.userId);
    seedCareUser(db, careActor.userId);
    const home = createHome(db, "admin", {
      name: "H",
      defaultCurrencyCode: "NZD",
    });
    const ward = createWard(db, adminActor, home.id, {
      label: "W1",
      monthlyRatePerPersonMinor: 1000,
    });
    const res = createResident(db, adminActor, {
      homeId: home.id,
      fullName: "Pat Resident",
      dob: "1950-01-01",
      admissionDate: "2024-01-01",
      wardId: ward.id,
    });

    expect(() =>
      listResidentOtherCharges(db, careActor, home.id, res.id),
    ).toThrow(ForbiddenError);
  });

  it("returns 404 scope when resident is not in the home", () => {
    const db = getDb();
    seedAdminUser(db, adminActor.userId);
    const homeA = createHome(db, "admin", {
      name: "A",
      defaultCurrencyCode: "NZD",
    });
    const homeB = createHome(db, "admin", {
      name: "B",
      defaultCurrencyCode: "NZD",
    });
    const wardA = createWard(db, adminActor, homeA.id, {
      label: "W",
      monthlyRatePerPersonMinor: 1000,
    });
    const res = createResident(db, adminActor, {
      homeId: homeA.id,
      fullName: "Pat Resident",
      dob: "1950-01-01",
      admissionDate: "2024-01-01",
      wardId: wardA.id,
    });

    expect(() =>
      listResidentOtherCharges(db, adminActor, homeB.id, res.id),
    ).toThrow(NotFoundError);
  });
});

function seedResidentWithOtherCharge(t: { type: "registration" | "deposit" }) {
  const db = getDb();
  seedAdminUser(db, adminActor.userId);
  const home = createHome(db, "admin", {
    name: "H",
    defaultCurrencyCode: "NZD",
  });
  const ward = createWard(db, adminActor, home.id, {
    label: "W1",
    monthlyRatePerPersonMinor: 1000,
  });
  const res = createResident(db, adminActor, {
    homeId: home.id,
    fullName: "Pat Resident",
    dob: "1950-01-01",
    admissionDate: "2024-03-20",
    wardId: ward.id,
  });
  const chargeIds = seedOtherChargeLineItems(db, home.id, res.id, [
    { type: t.type, amountMinor: 100_00 },
  ]);
  return { db, home, res, chargeId: chargeIds.get(t.type)! };
}

describe("other charge updates (17b)", () => {
  let dbPath: string;

  beforeEach(() => {
    dbPath = path.join(os.tmpdir(), `village60-oc17b-${randomUUID()}.sqlite`);
    process.env.DATABASE_PATH = dbPath;
    closeDbConnection();
    pushTestSchema(dbPath);
  });

  afterEach(() => {
    closeDbConnection();
    try {
      fs.unlinkSync(dbPath);
    } catch {
      /* ignore */
    }
  });

  it("patches registration amount (happy path)", () => {
    const { db, home, res, chargeId } = seedResidentWithOtherCharge({
      type: "registration",
    });
    const u = updateResidentOtherCharge(db, adminActor, home.id, res.id, chargeId, {
      amountMinor: 250_00,
    });
    expect(u).toMatchObject({
      type: "registration",
      amountMinor: 250_00,
    });
  });

  it("patches deposit amount to zero (waiver)", () => {
    const { db, home, res, chargeId } = seedResidentWithOtherCharge({
      type: "deposit",
    });
    const u = updateResidentOtherCharge(db, adminActor, home.id, res.id, chargeId, {
      amountMinor: 0,
    });
    expect(u).toMatchObject({
      type: "deposit",
      amountMinor: 0,
    });
  });

  it("rejects negative amountMinor", () => {
    const { db, home, res, chargeId } = seedResidentWithOtherCharge({
      type: "registration",
    });
    expect(() =>
      updateResidentOtherCharge(db, adminActor, home.id, res.id, chargeId, {
        amountMinor: -1,
      }),
    ).toThrow(ValidationError);
  });

  it("rejects care staff", () => {
    const { db, home, res, chargeId } = seedResidentWithOtherCharge({
      type: "registration",
    });
    seedCareUser(db, careActor.userId);
    expect(() =>
      updateResidentOtherCharge(db, careActor, home.id, res.id, chargeId, {
        amountMinor: 1,
      }),
    ).toThrow(ForbiddenError);
  });
});

describe("initialize missing other charges (21d)", () => {
  let dbPath: string;

  beforeEach(() => {
    dbPath = path.join(os.tmpdir(), `village60-oc21d-${randomUUID()}.sqlite`);
    process.env.DATABASE_PATH = dbPath;
    closeDbConnection();
    pushTestSchema(dbPath);
  });

  afterEach(() => {
    closeDbConnection();
    try {
      fs.unlinkSync(dbPath);
    } catch {
      /* ignore */
    }
  });

  it("creates registration and deposit with default zero when none exist", () => {
    const db = getDb();
    seedAdminUser(db, adminActor.userId);
    const home = createHome(db, "admin", {
      name: "H",
      defaultCurrencyCode: "NZD",
    });
    const ward = createWard(db, adminActor, home.id, {
      label: "W1",
      monthlyRatePerPersonMinor: 1000,
    });
    const res = createResident(db, adminActor, {
      homeId: home.id,
      fullName: "Pat Resident",
      dob: "1950-01-01",
      admissionDate: "2024-01-01",
      wardId: ward.id,
    });

    const out = initializeMissingResidentOtherCharges(
      db,
      adminActor,
      home.id,
      res.id,
    );
    expect(out.createdTypes).toEqual(["registration", "deposit"]);
    expect(out.otherCharges.map((x) => x.type)).toEqual([
      "deposit",
      "registration",
    ]);
    for (const row of out.otherCharges) {
      expect(row).toMatchObject({
        amountMinor: 0,
      });
    }
  });

  it("adds only the missing type when one line already exists", () => {
    const db = getDb();
    seedAdminUser(db, adminActor.userId);
    const home = createHome(db, "admin", {
      name: "H",
      defaultCurrencyCode: "NZD",
    });
    const ward = createWard(db, adminActor, home.id, {
      label: "W1",
      monthlyRatePerPersonMinor: 1000,
    });
    const res = createResident(db, adminActor, {
      homeId: home.id,
      fullName: "Pat Resident",
      dob: "1950-01-01",
      admissionDate: "2024-01-01",
      wardId: ward.id,
    });
    seedOtherChargeLineItems(db, home.id, res.id, [
      { type: "registration", amountMinor: 100 },
    ]);

    const out = initializeMissingResidentOtherCharges(
      db,
      adminActor,
      home.id,
      res.id,
    );
    expect(out.createdTypes).toEqual(["deposit"]);
    expect(out.otherCharges.map((x) => x.type)).toEqual([
      "deposit",
      "registration",
    ]);
    const dep = out.otherCharges.find((x) => x.type === "deposit");
    expect(dep).toMatchObject({ amountMinor: 0 });
  });

  it("is a no-op when both lines already exist", () => {
    const db = getDb();
    seedAdminUser(db, adminActor.userId);
    const home = createHome(db, "admin", {
      name: "H",
      defaultCurrencyCode: "NZD",
    });
    const ward = createWard(db, adminActor, home.id, {
      label: "W1",
      monthlyRatePerPersonMinor: 1000,
    });
    const res = createResident(db, adminActor, {
      homeId: home.id,
      fullName: "Pat Resident",
      dob: "1950-01-01",
      admissionDate: "2024-01-01",
      wardId: ward.id,
    });
    const out1 = initializeMissingResidentOtherCharges(
      db,
      adminActor,
      home.id,
      res.id,
    );
    const out2 = initializeMissingResidentOtherCharges(
      db,
      adminActor,
      home.id,
      res.id,
    );
    expect(out1.createdTypes).toEqual(["registration", "deposit"]);
    expect(out2.createdTypes).toEqual([]);
    expect(out2.otherCharges).toEqual(out1.otherCharges);
  });

  it("rejects care staff", () => {
    const db = getDb();
    seedAdminUser(db, adminActor.userId);
    seedCareUser(db, careActor.userId);
    const home = createHome(db, "admin", {
      name: "H",
      defaultCurrencyCode: "NZD",
    });
    const ward = createWard(db, adminActor, home.id, {
      label: "W1",
      monthlyRatePerPersonMinor: 1000,
    });
    const res = createResident(db, adminActor, {
      homeId: home.id,
      fullName: "Pat Resident",
      dob: "1950-01-01",
      admissionDate: "2024-01-01",
      wardId: ward.id,
    });

    expect(() =>
      initializeMissingResidentOtherCharges(
        db,
        careActor,
        home.id,
        res.id,
      ),
    ).toThrow(ForbiddenError);
  });

  it("returns 404 scope when resident is not in the home", () => {
    const db = getDb();
    seedAdminUser(db, adminActor.userId);
    const homeA = createHome(db, "admin", {
      name: "A",
      defaultCurrencyCode: "NZD",
    });
    const homeB = createHome(db, "admin", {
      name: "B",
      defaultCurrencyCode: "NZD",
    });
    const wardA = createWard(db, adminActor, homeA.id, {
      label: "W",
      monthlyRatePerPersonMinor: 1000,
    });
    const res = createResident(db, adminActor, {
      homeId: homeA.id,
      fullName: "Pat Resident",
      dob: "1950-01-01",
      admissionDate: "2024-01-01",
      wardId: wardA.id,
    });

    expect(() =>
      initializeMissingResidentOtherCharges(db, adminActor, homeB.id, res.id),
    ).toThrow(NotFoundError);
  });

  it("after initialize, PATCH updates amount on an unrecorded line", () => {
    const db = getDb();
    seedAdminUser(db, adminActor.userId);
    const home = createHome(db, "admin", {
      name: "H",
      defaultCurrencyCode: "NZD",
    });
    const ward = createWard(db, adminActor, home.id, {
      label: "W1",
      monthlyRatePerPersonMinor: 1000,
    });
    const res = createResident(db, adminActor, {
      homeId: home.id,
      fullName: "Pat Resident",
      dob: "1950-01-01",
      admissionDate: "2024-01-01",
      wardId: ward.id,
    });
    const { otherCharges: rows } = initializeMissingResidentOtherCharges(
      db,
      adminActor,
      home.id,
      res.id,
    );
    const regId = rows.find((x) => x.type === "registration")!.id;
    const u = updateResidentOtherCharge(db, adminActor, home.id, res.id, regId, {
      amountMinor: 99_00,
    });
    expect(u).toMatchObject({
      type: "registration",
      amountMinor: 99_00,
    });
  });
});
