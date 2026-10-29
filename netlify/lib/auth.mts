// The edit key and the session cookie.
//
// The key lives in the SHELF_ADMIN_KEY environment variable. Unlocking sets
// an HttpOnly cookie holding an expiry time signed with that key, so the key
// itself never sits in the browser, and changing it signs everyone out.

import { createHash, createHmac, timingSafeEqual } from "node:crypto";

const COOKIE = "shelf_session";
const REMEMBER_SECONDS = 60 * 60 * 24 * 90;
const SESSION_SECONDS = 60 * 60 * 12;
const MIN_KEY_LENGTH = 8;

const adminKey = (): string => (Netlify.env.get("SHELF_ADMIN_KEY") ?? "").trim();

export const isConfigured = (): boolean => adminKey().length >= MIN_KEY_LENGTH;

function same(a: string, b: string): boolean {
  const x = createHash("sha256").update(a).digest();
  const y = createHash("sha256").update(b).digest();
  return timingSafeEqual(x, y);
}

const sign = (payload: string, key: string): string =>
  createHmac("sha256", key).update(`shelf-session:${payload}`).digest("base64url");

export function keyMatches(candidate: unknown): boolean {
  if (typeof candidate !== "string" || !isConfigured()) return false;
  return same(candidate.trim(), adminKey());
}

export function sessionCookie(remember: boolean): string {
  const ttl = remember ? REMEMBER_SECONDS : SESSION_SECONDS;
  const payload = `v1.${Math.floor(Date.now() / 1000) + ttl}`;
  const parts = [`${COOKIE}=${payload}.${sign(payload, adminKey())}`, "Path=/api/admin", "HttpOnly", "Secure", "SameSite=Strict"];
  if (remember) parts.push(`Max-Age=${ttl}`);
  return parts.join("; ");
}

export function clearedCookie(): string {
  return `${COOKIE}=; Path=/api/admin; HttpOnly; Secure; SameSite=Strict; Max-Age=0`;
}

function readCookie(req: Request, name: string): string | null {
  const header = req.headers.get("cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const at = part.indexOf("=");
    if (at > 0 && part.slice(0, at).trim() === name) return part.slice(at + 1).trim();
  }
  return null;
}

export function hasSession(req: Request): boolean {
  if (!isConfigured()) return false;
  const token = readCookie(req, COOKIE);
  if (!token) return false;
  const [version, expires, signature] = token.split(".");
  if (version !== "v1" || !expires || !signature) return false;
  const exp = Number(expires);
  if (!Number.isInteger(exp) || exp * 1000 < Date.now()) return false;
  return same(signature, sign(`${version}.${expires}`, adminKey()));
}
