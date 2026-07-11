import { describe, it, expect } from "vitest";
import { hashPassword, verifyPassword } from "./password";

describe("password hashing", () => {
  it("produces an argon2id hash that verifies the original", async () => {
    const hash = await hashPassword("correct horse battery staple");
    expect(hash).toMatch(/^\$argon2id\$/);
    expect(await verifyPassword(hash, "correct horse battery staple")).toBe(true);
  });

  it("rejects a wrong password", async () => {
    const hash = await hashPassword("s3cret-passphrase");
    expect(await verifyPassword(hash, "wrong-passphrase")).toBe(false);
  });

  it("returns false for a malformed hash instead of throwing", async () => {
    expect(await verifyPassword("not-a-hash", "whatever")).toBe(false);
  });

  it("salts each hash uniquely", async () => {
    const a = await hashPassword("same-input-value");
    const b = await hashPassword("same-input-value");
    expect(a).not.toBe(b);
  });
});
