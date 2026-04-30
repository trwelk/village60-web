import { randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { sealData } from "iron-session";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { closeDbConnection, getDb } from "@/db/client";
import { createHome } from "@/lib/homes/service";
import { createResident } from "@/lib/residents/service";
import { createUser } from "@/lib/users/service";
import { GET, POST } from "./route";
import { DELETE, PATCH } from "./[id]/route";

const SESSION_PASSWORD = "a".repeat(32);
const SESSION_TTL = 30 * 60;
const STRONG = "ChangeMeNow!1";

const cookieState = vi.hoisted(() => ({ seal: "" as string }));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      name === "village60_session" && cookieState.seal
        ? { name, value: cookieState.seal }
        : undefined,
  }),
}));

function runMigrations(file: string) {
  const sqlite = new Database(file);
  const db = drizzle(sqlite);
  migrate(db, { migrationsFolder: path.join(process.cwd(), "drizzle") });
  sqlite.close();
}

describe("manual tasks API", () => {
  let dbPath: string;

  beforeEach(() => {
    vi.stubEnv("SESSION_PASSWORD", SESSION_PASSWORD);
    vi.stubEnv("NODE_ENV", "test");
    cookieState.seal = "";
    dbPath = path.join(os.tmpdir(), `village60-tasks-api-${randomUUID()}.sqlite`);
    process.env.DATABASE_PATH = dbPath;
    closeDbConnection();
    runMigrations(dbPath);
  });

  afterEach(() => {
    closeDbConnection();
    vi.useRealTimers();
    vi.unstubAllEnvs();
    try {
      fs.unlinkSync(dbPath);
    } catch {
      /* ignore */
    }
  });

  it("creates, lists, completes, and deletes a manual task", async () => {
    const db = getDb();
    const admin = await createUser(db, "admin", {
      email: "tasks-api-admin@example.com",
      password: STRONG,
      role: "admin",
    });
    const home = createHome(db, "admin", {
      name: "Sunrise",
      defaultCurrencyCode: "NZD",
    });
    cookieState.seal = await sealData(
      { userId: admin.id, email: admin.email, role: "admin" },
      { password: SESSION_PASSWORD, ttl: SESSION_TTL },
    );

    const createdRes = await POST(
      new Request("http://local/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          homeId: home.id,
          title: "Check fire drill roster",
          dueDate: "2026-05-02",
          priority: "urgent",
        }),
      }),
    );
    expect(createdRes.status).toBe(200);
    const createdJson = await createdRes.json() as { task: { id: string } };

    const listRes = await GET(new Request("http://local/api/tasks"));
    expect(listRes.status).toBe(200);
    const listJson = await listRes.json() as {
      tasks: { id: string; homeName: string; title: string }[];
    };
    expect(listJson.tasks).toMatchObject([
      {
        kind: "manual",
        id: createdJson.task.id,
        homeName: "Sunrise",
        title: "Check fire drill roster",
      },
    ]);

    const completedList = await GET(
      new Request("http://local/api/tasks?status=completed"),
    );
    expect(completedList.status).toBe(200);
    const completedJson = await completedList.json() as {
      tasks: { id: string; title: string }[];
    };
    expect(completedJson.tasks).toEqual([]);

    const patchRes = await PATCH(
      new Request(`http://local/api/tasks/${createdJson.task.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "completed" }),
      }),
      { params: Promise.resolve({ id: createdJson.task.id }) },
    );
    expect(patchRes.status).toBe(200);
    expect(
      await GET(new Request("http://local/api/tasks")).then((res) => res.json()),
    ).toMatchObject({ tasks: [] });
    const completedAfter = await GET(
      new Request("http://local/api/tasks?status=completed"),
    );
    const completedAfterJson = await completedAfter.json() as {
      tasks: { kind: string; id: string; title: string }[];
    };
    expect(completedAfterJson.tasks).toMatchObject([
      { kind: "manual", id: createdJson.task.id, title: "Check fire drill roster" },
    ]);

    const deleteRes = await DELETE(
      new Request(`http://local/api/tasks/${createdJson.task.id}`, {
        method: "DELETE",
      }),
      { params: Promise.resolve({ id: createdJson.task.id }) },
    );
    expect(deleteRes.status).toBe(200);
  });

  it("returns 400 for invalid status or type query params", async () => {
    const db = getDb();
    const admin = await createUser(db, "admin", {
      email: "tasks-api-badq@example.com",
      password: STRONG,
      role: "admin",
    });
    createHome(db, "admin", {
      name: "Sunrise",
      defaultCurrencyCode: "NZD",
    });
    cookieState.seal = await sealData(
      { userId: admin.id, email: admin.email, role: "admin" },
      { password: SESSION_PASSWORD, ttl: SESSION_TTL },
    );

    const badStatus = await GET(
      new Request("http://local/api/tasks?status=wat"),
    );
    expect(badStatus.status).toBe(400);
    const badType = await GET(
      new Request("http://local/api/tasks?type=nope"),
    );
    expect(badType.status).toBe(400);
  });

  it("rejects invalid enum and date values", async () => {
    const db = getDb();
    const admin = await createUser(db, "admin", {
      email: "tasks-api-invalid@example.com",
      password: STRONG,
      role: "admin",
    });
    const home = createHome(db, "admin", {
      name: "Sunrise",
      defaultCurrencyCode: "NZD",
    });
    cookieState.seal = await sealData(
      { userId: admin.id, email: admin.email, role: "admin" },
      { password: SESSION_PASSWORD, ttl: SESSION_TTL },
    );

    const res = await POST(
      new Request("http://local/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          homeId: home.id,
          title: "Bad task",
          dueDate: "2026-02-31",
          priority: "critical",
        }),
      }),
    );
    expect(res.status).toBe(400);
  });

  it("returns resident birthday reminders for open status but not completed status", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-27T12:00:00.000Z"));
    const db = getDb();
    const admin = await createUser(db, "admin", {
      email: "tasks-api-birthday@example.com",
      password: STRONG,
      role: "admin",
    });
    const home = createHome(db, "admin", {
      name: "Sunrise",
      defaultCurrencyCode: "NZD",
    });
    const resident = createResident(db, { userId: admin.id, role: "admin" }, {
      homeId: home.id,
      fullName: "Birthday Resident",
      dob: "1940-04-30",
      admissionDate: "2024-01-15",
    });
    cookieState.seal = await sealData(
      { userId: admin.id, email: admin.email, role: "admin" },
      { password: SESSION_PASSWORD, ttl: SESSION_TTL },
    );

    const openRes = await GET(new Request("http://local/api/tasks?status=open"));
    expect(openRes.status).toBe(200);
    const openJson = await openRes.json() as {
      tasks: {
        kind: string;
        sourceId: string;
        residentName: string;
        birthdayDate: string;
      }[];
    };
    expect(openJson.tasks).toMatchObject([
      {
        kind: "resident_birthday",
        sourceId: `resident-birthday:${resident.id}:2026`,
        residentName: "Birthday Resident",
        birthdayDate: "2026-04-30",
      },
    ]);

    const completedRes = await GET(
      new Request("http://local/api/tasks?status=completed"),
    );
    expect(completedRes.status).toBe(200);
    await expect(completedRes.json()).resolves.toEqual({ tasks: [] });
  });
});
