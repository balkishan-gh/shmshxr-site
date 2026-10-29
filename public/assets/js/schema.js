// The shelf's shape, limits and colour palette.
// Shared by the browser (to check edits before saving) and the Netlify
// functions (to validate every save), so both sides agree on the rules.

export const PALETTE = {
  coral: "#ff9c99",
  orange: "#fda670",
  amber: "#e4b756",
  lime: "#b0ca6c",
  green: "#7cd595",
  teal: "#41d7ca",
  sky: "#4ccff7",
  blue: "#8abfff",
  violet: "#c5adff",
  pink: "#f09edc",
  stone: "#c9c8c4",
};

export const COLOR_NAMES = Object.keys(PALETTE);

export const LIMITS = {
  name: 60,
  nickname: 40,
  intro: 220,
  status: 80,
  url: 300,
  email: 120,
  categories: 40,
  categoryName: 40,
  phrase: 40,
  items: 1000,
  title: 120,
  note: 160,
  since: 40,
};

export const LINKS = [
  { key: "github", label: "GitHub", placeholder: "https://github.com/you" },
  { key: "linkedin", label: "LinkedIn", placeholder: "https://www.linkedin.com/in/you" },
  { key: "instagram", label: "Instagram", placeholder: "https://www.instagram.com/you" },
  { key: "x", label: "X", placeholder: "https://x.com/you" },
  { key: "email", label: "Email", placeholder: "you@example.com" },
];

const ID = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/;
const EMAIL = /^[^\s@<>()]+@[^\s@<>()]+\.[^\s@<>()]+$/;
const CONTROL = /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/g;
const EARLIEST = Date.parse("2020-01-01T00:00:00Z");

/** Trim, collapse whitespace, drop control characters and cap the length. */
export function cleanText(value, max) {
  if (typeof value !== "string") return "";
  const s = value.replace(CONTROL, " ").replace(/\s+/g, " ").trim();
  const chars = Array.from(s);
  return chars.length > max ? chars.slice(0, max).join("").trim() : s;
}

/** "" for empty, a normalised http(s) URL, or null when it is not a web address. */
export function cleanUrl(value) {
  const s = cleanText(value, LIMITS.url);
  if (!s) return "";
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(s) ? s : `https://${s}`;
  try {
    const url = new URL(withScheme);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    if (!url.hostname.includes(".")) return null;
    return url.href;
  } catch {
    return null;
  }
}

/** "" for empty, the address, or null when it doesn't look like an email. */
export function cleanEmail(value) {
  const s = cleanText(value, LIMITS.email).replace(/^mailto:/i, "");
  if (!s) return "";
  return EMAIL.test(s) ? s : null;
}

export function slugify(value) {
  return cleanText(value, 80)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/g, "");
}

/** A readable, unique id such as "breaking-bad-k3x9". */
export function makeId(label, taken = new Set()) {
  const base = slugify(label) || "item";
  for (let i = 0; i < 50; i++) {
    const suffix = Math.random().toString(36).slice(2, 6).padEnd(4, "0");
    const id = `${base}-${suffix}`;
    if (!taken.has(id)) return id;
  }
  return `${base}-${Date.now().toString(36)}`;
}

function cleanDate(value, fallback, now) {
  const t = typeof value === "string" ? Date.parse(value) : NaN;
  if (Number.isFinite(t) && t >= EARLIEST && t <= now + 60 * 60 * 1000) return new Date(t).toISOString();
  return fallback;
}

/**
 * Normalise an incoming shelf document.
 * Returns { doc, errors }: `doc` is always safe to store or render; `errors`
 * lists anything the person needs to fix (an empty name, a broken link, ...).
 */
export function sanitizeDoc(input, { now = Date.now() } = {}) {
  const errors = [];
  const src = input && typeof input === "object" ? input : {};
  const nowIso = new Date(now).toISOString();

  const p = src.profile && typeof src.profile === "object" ? src.profile : {};
  const rawLinks = p.links && typeof p.links === "object" ? p.links : {};
  const links = {};
  for (const { key, label } of LINKS) {
    const value = key === "email" ? cleanEmail(rawLinks[key]) : cleanUrl(rawLinks[key]);
    if (value === null) {
      errors.push({
        field: `links.${key}`,
        message: key === "email" ? "That email address doesn't look right." : `The ${label} link needs to be a web address.`,
      });
      links[key] = "";
    } else {
      links[key] = value;
    }
  }
  const profile = {
    name: cleanText(p.name, LIMITS.name),
    nickname: cleanText(p.nickname, LIMITS.nickname),
    intro: cleanText(p.intro, LIMITS.intro).replace(/[.\s]+$/, ""),
    status: cleanText(p.status, LIMITS.status),
    links,
  };
  if (!profile.name) errors.push({ field: "profile.name", message: "Add your name." });

  const categories = [];
  const categoryIds = new Set();
  for (const c of Array.isArray(src.categories) ? src.categories : []) {
    if (categories.length >= LIMITS.categories) {
      errors.push({ field: "categories", message: `You can have up to ${LIMITS.categories} categories.` });
      break;
    }
    if (!c || typeof c !== "object") continue;
    const id = typeof c.id === "string" && ID.test(c.id) ? c.id : null;
    if (!id || categoryIds.has(id)) {
      errors.push({ field: "categories", message: "A category has a missing or repeated id." });
      continue;
    }
    const name = cleanText(c.name, LIMITS.categoryName);
    if (!name) {
      errors.push({ field: `category.${id}.name`, message: "Give the category a name." });
      continue;
    }
    const s = c.sentence && typeof c.sentence === "object" ? c.sentence : {};
    categories.push({
      id,
      name,
      color: COLOR_NAMES.includes(c.color) ? c.color : "stone",
      sentence: {
        on: s.on === true,
        before: cleanText(s.before, LIMITS.phrase),
        after: cleanText(s.after, LIMITS.phrase),
        lower: s.lower === true,
      },
    });
    categoryIds.add(id);
  }

  const items = [];
  const itemIds = new Set();
  for (const it of Array.isArray(src.items) ? src.items : []) {
    if (items.length >= LIMITS.items) {
      errors.push({ field: "items", message: `The shelf holds up to ${LIMITS.items} things.` });
      break;
    }
    if (!it || typeof it !== "object") continue;
    const id = typeof it.id === "string" && ID.test(it.id) ? it.id : null;
    if (!id || itemIds.has(id)) {
      errors.push({ field: "items", message: "An item has a missing or repeated id." });
      continue;
    }
    if (!categoryIds.has(it.categoryId)) {
      errors.push({ field: `item.${id}.categoryId`, message: "Pick a category for this item." });
      continue;
    }
    const title = cleanText(it.title, LIMITS.title);
    if (!title) {
      errors.push({ field: `item.${id}.title`, message: "Give it a name." });
      continue;
    }
    const link = cleanUrl(it.link);
    if (link === null) errors.push({ field: `item.${id}.link`, message: "The link needs to be a web address." });
    items.push({
      id,
      categoryId: it.categoryId,
      title,
      note: cleanText(it.note, LIMITS.note),
      since: cleanText(it.since, LIMITS.since),
      link: link || "",
      addedAt: cleanDate(it.addedAt, nowIso, now),
    });
    itemIds.add(id);
  }

  return {
    doc: {
      version: 1,
      rev: Number.isInteger(src.rev) && src.rev >= 0 ? src.rev : 0,
      updatedAt: cleanDate(src.updatedAt, nowIso, now),
      profile,
      categories,
      items,
    },
    errors,
  };
}
