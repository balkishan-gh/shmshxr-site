// Small helpers for JSON responses and request bodies.

export class HttpError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function json(data: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  headers.set("content-type", "application/json; charset=utf-8");
  headers.set("x-content-type-options", "nosniff");
  if (!headers.has("cache-control")) headers.set("cache-control", "no-store");
  return new Response(JSON.stringify(data), { ...init, headers });
}

export function fail(status: number, code: string, message: string, extra: Record<string, unknown> = {}, init: ResponseInit = {}): Response {
  return json({ error: { code, message, ...extra } }, { ...init, status });
}

export async function readJson(req: Request, maxChars = 512 * 1024): Promise<unknown> {
  const type = (req.headers.get("content-type") ?? "").toLowerCase();
  if (!type.startsWith("application/json")) throw new HttpError(415, "unsupported_type", "Send the changes as JSON.");
  const text = await req.text();
  if (text.length > maxChars) throw new HttpError(413, "too_large", "That’s more than the shelf can take in one save.");
  try {
    return JSON.parse(text);
  } catch {
    throw new HttpError(400, "bad_json", "The changes didn’t arrive in a readable form. Try again.");
  }
}

/** Reject state-changing requests that come from another site. */
export function assertSameOrigin(req: Request): void {
  const origin = req.headers.get("origin");
  if (!origin) return;
  let ok = false;
  try {
    ok = new URL(origin).host === new URL(req.url).host;
  } catch {
    ok = false;
  }
  if (!ok) throw new HttpError(403, "cross_origin", "Edits have to come from the site itself.");
}
