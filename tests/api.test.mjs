// End-to-end checks of the functions, with an in-memory store.
// Run with: npm test

import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";

import shelfFn from "../netlify/functions/shelf.mts";
import adminFn from "../netlify/functions/admin.mts";
import { useStore } from "../netlify/lib/store.mts";
import { usePurge } from "../netlify/lib/cache.mts";
import { SEED } from "../public/assets/js/seed.js";

const KEY = "correct horse battery staple";
const env = { SHELF_ADMIN_KEY: KEY };
globalThis.Netlify = { env: { get: (name) => env[name] } };

let memory;
let purges;
const context = { deploy: { context: "production" } };

beforeEach(() => {
  memory = new Map();
  purges = 0;
  env.SHELF_ADMIN_KEY = KEY;
  useStore((name) => ({
    get: async (key) => (memory.has(`${name}/${key}`) ? structuredClone(memory.get(`${name}/${key}`)) : null),
    setJSON: async (key, value) => {
      memory.set(`${name}/${key}`, structuredClone(value));
      return { modified: true };
    },
  }));
  usePurge(async () => {
    purges++;
  });
});

const BASE = "https://shmshxr.netlify.app";

function call(fn, method, path, { body, cookie, origin, type = "application/json" } = {}) {
  const headers = {};
  if (body !== undefined) headers["content-type"] = type;
  if (cookie) headers.cookie = cookie;
  if (origin) headers.origin = origin;
  const req = new Request(BASE + path, { method, headers, body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body) });
  return fn(req, context);
}

async function signIn(remember = true) {
  const res = await call(adminFn, "POST", "/api/admin/session", { body: { key: KEY, remember } });
  assert.equal(res.status, 200);
  const setCookie = res.headers.get("set-cookie");
  return { cookie: setCookie.split(";")[0], setCookie };
}

test("the public shelf starts as the seed, cached on the CDN", async () => {
  const res = await call(shelfFn, "GET", "/api/shelf");
  assert.equal(res.status, 200);
  const doc = await res.json();
  assert.equal(doc.rev, 0);
  assert.equal(doc.items.length, SEED.items.length);
  assert.equal(doc.profile.name, "Bal Kishan");
  assert.match(res.headers.get("netlify-cdn-cache-control"), /s-maxage=60/);
  assert.equal(res.headers.get("netlify-cache-tag"), "shelf");
});

test("unlocking needs the right key", async () => {
  let res = await call(adminFn, "POST", "/api/admin/session", { body: { key: "nope" } });
  assert.equal(res.status, 401);
  assert.equal((await res.json()).error.code, "wrong_key");
  assert.equal(res.headers.get("set-cookie"), null);

  res = await call(adminFn, "POST", "/api/admin/session", { body: "key=" + KEY, type: "application/x-www-form-urlencoded" });
  assert.equal(res.status, 415);

  const { setCookie } = await signIn(true);
  assert.match(setCookie, /HttpOnly/);
  assert.match(setCookie, /Secure/);
  assert.match(setCookie, /SameSite=Strict/);
  assert.match(setCookie, /Path=\/api\/admin/);
  assert.match(setCookie, /Max-Age=7776000/);

  const short = await signIn(false);
  assert.doesNotMatch(short.setCookie, /Max-Age/);
});

test("the session cookie is checked, and changing the key signs everyone out", async () => {
  assert.equal((await call(adminFn, "GET", "/api/admin/session")).status, 401);
  const { cookie } = await signIn();
  assert.equal((await call(adminFn, "GET", "/api/admin/session", { cookie })).status, 200);

  const tampered = cookie.replace(/v1\.(\d+)/, (_, exp) => `v1.${Number(exp) + 999}`);
  assert.equal((await call(adminFn, "GET", "/api/admin/session", { cookie: tampered })).status, 401);

  env.SHELF_ADMIN_KEY = "a brand new key 42";
  assert.equal((await call(adminFn, "GET", "/api/admin/session", { cookie })).status, 401);
});

