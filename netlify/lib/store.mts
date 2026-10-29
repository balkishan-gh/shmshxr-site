// Where the shelf lives: one JSON document in Netlify Blobs.
// Production keeps the real shelf; deploy previews and local dev get their
// own copy, so trying things out never touches the live page.

import { getStore } from "@netlify/blobs";
import type { Context } from "@netlify/functions";
import { SEED } from "../../public/assets/js/seed.js";
import { sanitizeDoc } from "../../public/assets/js/schema.js";

const KEY = "shelf";

type ShelfStore = {
  get(key: string, options: { type: "json" }): Promise<unknown>;
  setJSON(key: string, value: unknown): Promise<unknown>;
};

let open = (name: string): ShelfStore => getStore({ name, consistency: "strong" }) as unknown as ShelfStore;

/** Swap in another store (tests and the local dev server use an in-memory one). */
export function useStore(factory: (name: string) => ShelfStore): void {
  open = factory;
}

function storeFor(context: Context | undefined): ShelfStore {
  const isProduction = context?.deploy?.context === "production";
  return open(isProduction ? "shelf" : "shelf-preview");
}

/** The current shelf, or the original one if nothing has been saved yet. */
export async function readShelf(context?: Context) {
  const stored = await storeFor(context).get(KEY, { type: "json" });
  return sanitizeDoc(stored ?? SEED).doc;
}

export async function writeShelf(context: Context | undefined, doc: unknown): Promise<void> {
  await storeFor(context).setJSON(KEY, doc);
}
