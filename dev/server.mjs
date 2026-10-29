// Local preview: serves public/ and runs the two functions against an
// in-memory shelf. Run with `npm run dev`, then open http://localhost:8888.
// The edit key is SHELF_ADMIN_KEY if set, otherwise "local-edit-key".

import http from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../public/", import.meta.url));
const port = Number(process.env.PORT ?? 8888);
const env = { SHELF_ADMIN_KEY: process.env.SHELF_ADMIN_KEY ?? "local-edit-key" };
globalThis.Netlify = { env: { get: (name) => env[name] } };

const { useStore } = await import("../netlify/lib/store.mts");
const { usePurge } = await import("../netlify/lib/cache.mts");
const shelfFn = (await import("../netlify/functions/shelf.mts")).default;
const adminFn = (await import("../netlify/functions/admin.mts")).default;

const memory = new Map();
useStore((name) => ({
  get: async (key) => (memory.has(`${name}/${key}`) ? structuredClone(memory.get(`${name}/${key}`)) : null),
  setJSON: async (key, value) => {
    memory.set(`${name}/${key}`, structuredClone(value));
    return { modified: true };
  },
}));
usePurge(async () => {});

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
  ".ico": "image/x-icon",
};

const CSP =
  "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; object-src 'none'";

const delay = Number(process.env.API_DELAY_MS ?? 0);
const failApi = process.env.API_FAIL === "1";

async function toWebRequest(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const body = chunks.length ? Buffer.concat(chunks) : undefined;
  const headers = new Headers();
  for (const [k, v] of Object.entries(req.headers)) if (v != null) headers.set(k, Array.isArray(v) ? v.join(", ") : v);
  return new Request(`http://${req.headers.host}${req.url}`, {
    method: req.method,
    headers,
    body: req.method === "GET" || req.method === "HEAD" ? undefined : body,
  });
}

async function send(res, response) {
  const headers = {};
  response.headers.forEach((value, key) => {
    if (key !== "set-cookie") headers[key] = value;
  });
  const cookies = response.headers.getSetCookie?.() ?? [];
  if (cookies.length) headers["set-cookie"] = cookies;
  res.writeHead(response.status, headers);
  res.end(Buffer.from(await response.arrayBuffer()));
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://localhost");
    if (url.pathname.startsWith("/api/")) {
      if (delay) await new Promise((r) => setTimeout(r, delay));
      if (failApi) return send(res, new Response("{}", { status: 503 }));
      const request = await toWebRequest(req);
      const context = { deploy: { context: "dev" } };
      if (url.pathname === "/api/shelf") return send(res, await shelfFn(request, context));
      if (url.pathname.startsWith("/api/admin/")) return send(res, await adminFn(request, context));
      return send(res, new Response("Not found", { status: 404 }));
    }

    let path = decodeURIComponent(url.pathname);
    if (path === "/" || path === "/edit" || path === "/edit/") path = "/index.html";
    const file = normalize(join(root, path));
    if (!file.startsWith(root.endsWith(sep) ? root : root + sep)) {
      res.writeHead(403).end();
      return;
    }
    const data = await readFile(file);
    res.writeHead(200, {
      "content-type": TYPES[extname(file)] ?? "application/octet-stream",
      "content-security-policy": CSP,
      "cache-control": "no-store",
    });
    res.end(data);
  } catch (err) {
    if (err.code === "ENOENT" || err.code === "EISDIR") {
      res.writeHead(404, { "content-type": "text/plain" }).end("Not found");
    } else {
      console.error(err);
      res.writeHead(500).end("Server error");
    }
  }
});

server.listen(port, () => {
  console.log(`shmshxr running at http://localhost:${port}  (edit key: ${env.SHELF_ADMIN_KEY})`);
});
