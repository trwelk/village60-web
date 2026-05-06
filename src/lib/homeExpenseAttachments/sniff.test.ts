import { describe, expect, it } from "vitest";
import { ValidationError } from "@/lib/homes/errors";
import {
  sniffExpenseAttachmentKind,
  validateExpenseAttachmentContent,
} from "./sniff";

describe("homeExpenseAttachments sniff", () => {
  it("detects PDF signature", () => {
    const buf = new Uint8Array([0x25, 0x50, 0x44, 0x46, ...Array(20).fill(0)]);
    expect(sniffExpenseAttachmentKind(buf)).toBe("pdf");
  });

  it("detects JPEG signature", () => {
    const buf = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(sniffExpenseAttachmentKind(buf)).toBe("jpeg");
  });

  it("detects PNG signature", () => {
    const buf = new Uint8Array([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0,
    ]);
    expect(sniffExpenseAttachmentKind(buf)).toBe("png");
  });

  it("detects WEBP signature", () => {
    const buf = new Uint8Array(12);
    buf[0] = 0x52;
    buf[1] = 0x49;
    buf[2] = 0x46;
    buf[3] = 0x46;
    buf[8] = 0x57;
    buf[9] = 0x45;
    buf[10] = 0x42;
    buf[11] = 0x50;
    expect(sniffExpenseAttachmentKind(buf)).toBe("webp");
  });

  it("returns null for arbitrary bytes", () => {
    const buf = new Uint8Array([0x4d, 0x5a, 0x90, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(sniffExpenseAttachmentKind(buf)).toBeNull();
  });

  it("accepts matching declared MIME", () => {
    const buf = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0]);
    const r = validateExpenseAttachmentContent(buf, "application/pdf");
    expect(r.kind).toBe("pdf");
    expect(r.contentType).toBe("application/pdf");
  });

  it("accepts sniff when declared MIME is empty", () => {
    const buf = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0]);
    const r = validateExpenseAttachmentContent(buf, "");
    expect(r.contentType).toBe("application/pdf");
  });

  it("rejects declared MIME that disagrees with magic bytes", () => {
    const buf = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0]);
    expect(() =>
      validateExpenseAttachmentContent(buf, "image/png"),
    ).toThrow(ValidationError);
  });
});
