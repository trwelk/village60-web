import { randomUUID } from "node:crypto";
import { and, asc, count, desc, eq, inArray, like } from "drizzle-orm";
import {
  assertActorMayAccessHome,
  getCareUserAssignedHomeIds,
} from "@/lib/authz/homeScope";
import type { SessionActor } from "@/lib/authz/sessionActor";
import {
  homes,
  otherCharges,
  residentDepartureDetails,
  residents,
  users,
  wards,
} from "@/db/schema";
import type { AppDb } from "@/lib/homes/service";
import {
  DuplicateResidentError,
  ForbiddenError,
  NotFoundError,
  ResidentDepartConflictError,
  ValidationError,
} from "@/lib/homes/errors";

export type ResidentRow = typeof residents.$inferSelect;

/** Resident row plus departure fields loaded from `resident_departure_details` when present. */
export type Resident = ResidentRow & {
  departureReason: string | null;
  departureAtUtcMs: number | null;
};

/** Client/UI/API shape: portrait file metadata is hidden; use dedicated photo routes. */
export type ResidentPublic = Omit<
  Resident,
  "portraitStoredRelativePath" | "portraitContentType" | "portraitSizeBytes"
> & {
  hasPortrait: boolean;
};

/** Alias used across dashboard tabs — same as {@link ResidentPublic}. */
export type ResidentWithoutFee = ResidentPublic;

/** Resolved registration + deposit lines for atomic create (17c). */
export type CreateResidentOtherChargesIntake = {
  registration: {
    amountMinor: number;
    received: boolean;
    paidOn: string | null;
  };
  deposit: {
    amountMinor: number;
    received: boolean;
    paidOn: string | null;
  };
};

export function residentViewForActor(_actor: SessionActor, r: Resident): ResidentPublic {
  const {
    portraitStoredRelativePath,
    portraitContentType,
    portraitSizeBytes,
    ...rest
  } = r;
  void portraitContentType;
  void portraitSizeBytes;
  return {
    ...rest,
    hasPortrait: Boolean(portraitStoredRelativePath?.trim()),
  };
}

/**
 * Duplicate rule (PRD): trim, collapse internal runs of whitespace, lowercase for
 * case-folding (English Phase 1).
 */
export function normalizeFullNameForUniqueness(raw: string): string {
  return raw.trim().replace(/\s+/g, " ").toLowerCase();
}

function parseIsoDateOnly(raw: string, label: string): string {
  const s = raw.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    throw new ValidationError(`${label} must be an ISO date (YYYY-MM-DD).`);
  }
  const [y, m, d] = s.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (
    dt.getUTCFullYear() !== y ||
    dt.getUTCMonth() !== m - 1 ||
    dt.getUTCDate() !== d
  ) {
    throw new ValidationError(`${label} is not a valid calendar date.`);
  }
  return s;
}

function requireResidentAccess(
  db: AppDb,
  actor: SessionActor | undefined,
  homeId: string,
): asserts actor is SessionActor {
  if (!actor) {
    throw new ForbiddenError();
  }
  assertActorMayAccessHome(db, actor, homeId);
}

function findDuplicate(
  db: AppDb,
  homeId: string,
  dob: string,
  normalizedFullName: string,
): ResidentRow | undefined {
  return db
    .select()
    .from(residents)
    .where(
      and(
        eq(residents.homeId, homeId),
        eq(residents.dob, dob),
        eq(residents.normalizedFullName, normalizedFullName),
      ),
    )
    .get();
}

function reasonFromStorage(raw: string): string | null {
  const t = raw.trim();
  return t === "" ? null : t;
}

function mergeResident(
  row: ResidentRow,
  dep: typeof residentDepartureDetails.$inferSelect | undefined,
): Resident {
  return {
    ...row,
    departureReason:
      dep !== undefined ? reasonFromStorage(dep.reason) : null,
    departureAtUtcMs: dep?.departedAtUtcMs ?? null,
  };
}

