import { describe, expect, it, vi } from "vitest";
import { authorizeSensitiveAccountAction } from "./sensitive-account-authorization";

const base = {
  firebaseIdToken: "invalid.jwt.token",
  firebaseProjectId: "shakstory-93bb1",
  accessPrincipal: { subject: "access-sub-1", email: "same@example.com" },
  lookup: vi.fn(async () => ({ firebaseUid: "firebase-uid-1", accessSubject: "access-sub-1", verifiedAt: 123 })),
};

describe("sensitive account authorization", () => {
  it("rejects missing Access authentication without looking up an account", async () => {
    const lookup = vi.fn();
    expect(await authorizeSensitiveAccountAction({ ...base, accessPrincipal: null, lookup })).toEqual({
      authorized: false, reason: "unauthenticated",
    });
    expect(lookup).not.toHaveBeenCalled();
  });

  it("rejects forged Firebase credentials even when email matches", async () => {
    const lookup = vi.fn();
    expect(await authorizeSensitiveAccountAction({ ...base, lookup })).toEqual({
      authorized: false, reason: "unauthenticated",
    });
    expect(lookup).not.toHaveBeenCalled();
  });

  it("never treats an email match as proof of account ownership", async () => {
    const lookup = vi.fn();
    const result = await authorizeSensitiveAccountAction({
      ...base, accessPrincipal: { subject: "", email: "same@example.com" }, lookup,
    });
    expect(result.authorized).toBe(false);
    expect(lookup).not.toHaveBeenCalled();
  });
});