test("editing is switched off until a key is configured", async () => {
  env.SHELF_ADMIN_KEY = "";
  const res = await call(adminFn, "POST", "/api/admin/session", { body: { key: "" } });
  assert.equal(res.status, 503);
  assert.equal((await res.json()).error.code, "not_configured");
});

test("saving needs a session", async () => {
  const res = await call(adminFn, "PUT", "/api/admin/shelf", { body: { baseRev: 0, doc: SEED } });
  assert.equal(res.status, 401);
  assert.equal(memory.size, 0);
});

test("a save bumps the revision, clears the CDN cache and shows up publicly", async () => {
  const { cookie } = await signIn();
  const current = await (await call(adminFn, "GET", "/api/admin/shelf", { cookie })).json();
  const doc = structuredClone(current);
  doc.items.push({ id: "breaking-bad-ab12", categoryId: "shows", title: "  Breaking   Bad ", note: "", since: "2019", link: "", addedAt: new Date().toISOString() });

  const res = await call(adminFn, "PUT", "/api/admin/shelf", { cookie, body: { baseRev: current.rev, doc } });
  assert.equal(res.status, 200);
  const saved = await res.json();
  assert.equal(saved.rev, 1);
  assert.equal(purges, 1);
  assert.equal(saved.items.at(-1).title, "Breaking Bad");

  const pub = await (await call(shelfFn, "GET", "/api/shelf")).json();
  assert.equal(pub.rev, 1);
  assert.ok(pub.items.some((i) => i.title === "Breaking Bad"));
});

test("a save based on an old revision is refused with the latest copy", async () => {
  const { cookie } = await signIn();
  const first = await (await call(adminFn, "GET", "/api/admin/shelf", { cookie })).json();
  const ok = await call(adminFn, "PUT", "/api/admin/shelf", { cookie, body: { baseRev: 0, doc: first } });
  assert.equal(ok.status, 200);

  const stale = await call(adminFn, "PUT", "/api/admin/shelf", { cookie, body: { baseRev: 0, doc: first } });
  assert.equal(stale.status, 409);
  const body = await stale.json();
  assert.equal(body.error.code, "conflict");
  assert.equal(body.error.doc.rev, 1);
});

test("bad edits are rejected with a readable reason", async () => {
  const { cookie } = await signIn();
  const doc = structuredClone(SEED);
  doc.items[0].title = "   ";
  let res = await call(adminFn, "PUT", "/api/admin/shelf", { cookie, body: { baseRev: 0, doc } });
  assert.equal(res.status, 400);
  assert.equal((await res.json()).error.message, "Give it a name.");

  const sneaky = structuredClone(SEED);
  sneaky.items[0].link = "javascript:alert(1)";
  res = await call(adminFn, "PUT", "/api/admin/shelf", { cookie, body: { baseRev: 0, doc: sneaky } });
  assert.equal(res.status, 400);

  res = await call(adminFn, "PUT", "/api/admin/shelf", { cookie, body: "{not json" });
  assert.equal(res.status, 400);
  assert.equal(memory.size, 0);
});

test("edits from another site are refused", async () => {
  const { cookie } = await signIn();
  const res = await call(adminFn, "PUT", "/api/admin/shelf", { cookie, origin: "https://evil.example", body: { baseRev: 0, doc: SEED } });
  assert.equal(res.status, 403);
});

test("signing out clears the cookie", async () => {
  const res = await call(adminFn, "DELETE", "/api/admin/session");
  assert.equal(res.status, 204);
  assert.match(res.headers.get("set-cookie"), /Max-Age=0/);
});

test("previews keep their own copy of the shelf", async () => {
  const { cookie } = await signIn();
  const preview = { deploy: { context: "deploy-preview" } };
  const doc = structuredClone(SEED);
  doc.profile.status = "Trying something out";
  const req = new Request(BASE + "/api/admin/shelf", {
    method: "PUT",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ baseRev: 0, doc }),
  });
  assert.equal((await adminFn(req, preview)).status, 200);
  assert.ok(memory.has("shelf-preview/shelf"));
  assert.ok(!memory.has("shelf/shelf"));
});
