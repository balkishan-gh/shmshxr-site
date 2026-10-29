// Editing endpoints. Everything here needs the session cookie, except
// unlocking itself.
//
//   GET    /api/admin/session   200 when signed in, 401 when not
//   POST   /api/admin/session   { key, remember } → sets the session cookie
//   DELETE /api/admin/session   signs out on this device
//   GET    /api/admin/shelf     the shelf, fresh from storage
//   PUT    /api/admin/shelf     { baseRev, doc } → saves; 409 if the shelf
//                               changed since baseRev

import type { Config, Context } from "@netlify/functions";
import { readShelf, writeShelf } from "../lib/store.mts";
import { purgeShelf } from "../lib/cache.mts";
import { json, fail, readJson, assertSameOrigin, HttpError } from "../lib/http.mts";
import { isConfigured, keyMatches, hasSession, sessionCookie, clearedCookie } from "../lib/auth.mts";
import { sanitizeDoc } from "../../public/assets/js/schema.js";

const WRONG_KEY_DELAY_MS = 700;
const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export default async (req: Request, context: Context) => {
  const { pathname } = new URL(req.url);
  try {
    if (req.method !== "GET" && req.method !== "HEAD") assertSameOrigin(req);
    if (pathname === "/api/admin/session") return await session(req);
    if (pathname === "/api/admin/shelf") return await shelf(req, context);
    return fail(404, "not_found", "There’s nothing here.");
  } catch (err) {
    if (err instanceof HttpError) return fail(err.status, err.code, err.message);
    console.error(err);
    return fail(500, "server_error", "Something went wrong on the server. Try again in a moment.");
  }
};

async function session(req: Request): Promise<Response> {
  if (req.method === "GET") {
    return hasSession(req) ? json({ signedIn: true }) : fail(401, "signed_out", "You’re not signed in.");
  }
  if (req.method === "DELETE") {
    return new Response(null, { status: 204, headers: { "set-cookie": clearedCookie(), "cache-control": "no-store" } });
  }
  if (req.method === "POST") {
    if (!isConfigured()) {
      return fail(503, "not_configured", "Editing isn’t set up yet. Add SHELF_ADMIN_KEY in Netlify, then redeploy.");
    }
    const body = (await readJson(req, 4096)) as { key?: unknown; remember?: unknown } | null;
    if (!keyMatches(body?.key)) {
      await pause(WRONG_KEY_DELAY_MS);
      return fail(401, "wrong_key", "That key doesn’t match. Check it and try again.");
    }
    return json({ signedIn: true }, { headers: { "set-cookie": sessionCookie(body?.remember === true) } });
  }
  return fail(405, "method_not_allowed", "That isn’t supported here.", {}, { headers: { allow: "GET, POST, DELETE" } });
}

async function shelf(req: Request, context: Context): Promise<Response> {
  if (!hasSession(req)) return fail(401, "signed_out", "You’re not signed in.");

  if (req.method === "GET") return json(await readShelf(context));

  if (req.method === "PUT") {
    const body = (await readJson(req)) as { baseRev?: unknown; doc?: unknown } | null;
    const current = await readShelf(context);
    if (body?.baseRev !== current.rev) {
      return fail(409, "conflict", "The shelf changed somewhere else. Load the latest version and try again.", { doc: current });
    }
    const { doc, errors } = sanitizeDoc(body?.doc);
    if (errors.length) return fail(400, "invalid", errors[0].message, { errors });
    const next = { ...doc, rev: current.rev + 1, updatedAt: new Date().toISOString() };
    await writeShelf(context, next);
    await purgeShelf();
    return json(next);
  }

  return fail(405, "method_not_allowed", "That isn’t supported here.", {}, { headers: { allow: "GET, PUT" } });
}

export const config: Config = {
  path: ["/api/admin/session", "/api/admin/shelf"],
};
