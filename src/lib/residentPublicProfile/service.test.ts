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
import { residents } from "@/db/schema";
import { createHome } from "@/lib/homes/service";
import { NotFoundError } from "@/lib/homes/errors";
import { createResident } from "@/lib/residents/service";
import { createWard } from "@/lib/wards/service";
import {
  getResidentPublicProfile,
  readPublicResidentPortraitBytes,
} from "./service";

const adminActor = { userId: "admin-actor", role: "admin" as const };

function runMigrations(file: string) {
  const sqlite = new Database(file);
  const db = drizzle(sqlite);
  migrate(db, { migrationsFolder: path.join(process.cwd(), "drizzle") });
  sqlite.close();
}

describe("residentPublicProfile", () => {
  let dbPath: string;

  beforeEach(() => {
    dbPath = path.join(
      os.tmpdir(),
      `village60-public-profile-${randomUUID()}.sqlite`,
    );
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

  it("returns safe profile fields for a valid public token", () => {
    const db = getDb();
    const home = createHome(db, "admin", {
      name: "Sunrise",
      defaultCurrencyCode: "NZD",
    });
    const ward = createWard(db, adminActor, home.id, {
      label: "North Wing",
    });
    const resident = createResident(db, adminActor, {
      homeId: home.id,
      fullName: "Morgan Lee",
      dob: "1940-05-12",
      admissionDate: "2024-01-15",
      wardId: ward.id,
      roomText: "12A",
    });
    expect(resident.publicToken).toBeTruthy();

    const profile = getResidentPublicProfile(db, resident.publicToken!);
    expect(profile.fullName).toBe("Morgan Lee");
    expect(profile.homeName).toBe("Sunrise");
    expect(profile.wardLabel).toBe("North Wing");
    expect(profile.roomText).toBe("12A");
    expect(profile.hasPortrait).toBe(false);
  });

  it("throws NotFoundError for unknown tokens", () => {
    const db = getDb();
    expect(() => getResidentPublicProfile(db, "not-a-real-token")).toThrow(
      NotFoundError,
    );
  });

  it("reads portrait bytes by public token", () => {
    const db = getDb();
    const home = createHome(db, "admin", {
      name: "Sunrise",
      defaultCurrencyCode: "NZD",
    });
    const resident = createResident(db, adminActor, {
      homeId: home.id,
      fullName: "Morgan Lee",
      dob: "1940-05-12",
      admissionDate: "2024-01-15",
    });
    const portraitsDir = path.join(
      os.tmpdir(),
      `village60-portraits-${randomUUID()}`,
    );
    const relative = `${home.id}/${resident.id}/test.jpg`;
    const absolute = path.join(portraitsDir, relative);
    fs.mkdirSync(path.dirname(absolute), { recursive: true });
    const bytes = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);
    fs.writeFileSync(absolute, bytes);
    db.update(residents)
      .set({
        portraitStoredRelativePath: relative,
        portraitContentType: "image/jpeg",
        portraitSizeBytes: bytes.byteLength,
        portraitUpdatedAtUtcMs: Date.now(),
      })
      .where(eq(residents.id, resident.id))
      .run();

    const out = readPublicResidentPortraitBytes(
      db,
      resident.publicToken!,
      portraitsDir,
    );
    expect(out.contentType).toBe("image/jpeg");
    expect(out.buffer.equals(bytes)).toBe(true);
  });
});
