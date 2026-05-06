import { ValidationError } from "@/lib/homes/errors";
import {
  canonicalDeclaredExpenseMime,
  mimeTypeForExpenseAttachmentKind,
  sniffExpenseAttachmentKind,
} from "@/lib/homeExpenseAttachments/sniff";

export type PortraitImageKind = "jpeg" | "png" | "webp";

/**
 * JPEG / PNG / WEBP using magic bytes (same detector as expense attachments, PDF excluded).
 */
export function validatePortraitImageContent(
  bytes: Uint8Array,
  declaredContentType: string,
): { kind: PortraitImageKind; contentType: string } {
  const rawKind = sniffExpenseAttachmentKind(bytes);
  if (!rawKind || rawKind === "pdf") {
    throw new ValidationError(
      "Portrait must be a JPEG, PNG, or WEBP file (content verification failed).",
    );
  }
  const kind = rawKind;
  const canonical = mimeTypeForExpenseAttachmentKind(kind);
  const normalized = canonicalDeclaredExpenseMime(declaredContentType);
  if (normalized !== null && normalized !== canonical) {
    throw new ValidationError(
      "Declared file type does not match file contents.",
    );
  }
  return { kind, contentType: canonical };
}
