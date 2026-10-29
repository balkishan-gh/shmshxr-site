// The public shelf is cached on Netlify's CDN under the "shelf" tag.
// Every save clears that tag so visitors see the change within seconds.

import { purgeCache } from "@netlify/functions";

export const SHELF_TAG = "shelf";

let purge = (): Promise<unknown> => purgeCache({ tags: [SHELF_TAG] });

/** Swap in another purge (tests and the local dev server). */
export function usePurge(fn: () => Promise<unknown>): void {
  purge = fn;
}

export async function purgeShelf(): Promise<void> {
  try {
    await purge();
  } catch (err) {
    // Not fatal: the cached copy expires within a minute on its own.
    console.warn("Couldn’t clear the cached shelf.", err);
  }
}
