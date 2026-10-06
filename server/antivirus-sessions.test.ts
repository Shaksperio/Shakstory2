import { describe, expect, it } from "vitest";
import { createProjectBaseUrl, fingerprintSession, hashSecret } from "./antivirus-sessions";

describe("antivirus session security", () => {
  it("hashes secrets deterministically without exposing the raw value", () => {
    const secret = "session-secret-for-qa";
    const hash = hashSecret(secret);
    expect(hash).toHaveLength(64);
    expect(hash).not.toContain(secret);
    expect(hashSecret(secret)).toBe(hash);
  });

  it("derives a stable fingerprint from the login cookie", () => {
    expect(fingerprintSession("sid=qa-session")).toBe(fingerprintSession("sid=qa-session"));
    expect(fingerprintSession("sid=qa-session")).not.toBe(fingerprintSession("sid=other-session"));
  });

  it("uses forwarded project origin as logical base URL", () => {
    const req = { protocol: "http", get: (name: string) => ({ "x-forwarded-proto": "https", "x-forwarded-host": "writer.example" }[name]) };
    expect(createProjectBaseUrl(req)).toBe("https://writer.example");
  });
});
