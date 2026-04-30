import { assertSafeProductionConfig } from "./lib/ops/productionConfig";

export async function register() {
  assertSafeProductionConfig();
}
