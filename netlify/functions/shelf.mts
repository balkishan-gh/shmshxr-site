// GET /api/shelf — the public shelf, served from the CDN cache.

import type { Config, Context } from "@netlify/functions";
import { readShelf } from "../lib/store.mts";
import { json, fail } from "../lib/http.mts";
import { SHELF_TAG } from "../lib/cache.mts";

export default async (_req: Request, context: Context) => {
  try {
    const doc = await readShelf(context);
    return json(doc, {
      headers: {
        "cache-control": "public, max-age=0, must-revalidate",
        "netlify-cdn-cache-control": "public, durable, s-maxage=60, stale-while-revalidate=604800",
        "netlify-cache-tag": SHELF_TAG,
      },
    });
  } catch (err) {
    console.error("Couldn’t read the shelf.", err);
    return fail(503, "unavailable", "The shelf couldn’t be loaded just now.");
  }
};

export const config: Config = {
  path: "/api/shelf",
  method: ["GET", "HEAD"],
};
