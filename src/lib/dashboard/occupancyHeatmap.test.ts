import { randomUUID } from "node:crypto";
import { pushTestSchema } from "@/test/pushTestSchema";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { closeDbConnection, getDb } from "@/db/client";
import { createHome } from "@/lib/homes/service";
import { createResident } from "@/lib/residents/service";
import { createWard, updateWard } from "@/lib/wards/service";
import {
  listOccupancyHeatmapBoard,
  occupancyBandForWard,
  wardIsSevere,
} from "./occupancyHeatmap";

const adminActor = { userId: "admin-actor", role: "admin" as const };

describe("occupancy heatmap board (26a)", () => {
  let dbPath: string;

  beforeEach(() => {
    dbPath = path.join(os.tmpdir(), `village60-heatmap-${randomUUID()}.sqlite`);
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

  it("returns no_homes when there are no non-archived homes", () => {
    const db = getDb();
    expect(listOccupancyHeatmapBoard(db)).toEqual({ boardKind: "no_homes" });
  });

  it("derives color bands and severity from whole-percent occupancy", () => {
    expect(occupancyBandForWard(6, 10)).toBe("green");
    expect(occupancyBandForWard(7, 10)).toBe("amber");
    expect(occupancyBandForWard(9, 10)).toBe("red");
    expect(occupancyBandForWard(10, 10)).toBe("red");
    expect(occupancyBandForWard(11, 10)).toBe("over");
    expect(occupancyBandForWard(0, null)).toBe("neutral");
    expect(wardIsSevere(9, 10)).toBe(true);
    expect(wardIsSevere(8, 10)).toBe(false);
  });

  it("lists a home with no wards, unassigned, and a no_wards notice", () => {
    const db = getDb();
    const home = createHome(db, "admin", {
      name: "Solo",
      defaultCurrencyCode: "NZD",
    });
    createResident(db, adminActor, {
      homeId: home.id,
      fullName: "A",
      dob: "1940-01-01",
      admissionDate: "2024-01-01",
    });

    const board = listOccupancyHeatmapBoard(db);
    expect(board.boardKind).toBe("homes");
    if (board.boardKind !== "homes") {
      return;
    }
    expect(board.homes).toHaveLength(1);
    const row = board.homes[0];
    expect(row.homeName).toBe("Solo");
    expect(row.homeNotice).toBe("no_wards");
    expect(row.wardTiles).toEqual([]);
    expect(row.unassigned).toEqual({ kind: "unassigned", count: 1 });
    expect(row.header).toEqual({ display: "not_configured" });
  });

  it("marks null-bed wards as not configured and flags only_unconfigured", () => {
    const db = getDb();
    const home = createHome(db, "admin", {
      name: "All Null",
      defaultCurrencyCode: "NZD",
    });
    createWard(db, adminActor, home.id, { label: "W1", sortOrder: 1 });
    createResident(db, adminActor, {
      homeId: home.id,
      fullName: "A",
      dob: "1940-01-01",
      admissionDate: "2024-01-01",
    });

    const board = listOccupancyHeatmapBoard(db);
    expect(board.boardKind).toBe("homes");
    if (board.boardKind !== "homes") {
      return;
    }
    const row = board.homes[0];
    expect(row.homeNotice).toBe("only_unconfigured");
    expect(row.wardTiles[0]).toMatchObject({
      notConfigured: true,
      label: "W1",
    });
    expect(row.header).toEqual({ display: "not_configured" });
  });

  it("orders severe homes before alphabetical by name", () => {
    const db = getDb();
    const alpha = createHome(db, "admin", {
      name: "A Home",
      defaultCurrencyCode: "NZD",
    });
    const zeta = createHome(db, "admin", {
      name: "Zeta Home",
      defaultCurrencyCode: "NZD",
    });
    const wAlpha = createWard(db, adminActor, alpha.id, {
      label: "W",
      sortOrder: 1,
      bedCount: 10,
    });
    const wZeta = createWard(db, adminActor, zeta.id, {
      label: "W",
      sortOrder: 1,
      bedCount: 10,
    });
    for (let i = 0; i < 9; i += 1) {
      createResident(db, adminActor, {
        homeId: zeta.id,
        fullName: `Z${i}`,
        dob: "1940-01-10",
        admissionDate: "2024-01-01",
        wardId: wZeta.id,
      });
    }
    for (let i = 0; i < 3; i += 1) {
      createResident(db, adminActor, {
        homeId: alpha.id,
        fullName: `A${i}`,
        dob: "1940-01-11",
        admissionDate: "2024-01-01",
        wardId: wAlpha.id,
      });
    }

    const board = listOccupancyHeatmapBoard(db);
    expect(board.boardKind).toBe("homes");
    if (board.boardKind !== "homes") {
      return;
    }
    expect(board.homes.map((h) => h.homeName)).toEqual([
      "Zeta Home",
      "A Home",
    ]);
    expect(board.homes[0].hasSevereWard).toBe(true);
  });

  it("computes home header, ward occupancy, and unassigned without ward occupancy percent", () => {
    const db = getDb();
    const home = createHome(db, "admin", {
      name: "Main",
      defaultCurrencyCode: "NZD",
    });
    const w1 = createWard(db, adminActor, home.id, {
      label: "East",
      sortOrder: 1,
      bedCount: 4,
    });
    const w2 = createWard(db, adminActor, home.id, {
      label: "West",
      sortOrder: 2,
      bedCount: 2,
    });
    for (let i = 0; i < 3; i += 1) {
      createResident(db, adminActor, {
        homeId: home.id,
        fullName: `E${i}`,
        dob: "1940-01-20",
        admissionDate: "2024-01-01",
        wardId: w1.id,
      });
    }
    createResident(db, adminActor, {
      homeId: home.id,
      fullName: "LoneW",
      dob: "1940-01-21",
      admissionDate: "2024-01-01",
      wardId: w2.id,
    });
    createResident(db, adminActor, {
      homeId: home.id,
      fullName: "U",
      dob: "1940-01-22",
      admissionDate: "2024-01-01",
    });

    const board = listOccupancyHeatmapBoard(db);
    expect(board.boardKind).toBe("homes");
    if (board.boardKind !== "homes") {
      return;
    }
    const row = board.homes[0];
    expect(row.header).toEqual({
      display: "configured",
      occupied: 5,
      configuredBeds: 6,
      occupancyPercent: 83,
    });
    const east = row.wardTiles.find((t) => t.label === "East");
    const west = row.wardTiles.find((t) => t.label === "West");
    expect(east).toMatchObject({
      notConfigured: false,
      occupied: 3,
      bedCount: 4,
      availableBeds: 1,
      band: "amber",
    });
    expect(west).toMatchObject({
      notConfigured: false,
      occupied: 1,
      bedCount: 2,
      availableBeds: 1,
      band: "green",
    });
    expect(row.unassigned).toEqual({ kind: "unassigned", count: 1 });
  });

  it("treats residents on archived wards as unassigned in board counts", () => {
    const db = getDb();
    const home = createHome(db, "admin", {
      name: "X",
      defaultCurrencyCode: "NZD",
    });
    const oldW = createWard(db, adminActor, home.id, { label: "Old", sortOrder: 1 });
    createResident(db, adminActor, {
      homeId: home.id,
      fullName: "R1",
      dob: "1940-01-01",
      admissionDate: "2024-01-01",
      wardId: oldW.id,
    });
    updateWard(db, adminActor, home.id, oldW.id, { archived: true });

    const board = listOccupancyHeatmapBoard(db);
    expect(board.boardKind).toBe("homes");
    if (board.boardKind !== "homes") {
      return;
    }
    expect(board.homes[0].unassigned).toEqual({ kind: "unassigned", count: 1 });
    expect(board.homes[0].wardTiles).toEqual([]);
  });
});
