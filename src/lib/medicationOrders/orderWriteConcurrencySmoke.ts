/**
 * Invoked via `tsx` from service tests — exercises real DB concurrency (separate handles).
 */
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";

import * as schema from "@/db/schema";
import type { SessionActor } from "@/lib/authz/sessionActor";
import { createOrMergeLowStockMedicationOrderForResident } from "@/lib/medicationOrders/service";

const [_node, _script, dbPath, homeId, residentId, userId, role, op] = process.argv;
if (!dbPath || !homeId || !residentId || !userId || !role || !op) {
  process.stderr.write("usage: orderWriteConcurrencySmoke <dbPath> <homeId> <residentId> <userId> <admin|care> <lowStock>\n");
  process.exit(2);
}

const actor: SessionActor = { userId, role: role as SessionActor["role"] };

const sqlite = new Database(dbPath);
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");
sqlite.pragma("busy_timeout = 30000");
const db = drizzle(sqlite, { schema });

if (op === "lowStock") {
  createOrMergeLowStockMedicationOrderForResident(db, actor, homeId, residentId);
} else {
  process.stderr.write(`unknown op: ${op}\n`);
  process.exit(2);
}

sqlite.close();
process.exit(0);