function normalizeOptionalPersonLine(raw: string): string | null {
  const t = raw.trim().replace(/\s+/g, " ");
  return t || null;
}

function normalizeOptionalContactLine(raw: string): string | null {
  const t = raw.trim();
  return t || null;
}

function assertWardInHome(
  db: AppDb,
  homeId: string,
  wardId: string | null,
): void {
  if (!wardId) {
    return;
  }
  const w = db.select().from(wards).where(eq(wards.id, wardId)).get();
  if (!w || w.homeId !== homeId) {
    throw new ValidationError("wardId must refer to a ward in this home.");
  }
}

function assertAssignedNurseInHome(
  db: AppDb,
  homeId: string,
  nurseUserId: string | null,
): void {
  if (nurseUserId === null) {
    return;
  }
  const u = db.select().from(users).where(eq(users.id, nurseUserId)).get();
  if (!u || u.role !== "care") {
    throw new ValidationError(
      "assignedNurseUserId must refer to an existing Care user.",
    );
  }
  const nurseHomes = getCareUserAssignedHomeIds(db, nurseUserId);
  if (!nurseHomes.has(homeId)) {
    throw new ValidationError(
      "assignedNurseUserId must be a Care user assigned to this home.",
    );
  }
}

function normalizeOptionalDisplayOverride(raw: string): string | null {
  const t = raw.trim().replace(/\s+/g, " ");
  return t || null;
}

export function createResident(
  db: AppDb,
  actor: SessionActor | undefined,
  input: {
    homeId: string;
    fullName: string;
    dob: string;
    admissionDate: string;
    wardId?: string | null;
    roomText?: string | null;
    nokName?: string | null;
    nokContact?: string | null;
    nokRelationship?: string | null;
    poaSameAsNok?: boolean;
    poaName?: string | null;
    poaContact?: string | null;
    poaRelationship?: string | null;
    assignedNurseUserId?: string | null;
    assignedNurseDisplayOverride?: string | null;
    /** When set, `resident` and exactly two `other_charges` rows are inserted in one transaction (17c). */
    otherChargesIntake?: CreateResidentOtherChargesIntake;
  },
): Resident {
  requireResidentAccess(db, actor, input.homeId);
  const home = db.select().from(homes).where(eq(homes.id, input.homeId)).get();
  if (!home) {
    throw new NotFoundError();
  }

  const fullName = input.fullName.trim().replace(/\s+/g, " ");
  if (!fullName) {
    throw new ValidationError("fullName is required.");
  }
  const normalizedFullName = normalizeFullNameForUniqueness(input.fullName);
  const dob = parseIsoDateOnly(input.dob, "dob");
  const admissionDate = parseIsoDateOnly(input.admissionDate, "admissionDate");

  const wardId =
    input.wardId === undefined || input.wardId === null
      ? null
      : input.wardId;
  assertWardInHome(db, input.homeId, wardId);

  const dup = findDuplicate(db, input.homeId, dob, normalizedFullName);
  if (dup) {
    throw new DuplicateResidentError(dup.id);
  }

  const now = Date.now();
  const id = randomUUID();
  const roomText =
    input.roomText === undefined || input.roomText === null
      ? null
      : input.roomText.trim() || null;
  const nokName =
    input.nokName === undefined || input.nokName === null
      ? null
      : normalizeOptionalPersonLine(input.nokName);
  const nokContact =
    input.nokContact === undefined || input.nokContact === null
      ? null
      : normalizeOptionalContactLine(input.nokContact);
  const nokRelationship =
    input.nokRelationship === undefined || input.nokRelationship === null
      ? null
      : normalizeOptionalPersonLine(input.nokRelationship);
  const poaSameAsNok = input.poaSameAsNok ?? false;
  let poaName =
    input.poaName === undefined || input.poaName === null
      ? null
      : normalizeOptionalPersonLine(input.poaName);
  let poaContact =
    input.poaContact === undefined || input.poaContact === null
      ? null
      : normalizeOptionalContactLine(input.poaContact);
  let poaRelationship =
    input.poaRelationship === undefined || input.poaRelationship === null
      ? null
      : normalizeOptionalPersonLine(input.poaRelationship);
  const assignedNurseUserId =
    input.assignedNurseUserId === undefined || input.assignedNurseUserId === null
      ? null
      : input.assignedNurseUserId;
  const assignedNurseDisplayOverride =
    input.assignedNurseDisplayOverride === undefined ||
    input.assignedNurseDisplayOverride === null
      ? null
      : normalizeOptionalDisplayOverride(input.assignedNurseDisplayOverride);

  assertAssignedNurseInHome(db, input.homeId, assignedNurseUserId);
  if (poaSameAsNok) {
    poaName = null;
    poaContact = null;
    poaRelationship = null;
  }

  const row: ResidentRow = {
    id,
    homeId: input.homeId,
    fullName,
    normalizedFullName,
    dob,
    admissionDate,
    wardId,
    roomText,
    status: "active",
    nokName,
    nokContact,
    nokRelationship,
    poaSameAsNok,
    poaName,
    poaContact,
    poaRelationship,
    assignedNurseUserId,
    assignedNurseDisplayOverride,
    portraitStoredRelativePath: null,
    portraitContentType: null,
    portraitSizeBytes: null,
    portraitUpdatedAtUtcMs: null,
    createdAtUtcMs: now,
    updatedAtUtcMs: now,
  };

  if (!input.otherChargesIntake) {
    db.insert(residents).values(row).run();
    return mergeResident(row, undefined);
  }

  const oc = input.otherChargesIntake;
  const regId = randomUUID();
  const depId = randomUUID();
  db.transaction((tx) => {
    tx.insert(residents).values(row).run();
    tx.insert(otherCharges)
      .values({
        id: regId,
        residentId: id,
        type: "registration",
        amountMinor: oc.registration.amountMinor,
        received: oc.registration.received,
        paidOn: oc.registration.paidOn,
        createdAtUtcMs: now,
        updatedAtUtcMs: now,
      })
      .run();
    tx.insert(otherCharges)
      .values({
        id: depId,
        residentId: id,
        type: "deposit",
        amountMinor: oc.deposit.amountMinor,
        received: oc.deposit.received,
        paidOn: oc.deposit.paidOn,
        createdAtUtcMs: now,
        updatedAtUtcMs: now,
      })
      .run();
  });
  return mergeResident(row, undefined);
}

