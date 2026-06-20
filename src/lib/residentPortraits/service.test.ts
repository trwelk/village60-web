import { randomUUID } from "node:crypto";
import Database from "better-sqlite3";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import * as schema from "@/db/schema";
import { homes, residents, users } from "@/db/schema";
import { eq } from "drizzle-orm";
import type { AppDb } from "@/lib/homes/service";
import { openTestMemoryDb } from "@/test/pushTestSchema";
import {
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from "@/lib/homes/errors";
import { createResident, departResident } from "@/lib/residents/service";
import {
  MAX_RESIDENT_PORTRAIT_FILE_BYTES,
  deleteResidentPortrait,
  readResidentPortraitBytes,
  uploadResidentPortrait,
} from "./service";

/** Magic-valid minimal body: SOI + EOI (content sniff accepts JPEG header). */
const tinyJpegBody = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);

const minimalPdf = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e]);

const adminActor = { userId: "u-admin", role: "admin" as const };

function openDb(): { db: AppDb; sqlite: Database.Database } {
  const { db, sqlite } = openTestMemoryDb();
  const t = Date.now();
  db.insert(users)
    .values({
      id: adminActor.userId,
      email: `admin-portrait-${randomUUID()}@example.com`,
      passwordHash: "x",
      role: "admin",
      failureTimestampsUtcMs: "[]",
      lockedUntilUtcMs: null,
      createdAtUtcMs: t,
      primaryHomeId: null,
      displayName: null,
      phone: null,
      avatarUrl: null,
    })
    .run();
  db.insert(homes)
    .values({
      id: "h1",
      name: "Home One",
      defaultCurrencyCode: "USD",
      createdAtUtcMs: t,
      updatedAtUtcMs: t,
    })
    .run();
  return { db, sqlite };
}

