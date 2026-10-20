import { describe, expect, it } from "vitest";
import { isVerifiedAccountBinding, verifyFirebaseIdToken } from "./identity-verification";

describe("verified identity linking", () => {
  const binding = { firebaseUid: "firebase-uid-1", accessSubject: "access-sub-1", verifiedAt: 12345 };
  it("requires both immutable provider identifiers", () => {
    expect(isVerifiedAccountBinding("firebase-uid-1", "access-sub-1", binding)).toBe(true);
    expect(isVerifiedAccountBinding("firebase-uid-2", "access-sub-1", binding)).toBe(false);
    expect(isVerifiedAccountBinding("firebase-uid-1", "access-sub-2", binding)).toBe(false);
    expect(isVerifiedAccountBinding("", "access-sub-1", binding)).toBe(false);
  });
  it("rejects revoked, missing and unverified bindings", () => {
    expect(isVerifiedAccountBinding("firebase-uid-1", "access-sub-1", null)).toBe(false);
    expect(isVerifiedAccountBinding("firebase-uid-1", "access-sub-1", { ...binding, verifiedAt: 0 })).toBe(false);
    expect(isVerifiedAccountBinding("firebase-uid-1", "access-sub-1", { ...binding, revokedAt: 12346 })).toBe(false);
  });
  it("rejects unsigned or malformed Firebase tokens", async () => {
    expect(await verifyFirebaseIdToken("not-a-jwt", "shakstory-93bb1")).toBeNull();
    const encode = (obj: unknown) => Buffer.from(JSON.stringify(obj)).toString("base64url");
    const forged = [encode({ alg: "none", kid: "fake" }), encode({ aud: "shakstory-93bb1", sub: "victim" }), "fake"].join(".");
    expect(await verifyFirebaseIdToken(forged, "shakstory-93bb1")).toBeNull();
  });
});