export type ListResidentsFilters = {
  homeId?: string;
  query?: string;
  status?: "active" | "departed" | "all";
  wardId?: string;
};

/** Matches dashboard ledger pagination (20a). */
export const DEFAULT_RESIDENTS_DIRECTORY_PAGE_SIZE = 25;
export const MAX_RESIDENTS_DIRECTORY_PAGE_SIZE = 100;

type ListResidentsFilterState = {
  whereExpr: ReturnType<typeof and> | undefined;
  earlyEmpty: boolean;
};

function buildListResidentsFilterState(
  db: AppDb,
  actor: SessionActor,
  filters: ListResidentsFilters,
): ListResidentsFilterState {
  const conditions = [];

  if (actor.role === "care") {
    const allowed = getCareUserAssignedHomeIds(db, actor.userId);
    if (allowed.size === 0) {
      return { whereExpr: undefined, earlyEmpty: true };
    }
    if (filters.homeId !== undefined) {
      if (!allowed.has(filters.homeId)) {
        throw new ForbiddenError();
      }
      conditions.push(eq(residents.homeId, filters.homeId));
    } else {
      conditions.push(inArray(residents.homeId, [...allowed]));
    }
  } else if (filters.homeId !== undefined) {
    conditions.push(eq(residents.homeId, filters.homeId));
  }

  const status = filters.status ?? "active";
  if (status === "active") {
    conditions.push(eq(residents.status, "active"));
  } else if (status === "departed") {
    conditions.push(eq(residents.status, "departed"));
  }

  if (filters.wardId !== undefined) {
    conditions.push(eq(residents.wardId, filters.wardId));
  }

  const q = filters.query?.trim();
  if (q) {
    const safe = q.replace(/[%_]/g, "");
    if (safe) {
      conditions.push(like(residents.fullName, `%${safe}%`));
    }
  }

  const whereExpr =
    conditions.length > 0 ? and(...conditions) : undefined;
  return { whereExpr, earlyEmpty: false };
}

