import test from "node:test";
import assert from "node:assert/strict";
import { handlePrivacyRequest } from "./privacy-requests.js";

function mockDB() {
  const records = [];
  return {
    records,
    prepare(sql) {
      let params = [];
      return {
        bind(...values) { params = values; return this; },
        async first() {
          if (sql.includes("idempotency_key")) {
            const row = records.find(r => r.owner === params[0] && r.key === params[1]);
            return row ? { id: row.id, status: row.status } : null;
          }
          const row = records.find(r => r.owner === params[0] && r.id === params[1]);
          return row ? { protocol: row.id, kind: row.kind, status: row.status } : null;
        },
        async all() { return { results: records.filter(r => r.owner === params[0]).map(r => ({ protocol: r.id, kind: r.kind, status: r.status })) }; },
        async run() {
          if (records.some(r => r.owner === params[1] && r.key === params[4])) throw new Error("unique");
          records.push({ id: params[0], owner: params[1], kind: params[2], key: params[4], status: "received" });
          return { success: true };
        },
      };
    },
  };
}
const endpoint = "https://example.invalid/api/privacy/requests";
const key = "123e4567-e89b-42d3-a456-426614174000";
const request = (path = endpoint, method = "GET", body) => new Request(path, { method, ...(body ? { body: JSON.stringify(body), headers: { "content-type": "application/json" } } : {}) });

test("unauthenticated submissions are rejected without writes", async () => {
  const db = mockDB();
  const response = await handlePrivacyRequest(request(endpoint, "POST", { kind: "access", idempotencyKey: key }), { DB: db }, null);
  assert.equal(response.status, 401);
  assert.equal(db.records.length, 0);
});
test("creates protocol, repeats idempotently and scopes reads to owner", async () => {
  const db = mockDB();
  const input = { kind: "access", idempotencyKey: key };
  const first = await handlePrivacyRequest(request(endpoint, "POST", input), { DB: db }, "user-a");
  assert.equal(first.status, 201);
  const created = await first.json();
  assert.match(created.protocol, /^LGPD-/);
  const repeated = await handlePrivacyRequest(request(endpoint, "POST", input), { DB: db }, "user-a");
  assert.equal((await repeated.json()).protocol, created.protocol);
  assert.equal(db.records.length, 1);
  const own = await handlePrivacyRequest(request(endpoint), { DB: db }, "user-a");
  assert.equal((await own.json()).requests.length, 1);
  const other = await handlePrivacyRequest(request(endpoint), { DB: db }, "user-b");
  assert.equal((await other.json()).requests.length, 0);
  const forbidden = await handlePrivacyRequest(request(endpoint + "/" + created.protocol), { DB: db }, "user-b");
  assert.equal(forbidden.status, 404);
});
test("rejects malformed requests and unrelated routes", async () => {
  const db = mockDB();
  assert.equal((await handlePrivacyRequest(request(endpoint, "POST", { kind: "deletion", idempotencyKey: key }), { DB: db }, "user-a")).status, 400);
  assert.equal((await handlePrivacyRequest(request(endpoint, "POST", { kind: "access", idempotencyKey: "not-a-uuid" }), { DB: db }, "user-a")).status, 400);
  assert.equal(await handlePrivacyRequest(request(endpoint + "-unexpected"), { DB: db }, "user-a"), null);
  assert.equal(db.records.length, 0);
});
