import { describe, expect, it } from "vitest";
import { ACCOUNT_REACTIVATION_DAYS, canAccessAccount, canReactivate, canRequestDeletion, deletionLinkValid } from "./account-lifecycle";

const now = Date.parse("2026-10-20T12:00:00.000Z");
describe("account lifecycle policy", () => {
  it("allows reactivation during the configured window only", () => {
    expect(canReactivate({ status: "deactivated", deactivatedAt: new Date(now - 10 * 86400000).toISOString() }, now)).toBe(true);
    expect(canReactivate({ status: "deactivated", deactivatedAt: new Date(now - (ACCOUNT_REACTIVATION_DAYS + 1) * 86400000).toISOString() }, now)).toBe(false);
    expect(canReactivate({ status: "deleted", deactivatedAt: new Date(now).toISOString() }, now)).toBe(false);
  });
  it("blocks access to inactive accounts", () => {
    expect(canAccessAccount({ status: "active" })).toBe(true);
    expect(canAccessAccount({ status: "deactivated" })).toBe(false);
    expect(canAccessAccount({ status: "deletion_pending" })).toBe(false);
    expect(canAccessAccount({ status: "deleted" })).toBe(false);
  });
  it("does not allow a second deletion request after deletion begins", () => {
    expect(canRequestDeletion({ status: "active" })).toBe(true);
    expect(canRequestDeletion({ status: "deactivated" })).toBe(true);
    expect(canRequestDeletion({ status: "deletion_pending" })).toBe(false);
    expect(canRequestDeletion({ status: "deleted" })).toBe(false);
  });
  it("expires confirmation links and prevents replay", () => {
    const issued = new Date(now - 14 * 60000).toISOString();
    expect(deletionLinkValid(issued, null, now)).toBe(true);
    expect(deletionLinkValid(issued, new Date(now).toISOString(), now)).toBe(false);
    expect(deletionLinkValid(new Date(now - 15 * 60000).toISOString(), null, now)).toBe(false);
    expect(deletionLinkValid(new Date(now + 60000).toISOString(), null, now)).toBe(false);
  });
});