const residentDepartureJoin = eq(
  residents.id,
  residentDepartureDetails.residentId,
);

export function listResidents(
  db: AppDb,
  actor: SessionActor | undefined,
  filters: ListResidentsFilters,
): Resident[] {
  if (!actor) {
    throw new ForbiddenError();
  }

  const { whereExpr, earlyEmpty } = buildListResidentsFilterState(
    db,
    actor,
    filters,
  );
  if (earlyEmpty) {
    return [];
  }

  const base = db
    .select({
      resident: residents,
      departure: residentDepartureDetails,
    })
    .from(residents)
    .leftJoin(residentDepartureDetails, residentDepartureJoin);

  const joined = whereExpr
    ? base
        .where(whereExpr)
        .orderBy(asc(residents.fullName), asc(residents.id))
        .all()
    : base.orderBy(asc(residents.fullName), asc(residents.id)).all();
  return joined.map((r) =>
    mergeResident(r.resident, r.departure ?? undefined),
  );
}

export function listResidentsPaged(
  db: AppDb,
  actor: SessionActor | undefined,
  filters: ListResidentsFilters,
  options: { page: number; pageSize: number },
): {
  residents: Resident[];
  totalCount: number;
  page: number;
  pageSize: number;
} {
  if (!actor) {
    throw new ForbiddenError();
  }

  const page = Math.max(1, Math.floor(options.page) || 1);
  let pageSize =
    Math.floor(options.pageSize) || DEFAULT_RESIDENTS_DIRECTORY_PAGE_SIZE;
  pageSize = Math.min(
    MAX_RESIDENTS_DIRECTORY_PAGE_SIZE,
    Math.max(1, pageSize),
  );
  const offset = (page - 1) * pageSize;

  const { whereExpr, earlyEmpty } = buildListResidentsFilterState(
    db,
    actor,
    filters,
  );
  if (earlyEmpty) {
    return { residents: [], totalCount: 0, page, pageSize };
  }

  const countBase = db
    .select({ n: count() })
    .from(residents)
    .leftJoin(residentDepartureDetails, residentDepartureJoin);
  const countRow = whereExpr
    ? countBase.where(whereExpr).get()
    : countBase.get();
  const totalCount = Number(countRow?.n ?? 0);

  const dataBase = db
    .select({
      resident: residents,
      departure: residentDepartureDetails,
    })
    .from(residents)
    .leftJoin(residentDepartureDetails, residentDepartureJoin);

  const joined = whereExpr
    ? dataBase
        .where(whereExpr)
        .orderBy(asc(residents.fullName), asc(residents.id))
        .limit(pageSize)
        .offset(offset)
        .all()
    : dataBase
        .orderBy(asc(residents.fullName), asc(residents.id))
        .limit(pageSize)
        .offset(offset)
        .all();

  return {
    residents: joined.map((r) =>
      mergeResident(r.resident, r.departure ?? undefined),
    ),
    totalCount,
    page,
    pageSize,
  };
}

/**
 * 13c: Per-home departed residents only, ordered by `resident_departure_details.departed_at_utc_ms`
 * descending (newest departure first). Same home access rules as {@link listResidents}.
 */
export function listDepartedResidentsForHome(
  db: AppDb,
  actor: SessionActor | undefined,
  homeId: string,
): Resident[] {
  if (!actor) {
    throw new ForbiddenError();
  }
  if (actor.role === "care") {
    const allowed = getCareUserAssignedHomeIds(db, actor.userId);
    if (!allowed.has(homeId)) {
      throw new ForbiddenError();
    }
  }

  const rows = db
    .select({
      resident: residents,
      departure: residentDepartureDetails,
    })
    .from(residents)
    .innerJoin(
      residentDepartureDetails,
      eq(residents.id, residentDepartureDetails.residentId),
    )
    .where(
      and(eq(residents.homeId, homeId), eq(residents.status, "departed")),
    )
    .orderBy(desc(residentDepartureDetails.departedAtUtcMs))
    .all();

  return rows.map((r) => mergeResident(r.resident, r.departure));
}

