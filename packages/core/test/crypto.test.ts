import { describe, expect, it } from "vitest";
import { decryptSecret, encryptSecret } from "../src/crypto.js";

describe("secret crypto", () => {
  it("round-trips a secret", async () => {
    const payload = await encryptSecret("sk-ant-test-key", "server-secret");
    expect(payload.startsWith("v1:")).toBe(true);
    expect(payload).not.toContain("sk-ant-test-key");
    expect(await decryptSecret(payload, "server-secret")).toBe("sk-ant-test-key");
  });

  it("produces distinct payloads per encryption (random salt/iv)", async () => {
    const a = await encryptSecret("same", "secret");
    const b = await encryptSecret("same", "secret");
    expect(a).not.toBe(b);
  });

  it("fails to decrypt with the wrong secret", async () => {
    const payload = await encryptSecret("api-key", "right-secret");
    await expect(decryptSecret(payload, "wrong-secret")).rejects.toThrow();
  });

  it("rejects malformed payloads", async () => {
    await expect(decryptSecret("not-a-payload", "secret")).rejects.toThrow(/Malformed/);
  });
});
