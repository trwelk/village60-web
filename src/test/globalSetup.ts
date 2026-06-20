import { initTestSchemaCache } from "./pushTestSchema";

export default async function globalSetup() {
  await initTestSchemaCache();
}
