import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "./password";

describe("password IAM", () => {
  it("accepts the correct password for a produced hash", async () => {
    const hash = await hashPassword("correct horse battery staple");
    expect(await verifyPassword("correct horse battery staple", hash)).toBe(
      true,
    );
  });

  it("rejects a wrong password against the same hash", async () => {
    const hash = await hashPassword("one secret value");
    expect(await verifyPassword("different guess", hash)).toBe(false);
  });
});
