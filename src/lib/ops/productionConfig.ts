/** Thrown when production environment variables violate deployment safety rules. */
export class ProductionConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProductionConfigError";
  }
}

/**
 * Validates env for production deployments (HTTPS + secrets: see operations runbook).
 * Call from server startup (e.g. Next instrumentation).
 */
export function assertSafeProductionConfig(
  env: NodeJS.ProcessEnv = process.env,
): void {
  if (env.NODE_ENV !== "production") {
    return;
  }
  if (env.ALLOW_INSECURE_SESSION_PASSWORD === "1") {
    throw new ProductionConfigError(
      "ALLOW_INSECURE_SESSION_PASSWORD must not be set in production.",
    );
  }
  const password = env.SESSION_PASSWORD?.trim();
  if (!password || password.length < 32) {
    throw new ProductionConfigError(
      "SESSION_PASSWORD must be set to at least 32 characters in production.",
    );
  }
}