export function getResident(
  db: AppDb,
  actor: SessionActor | undefined,
  homeId: string,
  residentId: string,
): Resident {
  requireResidentAccess(db, actor, homeId);
  const row = db
    .select({
      resident: residents,
      departure: residentDepartureDetails,
    })
    .from(residents)
    .leftJoin(
      residentDepartureDetails,
      eq(residents.id, residentDepartureDetails.residentId),
    )
    .where(eq(residents.id, residentId))
    .get();
  if (!row || row.resident.homeId !== homeId) {
    throw new NotFoundError();
  }
  return mergeResident(row.resident, row.departure ?? undefined);
}

/**
 * Marks an active resident as departed: inserts `resident_departure_details` and clears
 * ward/room in one transaction. Use {@link updateResident} for other field edits only.
 * `departedAtUtcMs` is optional for tests; production callers should omit it (server clock).
 */
export function departResident(
  db: AppDb,
  actor: SessionActor | undefined,
  homeId: string,
  residentId: string,
  input: { reason: string; departedAtUtcMs?: number },
): Resident {
  requireResidentAccess(db, actor, homeId);
  const reason = input.reason.trim();
  if (!reason) {
    throw new ValidationError("Reason is required.");
  }
  const atUtc = input.departedAtUtcMs ?? Date.now();
  const existingRow = db
    .select({
      resident: residents,
      departure: residentDepartureDetails,
    })
    .from(residents)
    .leftJoin(
      residentDepartureDetails,
      eq(residents.id, residentDepartureDetails.residentId),
    )
    .where(eq(residents.id, residentId))
    .get();
  if (!existingRow || existingRow.resident.homeId !== homeId) {
    throw new NotFoundError();
  }
  if (
    existingRow.resident.status === "departed" ||
    existingRow.departure != null
  ) {
    throw new ResidentDepartConflictError();
  }
  db.transaction((tx) => {
    tx.insert(residentDepartureDetails)
      .values({
        residentId,
        reason,
        departedAtUtcMs: atUtc,
      })
      .run();
    tx
      .update(residents)
      .set({
        status: "departed",
        wardId: null,
        roomText: null,
        updatedAtUtcMs: atUtc,
      })
      .where(eq(residents.id, residentId))
      .run();
  });
  return getResident(db, actor, homeId, residentId);
}

