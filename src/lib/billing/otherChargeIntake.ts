import { ValidationError } from "@/lib/homes/errors";

function parseIsoDateOnlyYmd(raw: string, label: string): string {
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

export type ResolvedIntakeLine = {
  amountMinor: number;
  received: boolean;
  paidOn: string | null;
};

/**
 * Parse one registration/deposit line from the create-resident JSON body (17c).
 * When `received` is true and `paidOn` is omitted or blank, uses `admissionDateIso`
 * as the default paid-on date (matches new-resident form default).
 */
export function parseCreateIntakeLine(
  name: "registration" | "deposit",
  rec: unknown,
  admissionDateIso: string,
): ResolvedIntakeLine {
  const prefix = `otherCharges.${name}`;
  if (typeof rec !== "object" || rec === null) {
    throw new ValidationError(`${prefix} must be an object.`);
  }
  const o = rec as Record<string, unknown>;
  if (
    typeof o.amountMinor !== "number" ||
    !Number.isInteger(o.amountMinor) ||
    o.amountMinor < 0
  ) {
    throw new ValidationError(
      `${prefix}.amountMinor must be a non-negative integer.`,
    );
  }
  if (typeof o.received !== "boolean") {
    throw new ValidationError(`${prefix}.received must be a boolean.`);
  }

  if (!o.received) {
    if ("paidOn" in o && o.paidOn != null) {
      throw new ValidationError(
        `${prefix}.paidOn must be null or omitted when received is false.`,
      );
    }
    return { amountMinor: o.amountMinor, received: false, paidOn: null };
  }

  if ("paidOn" in o && o.paidOn === null) {
    throw new ValidationError(
      `${prefix}.paidOn is required when received is true (or omit to use admission date).`,
    );
  }
  if (
    "paidOn" in o &&
    typeof o.paidOn === "string" &&
    o.paidOn.trim() !== ""
  ) {
    return {
      amountMinor: o.amountMinor,
      received: true,
      paidOn: parseIsoDateOnlyYmd(o.paidOn, `${prefix}.paidOn`),
    };
  }

  return {
    amountMinor: o.amountMinor,
    received: true,
    paidOn: parseIsoDateOnlyYmd(admissionDateIso, "admissionDate"),
  };
}
