import { randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { closeDbConnection, getDb } from "@/db/client";
import { residentDepartureDetails } from "@/db/schema";
import { createHome } from "@/lib/homes/service";
import {
  DuplicateResidentError,
  ForbiddenError,
  NotFoundError,
  ResidentDepartConflictError,
  ValidationError,
} from "@/lib/homes/errors";
import { createUser } from "@/lib/users/service";
import { createWard } from "@/lib/wards/service";
import {
  createResident,
  DEFAULT_RESIDENTS_DIRECTORY_PAGE_SIZE,
  departResident,
  getResident,
  listDepartedResidentsForHome,
  listResidents,
  listResidentsPaged,
  MAX_RESIDENTS_DIRECTORY_PAGE_SIZE,
  updateResident,
} from "./service";

const STRONG = "ChangeMeNow!1";
const adminActor = { userId: "admin-actor", role: "admin" as const };

function runMigrations(file: string) {
  const sqlite = new Database(file);
  const db = drizzle(sqlite);
  migrate(db, { migrationsFolder: path.join(process.cwd(), "drizzle") });
  sqlite.close();
}

describe("residents (06 core + directory)", () => {
  let dbPath: string;

  beforeEach(() => {
    dbPath = path.join(os.tmpdir(), `village60-residents-${randomUUID()}.sqlite`);
    process.env.DATABASE_PATH = dbPath;
    closeDbConnection();
    runMigrations(dbPath);
  });

  afterEach(() => {
    closeDbConnection();
    try {
      fs.unlinkSync(dbPath);
    } catch {
      /* ignore */
    }
  });

  it("lets an Admin create a resident with demographics and date-only fields", () => {
    const db = getDb();
    const home = createHome(db, "admin", {
      name: "Sunrise",
      defaultCurrencyCode: "NZD",
    });
    const r = createResident(db, adminActor, {
      homeId: home.id,
      fullName: "  Morgan Lee  ",
      dob: "1940-05-12",
      admissionDate: "2024-01-15",
    });
    expect(r.homeId).toBe(home.id);
    expect(r.fullName).toBe("Morgan Lee");
    expect(r.dob).toBe("1940-05-12");
    expect(r.admissionDate).toBe("2024-01-15");
    expect(r.status).toBe("active");
    expect(r.normalizedFullName).toBe("morgan lee");
  });

  it("blocks create when home + DOB + normalized full name match an existing resident", () => {
    const db = getDb();
    const home = createHome(db, "admin", {
      name: "H",
      defaultCurrencyCode: "NZD",
    });
    createResident(db, adminActor, {
      homeId: home.id,
      fullName: "Jane Doe",
      dob: "1955-03-01",
      admissionDate: "2024-06-01",
    });
    expect(() =>
      createResident(db, adminActor, {
        homeId: home.id,
        fullName: "  JANE   DOE ",
        dob: "1955-03-01",
        admissionDate: "2024-07-01",
      }),
    ).toThrow(DuplicateResidentError);
    try {
      createResident(db, adminActor, {
        homeId: home.id,
        fullName: "jane doe",
        dob: "1955-03-01",
        admissionDate: "2024-07-01",
      });
    } catch (e) {
      expect(e).toBeInstanceOf(DuplicateResidentError);
      expect((e as DuplicateResidentError).existingResidentId).toBeDefined();
    }
  });

  it("lets a Care user create a resident in an assigned home", async () => {
    const db = getDb();
    const home = createHome(db, "admin", {
      name: "H",
      defaultCurrencyCode: "NZD",
    });
    const care = await createUser(db, "admin", {
      email: "care-res-create@example.com",
      password: STRONG,
      role: "care",
      primaryHomeId: home.id,
    });
    const r = createResident(db, { userId: care.id, role: "care" }, {
      homeId: home.id,
      fullName: "Pat Smith",
      dob: "1960-11-20",
      admissionDate: "2025-01-01",
    });
    expect(r.fullName).toBe("Pat Smith");
  });

  it("does not let a Care user create a resident for a non-assigned home", async () => {
    const db = getDb();
    const assigned = createHome(db, "admin", {
      name: "Mine",
      defaultCurrencyCode: "NZD",
    });
    const other = createHome(db, "admin", {
      name: "Other",
      defaultCurrencyCode: "NZD",
    });
    const care = await createUser(db, "admin", {
      email: "care-res-x@example.com",
      password: STRONG,
      role: "care",
      primaryHomeId: assigned.id,
    });
    expect(() =>
      createResident(db, { userId: care.id, role: "care" }, {
        homeId: other.id,
        fullName: "X",
        dob: "1950-01-01",
        admissionDate: "2025-01-01",
      }),
    ).toThrow(ForbiddenError);
  });

  it("lists active residents by default and supports search + filters", () => {
    const db = getDb();
    const a = createHome(db, "admin", {
      name: "Home A",
      defaultCurrencyCode: "NZD",
    });
    const b = createHome(db, "admin", {
      name: "Home B",
      defaultCurrencyCode: "NZD",
    });
    const w = createWard(db, adminActor, a.id, { label: "North" });
    const departedInWard = createResident(db, adminActor, {
      homeId: a.id,
      fullName: "Alex Departed",
      dob: "1942-01-01",
      admissionDate: "2024-01-01",
      wardId: w.id,
    });
    createResident(db, adminActor, {
      homeId: a.id,
      fullName: "Bob Active",
      dob: "1943-02-02",
      admissionDate: "2024-02-01",
    });
    createResident(db, adminActor, {
      homeId: a.id,
      fullName: "Ward North Resident",
      dob: "1945-04-04",
      admissionDate: "2024-04-01",
      wardId: w.id,
    });
    departResident(db, adminActor, a.id, departedInWard.id, {
      reason: "Transfer",
      departedAtUtcMs: 1,
    });
    createResident(db, adminActor, {
      homeId: b.id,
      fullName: "Other Site",
      dob: "1944-03-03",
      admissionDate: "2024-03-01",
    });

    const activeDefault = listResidents(db, adminActor, {});
    expect(activeDefault.map((x) => x.fullName).sort()).toEqual(
      ["Bob Active", "Other Site", "Ward North Resident"].sort(),
    );

    const departed = listResidents(db, adminActor, { status: "departed" });
    expect(departed.map((x) => x.fullName)).toEqual(["Alex Departed"]);

    const homeA = listResidents(db, adminActor, { homeId: a.id });
    expect(homeA.map((x) => x.fullName).sort()).toEqual(
      ["Bob Active", "Ward North Resident"].sort(),
    );

    const wardNorth = listResidents(db, adminActor, { homeId: a.id, wardId: w.id });
    expect(wardNorth.map((x) => x.fullName)).toEqual(["Ward North Resident"]);

    const search = listResidents(db, adminActor, { query: "North" });
    expect(search.map((x) => x.fullName)).toEqual(["Ward North Resident"]);

    const dep = db
      .select()
      .from(residentDepartureDetails)
      .where(eq(residentDepartureDetails.residentId, departedInWard.id))
      .get();
    expect(dep?.reason).toBe("Transfer");
    expect(dep?.departedAtUtcMs).toBe(1);
  });

  it("scopes Care list to assigned homes and defaults to active only", async () => {
    const db = getDb();
    const mine = createHome(db, "admin", {
      name: "Mine",
      defaultCurrencyCode: "NZD",
    });
    const other = createHome(db, "admin", {
      name: "Other",
      defaultCurrencyCode: "NZD",
    });
    createResident(db, adminActor, {
      homeId: mine.id,
      fullName: "In Mine",
      dob: "1950-01-01",
      admissionDate: "2025-01-01",
    });
    createResident(db, adminActor, {
      homeId: other.id,
      fullName: "Secret",
      dob: "1951-01-01",
      admissionDate: "2025-01-01",
    });
    const care = await createUser(db, "admin", {
      email: "care-res-list@example.com",
      password: STRONG,
      role: "care",
      primaryHomeId: mine.id,
    });
    const rows = listResidents(db, { userId: care.id, role: "care" }, {});
    expect(rows.map((r) => r.fullName)).toEqual(["In Mine"]);
    expect(() =>
      listResidents(db, { userId: care.id, role: "care" }, { homeId: other.id }),
    ).toThrow(ForbiddenError);
  });

  it("22a: listResidentsPaged returns second page, totalCount, and max pageSize", () => {
    const db = getDb();
    const home = createHome(db, "admin", {
      name: "Paged Home",
      defaultCurrencyCode: "NZD",
    });
    createResident(db, adminActor, {
      homeId: home.id,
      fullName: "Alpha A",
      dob: "1940-01-01",
      admissionDate: "2024-01-01",
    });
    createResident(db, adminActor, {
      homeId: home.id,
      fullName: "Bravo B",
      dob: "1940-02-02",
      admissionDate: "2024-02-01",
    });
    createResident(db, adminActor, {
      homeId: home.id,
      fullName: "Charlie C",
      dob: "1940-03-03",
      admissionDate: "2024-03-01",
    });

    const p1 = listResidentsPaged(db, adminActor, { homeId: home.id }, {
      page: 1,
      pageSize: 1,
    });
    expect(p1.totalCount).toBe(3);
    expect(p1.residents.map((r) => r.fullName)).toEqual(["Alpha A"]);
    expect(p1.pageSize).toBe(1);

    const p2 = listResidentsPaged(db, adminActor, { homeId: home.id }, {
      page: 2,
      pageSize: 1,
    });
    expect(p2.totalCount).toBe(3);
    expect(p2.residents.map((r) => r.fullName)).toEqual(["Bravo B"]);

    const huge = listResidentsPaged(db, adminActor, { homeId: home.id }, {
      page: 1,
      pageSize: 500,
    });
    expect(huge.pageSize).toBe(MAX_RESIDENTS_DIRECTORY_PAGE_SIZE);
    expect(huge.residents).toHaveLength(3);
  });

  it("22a: page beyond last returns empty rows with correct totalCount", () => {
    const db = getDb();
    const home = createHome(db, "admin", {
      name: "H",
      defaultCurrencyCode: "NZD",
    });
    createResident(db, adminActor, {
      homeId: home.id,
      fullName: "Only",
      dob: "1950-01-01",
      admissionDate: "2025-01-01",
    });
    const out = listResidentsPaged(db, adminActor, { homeId: home.id }, {
      page: 99,
      pageSize: 10,
    });
    expect(out.totalCount).toBe(1);
    expect(out.residents).toEqual([]);
  });

  it("22a: stable order uses id tie-break when fullName matches", () => {
    const db = getDb();
    const home = createHome(db, "admin", {
      name: "H",
      defaultCurrencyCode: "NZD",
    });
    const rLater = createResident(db, adminActor, {
      homeId: home.id,
      fullName: "Same Name",
      dob: "1951-01-01",
      admissionDate: "2025-02-01",
    });
    const rEarlier = createResident(db, adminActor, {
      homeId: home.id,
      fullName: "Same Name",
      dob: "1950-01-01",
      admissionDate: "2025-01-01",
    });
    const rows = listResidentsPaged(db, adminActor, { homeId: home.id }, {
      page: 1,
      pageSize: 10,
    }).residents;
    expect(rows.map((r) => r.id)).toEqual(
      [rEarlier.id, rLater.id].sort((a, b) => a.localeCompare(b)),
    );
  });

  it("22a: Care paged list respects home scope", async () => {
    const db = getDb();
    const mine = createHome(db, "admin", {
      name: "Mine",
      defaultCurrencyCode: "NZD",
    });
    const other = createHome(db, "admin", {
      name: "Other",
      defaultCurrencyCode: "NZD",
    });
    createResident(db, adminActor, {
      homeId: mine.id,
      fullName: "In Mine",
      dob: "1950-01-01",
      admissionDate: "2025-01-01",
    });
    createResident(db, adminActor, {
      homeId: other.id,
      fullName: "Secret",
      dob: "1951-01-01",
      admissionDate: "2025-01-01",
    });
    const care = await createUser(db, "admin", {
      email: "care-paged@example.com",
      password: STRONG,
      role: "care",
      primaryHomeId: mine.id,
    });
    const actor = { userId: care.id, role: "care" as const };
    const out = listResidentsPaged(db, actor, {}, {
      page: 1,
      pageSize: DEFAULT_RESIDENTS_DIRECTORY_PAGE_SIZE,
    });
    expect(out.totalCount).toBe(1);
    expect(out.residents[0]?.fullName).toBe("In Mine");
    expect(() =>
      listResidentsPaged(db, actor, { homeId: other.id }, { page: 1, pageSize: 10 }),
    ).toThrow(ForbiddenError);
  });

  it("rejects invalid date-only strings", () => {
    const db = getDb();
    const home = createHome(db, "admin", {
      name: "H",
      defaultCurrencyCode: "NZD",
    });
    expect(() =>
      createResident(db, adminActor, {
        homeId: home.id,
        fullName: "X",
        dob: "not-a-date",
        admissionDate: "2025-01-01",
      }),
    ).toThrow(ValidationError);
    expect(() =>
      createResident(db, adminActor, {
        homeId: home.id,
        fullName: "X",
        dob: "2025-02-29",
        admissionDate: "2025-01-01",
      }),
    ).toThrow(ValidationError);
  });

  it("rejects create for a missing home", () => {
    const db = getDb();
    expect(() =>
      createResident(db, adminActor, {
        homeId: randomUUID(),
        fullName: "X",
        dob: "1950-01-01",
        admissionDate: "2025-01-01",
      }),
    ).toThrow(NotFoundError);
  });

  it("persists next of kin on update and returns it from getResident", () => {
    const db = getDb();
    const home = createHome(db, "admin", {
      name: "H",
      defaultCurrencyCode: "NZD",
    });
    const r = createResident(db, adminActor, {
      homeId: home.id,
      fullName: "A Person",
      dob: "1950-01-01",
      admissionDate: "2024-01-01",
    });
    expect(r.nokName).toBeNull();
    expect(r.poaSameAsNok).toBe(false);

    const updated = updateResident(db, adminActor, home.id, r.id, {
      nokName: "  Jane   Doe ",
      nokContact: " 021 123 456 ",
      nokRelationship: " daughter ",
    });
    expect(updated.nokName).toBe("Jane Doe");
    expect(updated.nokContact).toBe("021 123 456");
    expect(updated.nokRelationship).toBe("daughter");

    const again = getResident(db, adminActor, home.id, r.id);
    expect(again.nokName).toBe("Jane Doe");
    expect(again.nokContact).toBe("021 123 456");
    expect(again.nokRelationship).toBe("daughter");
  });

  it("persists separate POA when not same as next of kin", () => {
    const db = getDb();
    const home = createHome(db, "admin", {
      name: "H2",
      defaultCurrencyCode: "NZD",
    });
    const r = createResident(db, adminActor, {
      homeId: home.id,
      fullName: "B Person",
      dob: "1951-02-02",
      admissionDate: "2024-02-01",
    });
    const updated = updateResident(db, adminActor, home.id, r.id, {
      poaSameAsNok: false,
      poaName: "  Legal Rep ",
      poaContact: "09 555 0100",
      poaRelationship: "EPA (property)",
    });
    expect(updated.poaSameAsNok).toBe(false);
    expect(updated.poaName).toBe("Legal Rep");
    expect(updated.poaContact).toBe("09 555 0100");
    expect(updated.poaRelationship).toBe("EPA (property)");
  });

  it("stores null POA fields when POA same as NOK even if POA values are sent", () => {
    const db = getDb();
    const home = createHome(db, "admin", {
      name: "H3",
      defaultCurrencyCode: "NZD",
    });
    const r = createResident(db, adminActor, {
      homeId: home.id,
      fullName: "C Person",
      dob: "1952-03-03",
      admissionDate: "2024-03-01",
    });
    updateResident(db, adminActor, home.id, r.id, {
      nokName: "Kin Only",
      nokContact: "111",
      nokRelationship: "child",
      poaSameAsNok: true,
      poaName: "Should Not Stick",
      poaContact: "222",
      poaRelationship: "ignored",
    });
    const row = getResident(db, adminActor, home.id, r.id);
    expect(row.poaSameAsNok).toBe(true);
    expect(row.nokName).toBe("Kin Only");
    expect(row.poaName).toBeNull();
    expect(row.poaContact).toBeNull();
    expect(row.poaRelationship).toBeNull();
  });

  it("clears stored POA when switching to POA same as next of kin", () => {
    const db = getDb();
    const home = createHome(db, "admin", {
      name: "H4",
      defaultCurrencyCode: "NZD",
    });
    const r = createResident(db, adminActor, {
      homeId: home.id,
      fullName: "D Person",
      dob: "1953-04-04",
      admissionDate: "2024-04-01",
    });
    updateResident(db, adminActor, home.id, r.id, {
      poaSameAsNok: false,
      poaName: "Solicitor",
      poaContact: "333",
      poaRelationship: "lawyer",
    });
    updateResident(db, adminActor, home.id, r.id, {
      poaSameAsNok: true,
    });
    const row = getResident(db, adminActor, home.id, r.id);
    expect(row.poaSameAsNok).toBe(true);
    expect(row.poaName).toBeNull();
    expect(row.poaContact).toBeNull();
    expect(row.poaRelationship).toBeNull();
  });
});

describe("residents (09 nurse assignment)", () => {
  let dbPath: string;

  beforeEach(() => {
    dbPath = path.join(os.tmpdir(), `village60-res09-${randomUUID()}.sqlite`);
    process.env.DATABASE_PATH = dbPath;
    closeDbConnection();
    runMigrations(dbPath);
  });

  afterEach(() => {
    closeDbConnection();
    try {
      fs.unlinkSync(dbPath);
    } catch {
      /* ignore */
    }
  });

  it("lets Care assign a nurse who is in scope for the home", async () => {
    const db = getDb();
    const home = createHome(db, "admin", {
      name: "H",
      defaultCurrencyCode: "NZD",
    });
    const nurse = await createUser(db, "admin", {
      email: "nurse-a@example.com",
      password: STRONG,
      role: "care",
      primaryHomeId: home.id,
    });
    const r = createResident(db, adminActor, {
      homeId: home.id,
      fullName: "Nursed",
      dob: "1940-04-04",
      admissionDate: "2024-04-04",
    });
    const updated = updateResident(
      db,
      { userId: nurse.id, role: "care" },
      home.id,
      r.id,
      {
        assignedNurseUserId: nurse.id,
        assignedNurseDisplayOverride: "  Agency  Care ",
      },
    );
    expect(updated.assignedNurseUserId).toBe(nurse.id);
    expect(updated.assignedNurseDisplayOverride).toBe("Agency Care");
  });

  it("rejects assigned nurse who is not a Care user in this home", async () => {
    const db = getDb();
    const home = createHome(db, "admin", {
      name: "H",
      defaultCurrencyCode: "NZD",
    });
    const other = createHome(db, "admin", {
      name: "Other",
      defaultCurrencyCode: "NZD",
    });
    const floater = await createUser(db, "admin", {
      email: "floater@example.com",
      password: STRONG,
      role: "care",
      primaryHomeId: other.id,
    });
    const r = createResident(db, adminActor, {
      homeId: home.id,
      fullName: "X",
      dob: "1939-09-09",
      admissionDate: "2024-09-09",
    });
    expect(() =>
      updateResident(db, adminActor, home.id, r.id, {
        assignedNurseUserId: floater.id,
      }),
    ).toThrow(ValidationError);
  });
});

describe("residents (13b depart transaction)", () => {
  let dbPath: string;

  beforeEach(() => {
    dbPath = path.join(os.tmpdir(), `village60-res13b-${randomUUID()}.sqlite`);
    process.env.DATABASE_PATH = dbPath;
    closeDbConnection();
    runMigrations(dbPath);
  });

  afterEach(() => {
    closeDbConnection();
    try {
      fs.unlinkSync(dbPath);
    } catch {
      /* ignore */
    }
  });

  it("departResident sets departed status, clears placement, and stores details in one transaction", () => {
    const db = getDb();
    const home = createHome(db, "admin", {
      name: "H",
      defaultCurrencyCode: "NZD",
    });
    const w = createWard(db, adminActor, home.id, { label: "North" });
    const r = createResident(db, adminActor, {
      homeId: home.id,
      fullName: "Alex",
      dob: "1940-01-01",
      admissionDate: "2024-01-01",
      wardId: w.id,
      roomText: "12A",
    });
    const at = 9_000_000;
    const out = departResident(db, adminActor, home.id, r.id, {
      reason: "  Transfer to hospital  ",
      departedAtUtcMs: at,
    });
    expect(out.status).toBe("departed");
    expect(out.wardId).toBeNull();
    expect(out.roomText).toBeNull();
    expect(out.departureReason).toBe("Transfer to hospital");
    expect(out.departureAtUtcMs).toBe(at);

    const row = db
      .select()
      .from(residentDepartureDetails)
      .where(eq(residentDepartureDetails.residentId, r.id))
      .get();
    expect(row?.reason.trim()).toBe("Transfer to hospital");
    expect(row?.departedAtUtcMs).toBe(at);
  });

  it("rejects depart with empty reason after trim", () => {
    const db = getDb();
    const home = createHome(db, "admin", {
      name: "H",
      defaultCurrencyCode: "NZD",
    });
    const r = createResident(db, adminActor, {
      homeId: home.id,
      fullName: "Bob",
      dob: "1941-02-02",
      admissionDate: "2024-02-02",
    });
    expect(() =>
      departResident(db, adminActor, home.id, r.id, { reason: "   " }),
    ).toThrow(ValidationError);
  });

  it("rejects a second depart on the same resident", () => {
    const db = getDb();
    const home = createHome(db, "admin", {
      name: "H",
      defaultCurrencyCode: "NZD",
    });
    const r = createResident(db, adminActor, {
      homeId: home.id,
      fullName: "Cee",
      dob: "1942-03-03",
      admissionDate: "2024-03-03",
    });
    departResident(db, adminActor, home.id, r.id, { reason: "First" });
    expect(() =>
      departResident(db, adminActor, home.id, r.id, { reason: "Again" }),
    ).toThrow(ResidentDepartConflictError);
  });

  it("lets Care depart a resident in an assigned home", async () => {
    const db = getDb();
    const home = createHome(db, "admin", {
      name: "H",
      defaultCurrencyCode: "NZD",
    });
    const care = await createUser(db, "admin", {
      email: "care-depart@example.com",
      password: STRONG,
      role: "care",
      primaryHomeId: home.id,
    });
    const r = createResident(db, adminActor, {
      homeId: home.id,
      fullName: "Pat",
      dob: "1950-01-01",
      admissionDate: "2025-01-01",
    });
    const out = departResident(
      db,
      { userId: care.id, role: "care" },
      home.id,
      r.id,
      { reason: "Discharge" },
    );
    expect(out.status).toBe("departed");
  });

  it("does not let Care depart a resident in a non-assigned home", async () => {
    const db = getDb();
    const assigned = createHome(db, "admin", {
      name: "Mine",
      defaultCurrencyCode: "NZD",
    });
    const other = createHome(db, "admin", {
      name: "Other",
      defaultCurrencyCode: "NZD",
    });
    const care = await createUser(db, "admin", {
      email: "care-depart-x@example.com",
      password: STRONG,
      role: "care",
      primaryHomeId: assigned.id,
    });
    const r = createResident(db, adminActor, {
      homeId: other.id,
      fullName: "Elsewhere",
      dob: "1951-01-01",
      admissionDate: "2025-01-01",
    });
    expect(() =>
      departResident(
        db,
        { userId: care.id, role: "care" },
        other.id,
        r.id,
        { reason: "X" },
      ),
    ).toThrow(ForbiddenError);
  });
});

describe("residents (13c per-home departed list)", () => {
  let dbPath: string;

  beforeEach(() => {
    dbPath = path.join(os.tmpdir(), `village60-res13c-${randomUUID()}.sqlite`);
    process.env.DATABASE_PATH = dbPath;
    closeDbConnection();
    runMigrations(dbPath);
  });

  afterEach(() => {
    closeDbConnection();
    try {
      fs.unlinkSync(dbPath);
    } catch {
      /* ignore */
    }
  });

  it("lists departed residents for a home ordered by departure time descending", () => {
    const db = getDb();
    const home = createHome(db, "admin", {
      name: "H",
      defaultCurrencyCode: "NZD",
    });
    const older = createResident(db, adminActor, {
      homeId: home.id,
      fullName: "Older First",
      dob: "1940-01-01",
      admissionDate: "2024-01-01",
    });
    const newer = createResident(db, adminActor, {
      homeId: home.id,
      fullName: "Newer Second",
      dob: "1941-02-02",
      admissionDate: "2024-02-02",
    });
    departResident(db, adminActor, home.id, older.id, {
      reason: "A",
      departedAtUtcMs: 1000,
    });
    departResident(db, adminActor, home.id, newer.id, {
      reason: "B",
      departedAtUtcMs: 999_000,
    });
    const rows = listDepartedResidentsForHome(db, adminActor, home.id);
    expect(rows.map((r) => r.fullName)).toEqual(["Newer Second", "Older First"]);
    expect(rows[0]?.departureAtUtcMs).toBe(999_000);
    expect(rows[0]?.departureReason).toBe("B");
    expect(rows[1]?.departureReason).toBe("A");
  });

  it("only lists departed residents for the requested home", () => {
    const db = getDb();
    const homeA = createHome(db, "admin", {
      name: "A",
      defaultCurrencyCode: "NZD",
    });
    const homeB = createHome(db, "admin", {
      name: "B",
      defaultCurrencyCode: "NZD",
    });
    const inA = createResident(db, adminActor, {
      homeId: homeA.id,
      fullName: "In A",
      dob: "1940-01-01",
      admissionDate: "2024-01-01",
    });
    const inB = createResident(db, adminActor, {
      homeId: homeB.id,
      fullName: "In B",
      dob: "1941-02-02",
      admissionDate: "2024-02-02",
    });
    departResident(db, adminActor, homeA.id, inA.id, { reason: "Left A" });
    departResident(db, adminActor, homeB.id, inB.id, { reason: "Left B" });
    const rows = listDepartedResidentsForHome(db, adminActor, homeA.id);
    expect(rows.map((r) => r.fullName)).toEqual(["In A"]);
  });

  it("does not let Care list departed residents for a non-assigned home", async () => {
    const db = getDb();
    const assigned = createHome(db, "admin", {
      name: "Mine",
      defaultCurrencyCode: "NZD",
    });
    const other = createHome(db, "admin", {
      name: "Other",
      defaultCurrencyCode: "NZD",
    });
    const care = await createUser(db, "admin", {
      email: "care-departed-list@example.com",
      password: STRONG,
      role: "care",
      primaryHomeId: assigned.id,
    });
    const r = createResident(db, adminActor, {
      homeId: other.id,
      fullName: "Elsewhere",
      dob: "1950-01-01",
      admissionDate: "2025-01-01",
    });
    departResident(db, adminActor, other.id, r.id, { reason: "X" });
    expect(() =>
      listDepartedResidentsForHome(db, { userId: care.id, role: "care" }, other.id),
    ).toThrow(ForbiddenError);
  });

  it("lets Care list departed residents for an assigned home", async () => {
    const db = getDb();
    const home = createHome(db, "admin", {
      name: "H",
      defaultCurrencyCode: "NZD",
    });
    const care = await createUser(db, "admin", {
      email: "care-departed-ok@example.com",
      password: STRONG,
      role: "care",
      primaryHomeId: home.id,
    });
    const r = createResident(db, adminActor, {
      homeId: home.id,
      fullName: "Pat",
      dob: "1950-01-01",
      admissionDate: "2025-01-01",
    });
    departResident(db, adminActor, home.id, r.id, { reason: "Discharge" });
    const rows = listDepartedResidentsForHome(db, { userId: care.id, role: "care" }, home.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.fullName).toBe("Pat");
    expect(rows[0]?.departureReason).toBe("Discharge");
  });
});