describe("residentPortraits service", () => {
  const connections: Database.Database[] = [];
  const tmpDirs: string[] = [];

  afterEach(() => {
    for (const d of tmpDirs) {
      try {
        fs.rmSync(d, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
    }
    tmpDirs.length = 0;
    for (const c of connections) {
      c.close();
    }
    connections.length = 0;
  });

  it("stores a JPEG portrait and returns the same bytes on read", () => {
    const { db, sqlite } = openDb();
    connections.push(sqlite);
    const base = fs.mkdtempSync(path.join(os.tmpdir(), "v60-portrait-"));
    tmpDirs.push(base);

    const r = createResident(db, adminActor, {
      homeId: "h1",
      fullName: "Pat Portrait",
      dob: "1945-02-02",
      admissionDate: "2020-01-01",
    });

    uploadResidentPortrait(
      db,
      adminActor,
      "h1",
      r.id,
      {
        bytes: tinyJpegBody,
        declaredContentType: "",
        originalFilename: "p.jpg",
      },
      99,
      base,
    );

    const { buffer, contentType } = readResidentPortraitBytes(
      db,
      adminActor,
      "h1",
      r.id,
      base,
    );
    expect(contentType).toBe("image/jpeg");
    expect(new Uint8Array(buffer)).toEqual(tinyJpegBody);

    const row = db.select().from(residents).where(eq(residents.id, r.id)).get();
    expect(row?.portraitStoredRelativePath).toContain(`h1/${r.id}/`);
    expect(row?.portraitStoredRelativePath?.endsWith(".jpg")).toBe(true);
    expect(row?.portraitUpdatedAtUtcMs).toBe(99);
  });

  it("rejects PDF uploads", () => {
    const { db, sqlite } = openDb();
    connections.push(sqlite);
    const base = fs.mkdtempSync(path.join(os.tmpdir(), "v60-portrait-"));
    tmpDirs.push(base);
    const r = createResident(db, adminActor, {
      homeId: "h1",
      fullName: "Doc Wrong",
      dob: "1945-02-03",
      admissionDate: "2020-01-01",
    });

    expect(() =>
      uploadResidentPortrait(
        db,
        adminActor,
        "h1",
        r.id,
        {
          bytes: minimalPdf,
          declaredContentType: "application/pdf",
          originalFilename: "x.pdf",
        },
        1,
        base,
      ),
    ).toThrow(ValidationError);
  });

  it("rejects uploads larger than the cap", () => {
    const { db, sqlite } = openDb();
    connections.push(sqlite);
    const base = fs.mkdtempSync(path.join(os.tmpdir(), "v60-portrait-"));
    tmpDirs.push(base);
    const r = createResident(db, adminActor, {
      homeId: "h1",
      fullName: "Big File",
      dob: "1945-02-04",
      admissionDate: "2020-01-01",
    });

    const big = new Uint8Array(MAX_RESIDENT_PORTRAIT_FILE_BYTES + 1);
    big[0] = 0xff;
    big[1] = 0xd8;
    big[2] = 0xff;

    expect(() =>
      uploadResidentPortrait(
        db,
        adminActor,
        "h1",
        r.id,
        { bytes: big, declaredContentType: "", originalFilename: "huge.jpg" },
        1,
        base,
      ),
    ).toThrow(ValidationError);
  });

  it("replace upload deletes the previous portrait file", () => {
    const { db, sqlite } = openDb();
    connections.push(sqlite);
    const base = fs.mkdtempSync(path.join(os.tmpdir(), "v60-portrait-"));
    tmpDirs.push(base);
    const r = createResident(db, adminActor, {
      homeId: "h1",
      fullName: "Replace Me",
      dob: "1945-02-05",
      admissionDate: "2020-01-01",
    });

    uploadResidentPortrait(
      db,
      adminActor,
      "h1",
      r.id,
      {
        bytes: tinyJpegBody,
        declaredContentType: "image/jpeg",
        originalFilename: "a.jpg",
      },
      1,
      base,
    );

    const row1 = db.select().from(residents).where(eq(residents.id, r.id)).get();
    const path1 = row1?.portraitStoredRelativePath;
    expect(path1).toBeTruthy();
    const abs1 = path.join(base, ...(path1!.split("/")));

    uploadResidentPortrait(
      db,
      adminActor,
      "h1",
      r.id,
      {
        bytes: tinyJpegBody,
        declaredContentType: "image/jpeg",
        originalFilename: "b.jpg",
      },
      2,
      base,
    );

    expect(fs.existsSync(abs1)).toBe(false);

    const row2 = db.select().from(residents).where(eq(residents.id, r.id)).get();
    const abs2 = path.join(
      base,
      ...(row2!.portraitStoredRelativePath!.split("/")),
    );
    expect(fs.existsSync(abs2)).toBe(true);
  });

  it("blocks portrait upload and delete for departed residents but allows read", () => {
    const { db, sqlite } = openDb();
    connections.push(sqlite);
    const base = fs.mkdtempSync(path.join(os.tmpdir(), "v60-portrait-"));
    tmpDirs.push(base);
    const r = createResident(db, adminActor, {
      homeId: "h1",
      fullName: "Gone Away",
      dob: "1945-02-06",
      admissionDate: "2020-01-01",
    });

    uploadResidentPortrait(
      db,
      adminActor,
      "h1",
      r.id,
      {
        bytes: tinyJpegBody,
        declaredContentType: "",
        originalFilename: "p.jpg",
      },
      1,
      base,
    );

    departResident(db, adminActor, "h1", r.id, {
      reason: "Moved out",
      departedAtUtcMs: 500,
    });

    expect(() =>
      uploadResidentPortrait(
        db,
        adminActor,
        "h1",
        r.id,
        {
          bytes: tinyJpegBody,
          declaredContentType: "",
          originalFilename: "p2.jpg",
        },
        2,
        base,
      ),
    ).toThrow(ForbiddenError);

    expect(() =>
      deleteResidentPortrait(db, adminActor, "h1", r.id, 3, base),
    ).toThrow(ForbiddenError);

    const { buffer } = readResidentPortraitBytes(db, adminActor, "h1", r.id, base);
    expect(buffer.byteLength).toBeGreaterThan(0);
  });

  it("delete clears portrait metadata and removes file", () => {
    const { db, sqlite } = openDb();
    connections.push(sqlite);
    const base = fs.mkdtempSync(path.join(os.tmpdir(), "v60-portrait-"));
    tmpDirs.push(base);
    const r = createResident(db, adminActor, {
      homeId: "h1",
      fullName: "Clear Photo",
      dob: "1945-02-07",
      admissionDate: "2020-01-01",
    });

    uploadResidentPortrait(
      db,
      adminActor,
      "h1",
      r.id,
      {
        bytes: tinyJpegBody,
        declaredContentType: "",
        originalFilename: "p.jpg",
      },
      1,
      base,
    );

    deleteResidentPortrait(db, adminActor, "h1", r.id, 2, base);

    const row = db.select().from(residents).where(eq(residents.id, r.id)).get();
    expect(row?.portraitStoredRelativePath).toBeNull();
    expect(row?.portraitContentType).toBeNull();

    expect(() =>
      readResidentPortraitBytes(db, adminActor, "h1", r.id, base),
    ).toThrow(NotFoundError);
  });

  it("returns 404 semantics when resident is not in home", () => {
    const { db, sqlite } = openDb();
    connections.push(sqlite);
    const base = fs.mkdtempSync(path.join(os.tmpdir(), "v60-portrait-"));
    tmpDirs.push(base);
    const r = createResident(db, adminActor, {
      homeId: "h1",
      fullName: "Other Home",
      dob: "1945-02-08",
      admissionDate: "2020-01-01",
    });

    expect(() =>
      uploadResidentPortrait(
        db,
        adminActor,
        "wrong-home",
        r.id,
        {
          bytes: tinyJpegBody,
          declaredContentType: "",
          originalFilename: "p.jpg",
        },
        1,
        base,
      ),
    ).toThrow(NotFoundError);
  });
});
