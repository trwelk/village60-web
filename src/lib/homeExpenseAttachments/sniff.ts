import { ValidationError } from "@/lib/homes/errors";

export type ExpenseAttachmentKind = "pdf" | "jpeg" | "png" | "webp";

const MIME_BY_KIND: Record<ExpenseAttachmentKind, string> = {
  pdf: "application/pdf",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

const EXT_BY_KIND: Record<ExpenseAttachmentKind, string> = {
  pdf: "pdf",
  jpeg: "jpg",
  png: "png",
  webp: "webp",
};

/** Declared `Content-Type` values we accept (before magic-byte verification). */
export const ALLOWED_EXPENSE_ATTACHMENT_DECLARED_MIMES = new Set<string>([
  "application/pdf",
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
]);

export function canonicalDeclaredExpenseMime(raw: string): string | null {
  const s = raw.trim().toLowerCase();
  if (!s) return null;
  if (s === "image/jpg") return "image/jpeg";
  if (!ALLOWED_EXPENSE_ATTACHMENT_DECLARED_MIMES.has(s)) return null;
  return s;
}

export function sniffExpenseAttachmentKind(buf: Uint8Array): ExpenseAttachmentKind | null {
  if (buf.length >= 4 && buf[0] === 0x25 && buf[1] === 0x50 && buf[2] === 0x44 && buf[3] === 0x46) {
    return "pdf";
  }
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return "jpeg";
  }
  if (
    buf.length >= 8 &&
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47 &&
    buf[4] === 0x0d &&
    buf[5] === 0x0a &&
    buf[6] === 0x1a &&
    buf[7] === 0x0a
  ) {
    return "png";
  }
  if (
    buf.length >= 12 &&
    buf[0] === 0x52 &&
    buf[1] === 0x49 &&
    buf[2] === 0x46 &&
    buf[3] === 0x46 &&
    buf[8] === 0x57 &&
    buf[9] === 0x45 &&
    buf[10] === 0x42 &&
    buf[11] === 0x50
  ) {
    return "webp";
  }
  return null;
}

export function mimeTypeForExpenseAttachmentKind(kind: ExpenseAttachmentKind): string {
  return MIME_BY_KIND[kind];
}

export function fileExtensionForExpenseAttachmentKind(kind: ExpenseAttachmentKind): string {
  return EXT_BY_KIND[kind];
}

/**
 * Validates PDF / JPEG / PNG / WEBP using magic bytes. When the client sends a
 * non-empty MIME, it must be allowed and match the sniffed kind.
 */
export function validateExpenseAttachmentContent(
  bytes: Uint8Array,
  declaredContentType: string,
): { kind: ExpenseAttachmentKind; contentType: string } {
  const kind = sniffExpenseAttachmentKind(bytes);
  if (!kind) {
    throw new ValidationError(
      "Attachment must be a PDF, JPEG, PNG, or WEBP file (content verification failed).",
    );
  }
  const canonical = mimeTypeForExpenseAttachmentKind(kind);
  const normalized = canonicalDeclaredExpenseMime(declaredContentType);
  if (normalized !== null && normalized !== canonical) {
    throw new ValidationError(
      "Declared file type does not match file contents.",
    );
  }
  return { kind, contentType: canonical };
}
