import { describe, expect, it } from "vitest";
import { normalizeVerifiedEmail, verifiedAccountEmailsMatch } from "./account-identity.js";

describe("account identity agreement", () => {
  const valid = { accessEmail: "Author@Example.com", firebaseEmail: "author@example.com", d1Email: "author@example.com", firebaseEmailVerified: true };
  it("accepts the same verified identity across three systems", () => expect(verifiedAccountEmailsMatch(valid)).toBe(true));
  it("rejects Firebase mismatch", () => expect(verifiedAccountEmailsMatch({ ...valid, firebaseEmail: "other@example.com" })).toBe(false));
  it("rejects D1 mismatch", () => expect(verifiedAccountEmailsMatch({ ...valid, d1Email: "other@example.com" })).toBe(false));
  it("rejects unverified Google email", () => expect(verifiedAccountEmailsMatch({ ...valid, firebaseEmailVerified: false })).toBe(false));
  it("rejects missing identities", () => expect(verifiedAccountEmailsMatch({ ...valid, accessEmail: null })).toBe(false));
  it("normalizes case without removing meaningful address characters", () => {
    expect(normalizeVerifiedEmail(" A+B@Example.COM ")).toBe("a+b@example.com");
    expect(normalizeVerifiedEmail("not an email")).toBe(null);
  });
});