export function updateResident(
  db: AppDb,
  actor: SessionActor | undefined,
  homeId: string,
  residentId: string,
  input: {
    fullName?: string;
    dob?: string;
    admissionDate?: string;
    wardId?: string | null;
    roomText?: string | null;
    nokName?: string | null;
    nokContact?: string | null;
    nokRelationship?: string | null;
    poaSameAsNok?: boolean;
    poaName?: string | null;
    poaContact?: string | null;
    poaRelationship?: string | null;
    assignedNurseUserId?: string | null;
    assignedNurseDisplayOverride?: string | null;
  },
): Resident {
  requireResidentAccess(db, actor, homeId);
  const existingRow = db
    .select()
    .from(residents)
    .where(eq(residents.id, residentId))
    .get();
  if (!existingRow || existingRow.homeId !== homeId) {
    throw new NotFoundError();
  }
  const existing = existingRow;

  let fullName = existing.fullName;
  let normalizedFullName = existing.normalizedFullName;
  let dob = existing.dob;
  let admissionDate = existing.admissionDate;
  let wardId = existing.wardId;
  let roomText = existing.roomText;
  let nokName = existing.nokName;
  let nokContact = existing.nokContact;
  let nokRelationship = existing.nokRelationship;
  let poaSameAsNok = existing.poaSameAsNok;
  let poaName = existing.poaName;
  let poaContact = existing.poaContact;
  let poaRelationship = existing.poaRelationship;
  let assignedNurseUserId = existing.assignedNurseUserId;
  let assignedNurseDisplayOverride = existing.assignedNurseDisplayOverride;

  if (input.fullName !== undefined) {
    const fn = input.fullName.trim().replace(/\s+/g, " ");
    if (!fn) {
      throw new ValidationError("fullName is required.");
    }
    fullName = fn;
    normalizedFullName = normalizeFullNameForUniqueness(input.fullName);
  }
  if (input.dob !== undefined) {
    dob = parseIsoDateOnly(input.dob, "dob");
  }
  if (input.admissionDate !== undefined) {
    admissionDate = parseIsoDateOnly(input.admissionDate, "admissionDate");
  }
  if (input.wardId !== undefined) {
    wardId = input.wardId;
  }
  assertWardInHome(db, homeId, wardId);
  if (input.roomText !== undefined) {
    roomText =
      input.roomText === null ? null : input.roomText.trim() || null;
  }
  if (existing.status === "departed") {
    wardId = null;
    roomText = null;
  }
  if (input.nokName !== undefined) {
    nokName =
      input.nokName === null
        ? null
        : normalizeOptionalPersonLine(input.nokName);
  }
  if (input.nokContact !== undefined) {
    nokContact =
      input.nokContact === null
        ? null
        : normalizeOptionalContactLine(input.nokContact);
  }
  if (input.nokRelationship !== undefined) {
    nokRelationship =
      input.nokRelationship === null
        ? null
        : normalizeOptionalPersonLine(input.nokRelationship);
  }
  if (input.poaSameAsNok !== undefined) {
    poaSameAsNok = input.poaSameAsNok;
  }
  if (input.poaName !== undefined) {
    poaName =
      input.poaName === null
        ? null
        : normalizeOptionalPersonLine(input.poaName);
  }
  if (input.poaContact !== undefined) {
    poaContact =
      input.poaContact === null
        ? null
        : normalizeOptionalContactLine(input.poaContact);
  }
  if (input.poaRelationship !== undefined) {
    poaRelationship =
      input.poaRelationship === null
        ? null
        : normalizeOptionalPersonLine(input.poaRelationship);
  }
  if (input.assignedNurseUserId !== undefined) {
    assignedNurseUserId = input.assignedNurseUserId;
  }
  if (input.assignedNurseDisplayOverride !== undefined) {
    assignedNurseDisplayOverride =
      input.assignedNurseDisplayOverride === null
        ? null
        : normalizeOptionalDisplayOverride(input.assignedNurseDisplayOverride);
  }

  assertAssignedNurseInHome(db, homeId, assignedNurseUserId);

  if (poaSameAsNok) {
    poaName = null;
    poaContact = null;
    poaRelationship = null;
  }

  const dup = findDuplicate(db, homeId, dob, normalizedFullName);
  if (dup && dup.id !== residentId) {
    throw new DuplicateResidentError(dup.id);
  }

  const now = Date.now();
  db.update(residents)
    .set({
      fullName,
      normalizedFullName,
      dob,
      admissionDate,
      wardId,
      roomText,
      nokName,
      nokContact,
      nokRelationship,
      poaSameAsNok,
      poaName,
      poaContact,
      poaRelationship,
      assignedNurseUserId,
      assignedNurseDisplayOverride,
      updatedAtUtcMs: now,
    })
    .where(eq(residents.id, residentId))
    .run();

  const updated = db
    .select({
      resident: residents,
      departure: residentDepartureDetails,
    })
    .from(residents)
    .leftJoin(
      residentDepartureDetails,
      eq(residents.id, residentDepartureDetails.residentId),
    )
    .where(eq(residents.id, residentId))
    .get();
  if (!updated) {
    throw new NotFoundError();
  }
  return mergeResident(updated.resident, updated.departure ?? undefined);
}
