import { defineConfig } from "drizzle-kit";
import path from "node:path";

const databasePath =
  process.env.DATABASE_PATH ?? path.join(process.cwd(), "data", "village60.sqlite");

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "sqlite",
  dbCredentials: { url: `file:${databasePath}` },
});
