// Pure rendering: shelf document in, HTML string out.
// Every piece of text from the document goes through esc().

import { PALETTE, LINKS } from "./schema.js";

const ENTITIES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
export const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ENTITIES[c]);

export const colorOf = (cat) => PALETTE[cat?.color] ?? PALETTE.stone;

const svg = (body, size = 18) =>
  `<svg class="icon" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${body}</svg>`;

export const ICON = {
  edit: svg('<path d="M4 20h4L19.5 8.5a2.12 2.12 0 0 0-3-3L5 17v3z"/><path d="m14.5 7.5 3 3"/>'),
  plus: svg('<path d="M12 5v14M5 12h14"/>'),
  close: svg('<path d="M6 6l12 12M18 6 6 18"/>'),
  out: svg('<path d="M8 16 16 8M9 8h7v7"/>', 15),
  up: svg('<path d="m6 14 6-6 6 6"/>'),
  down: svg('<path d="m6 10 6 6 6-6"/>'),
  lock: svg('<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>'),
  check: svg('<path d="m5 12.5 4.5 4.5L19 7.5"/>'),
};

// ---------------------------------------------------------------- dates

const DAY = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" });
const FULL = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" });
const MONTH = new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric" });
const REL = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

export const fmtDate = (iso) => FULL.format(new Date(iso));

export function relTime(iso, now = Date.now()) {
  const diff = (Date.parse(iso) - now) / 1000;
  const abs = Math.abs(diff);
  if (abs < 45) return "just now";
  if (abs < 3600) return REL.format(Math.round(diff / 60), "minute");
  if (abs < 86400) return REL.format(Math.round(diff / 3600), "hour");
  if (abs < 86400 * 7) return REL.format(Math.round(diff / 86400), "day");
  if (abs < 86400 * 28) return REL.format(Math.round(diff / (86400 * 7)), "week");
  return `on ${FULL.format(new Date(iso))}`;
}

// ---------------------------------------------------------------- queries

const byNewest = (a, b) => Date.parse(b.item.addedAt) - Date.parse(a.item.addedAt) || a.index - b.index;

/** All items, newest first (ties keep the order they were written in). */
export function newestFirst(doc) {
  return doc.items.map((item, index) => ({ item, index })).sort(byNewest).map((x) => x.item);
}

/** Map of category id to its items, newest first. */
export function itemsByCategory(doc) {
  const map = new Map(doc.categories.map((c) => [c.id, []]));
  for (const item of newestFirst(doc)) map.get(item.categoryId)?.push(item);
  return map;
}

/** The categories that take part in the intro sentence, with their items. */
export function sentenceSlots(doc) {
  const groups = itemsByCategory(doc);
  return doc.categories
    .filter((c) => c.sentence?.on && groups.get(c.id)?.length)
    .map((cat) => ({ cat, items: groups.get(cat.id) }));
}

/** How a title reads mid-sentence: "Space exploration" becomes "space exploration", "AI" stays. */
export function sentenceForm(cat, title) {
  if (!cat.sentence?.lower) return title;
  const [a, b] = Array.from(title);
  if (b && b === b.toUpperCase() && b !== b.toLowerCase()) return title;
  return a ? a.toLowerCase() + title.slice(a.length) : title;
}

/** Items added after launch day and within the last 30 days get a "New" mark. */
export function newChecker(doc, now = Date.now()) {
  const first = Math.min(...doc.items.map((i) => Date.parse(i.addedAt)));
  return (item) => {
    const t = Date.parse(item.addedAt);
    return t - first > 86400000 && now - t < 30 * 86400000;
  };
}

/** Colours of the two most recently touched categories, for the stitched x in the logo. */
export function latestColors(doc) {
  const colors = [];
  const cats = new Map(doc.categories.map((c) => [c.id, c]));
  for (const item of newestFirst(doc)) {
    const c = colorOf(cats.get(item.categoryId));
    if (!colors.includes(c)) colors.push(c);
    if (colors.length === 2) break;
  }
  while (colors.length < 2) colors.push(colors[0] ?? PALETTE.stone);
  return colors;
}

// ---------------------------------------------------------------- hero

/**
 * The opening paragraph. Words are wrapped so the page can reveal them in
 * sequence; each slot is a button that flips through its category.
 * `picks` maps category id to the index currently showing.
 */
export function heroHTML(doc, picks = {}) {
  const units = [];
  let i = 0;
  const add = (html, attach = false) => units.push({ html, attach });
  const word = (text, cls = "") => add(`<span class="w${cls}" style="--i:${i++}">${esc(text)}</span>`);
  const words = (text, cls) => String(text).split(/\s+/).filter(Boolean).forEach((w) => word(w, cls));
  const punct = (text) => add(`<span class="w is-punct" style="--i:${Math.max(0, i - 1)}">${esc(text)}</span>`, true);

  const { name, nickname, intro } = doc.profile;
  word("I’m");
  words(name, " is-name");
  if (nickname) word(`(${nickname})`, " is-nick");
  if (intro) {
    punct(",");
    words(intro);
  }
  punct(".");

  const slots = sentenceSlots(doc);
  if (slots.length) {
    words("Lately I’ve been");
    slots.forEach(({ cat, items }, k) => {
      const at = (picks[cat.id] ?? 0) % items.length;
      const item = items[at];
      if (cat.sentence.before) words(cat.sentence.before);
      const label = items.length > 1 ? `${item.title}, ${at + 1} of ${items.length} in ${cat.name}` : `${item.title}, the only one in ${cat.name} so far`;
      add(
        `<button type="button" class="w slot" style="--i:${i++};--c:${colorOf(cat)}" data-cat="${esc(cat.id)}" data-count="${items.length}" aria-label="${esc(label)}" aria-describedby="hero-hint"><span class="slot-face">${esc(sentenceForm(cat, item.title))}</span></button>`
      );
      if (cat.sentence.after) words(cat.sentence.after);
      if (k < slots.length - 2) punct(",");
      else if (k === slots.length - 2) word("and");
    });
    punct(".");
  }

  return units.map((u, k) => (k === 0 || u.attach ? "" : " ") + u.html).join("");
}

// ---------------------------------------------------------------- patches

function hash(text) {
  let h = 2166136261;
  for (const ch of text) {
    h ^= ch.codePointAt(0);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const patchCache = new Map();

/**
 * A small cross-stitched patch, generated from the item's name: a 5×5 motif
 * mirrored both ways, like an embroidery sampler. The same name always gets
 * the same patch.
 */
export function patchSVG(title) {
  const key = title.trim().toLowerCase();
  if (patchCache.has(key)) return patchCache.get(key);
  let picked = [];
  for (let salt = 0; salt < 16; salt++) {
    const h = hash(salt ? `${key}#${salt}` : key);
    picked = [];
    for (let i = 0; i < 9; i++) if ((h >>> i) & 1) picked.push([i % 3, Math.floor(i / 3)]);
    if (picked.length >= 4 && picked.length <= 7) break;
  }
  const cells = new Set();
  for (const [x, y] of picked) for (const [a, b] of [[x, y], [4 - x, y], [x, 4 - y], [4 - x, 4 - y]]) cells.add(`${a},${b}`);
  const d = [...cells]
    .map((c) => c.split(",").map(Number))
    .map(([x, y]) => `M${x + 0.15} ${y + 0.15}L${x + 0.85} ${y + 0.85}M${x + 0.85} ${y + 0.15}L${x + 0.15} ${y + 0.85}`)
    .join("");
  const svg = `<svg class="patch" viewBox="0 0 5 5" aria-hidden="true" focusable="false"><path d="${d}"/></svg>`;
  patchCache.set(key, svg);
  return svg;
}

// ---------------------------------------------------------------- shelf

function titleHTML(item) {
  const title = esc(item.title);
  if (!item.link) return title;
  return `<a class="out" href="${esc(item.link)}" target="_blank" rel="noopener noreferrer">${title}${ICON.out}<span class="sr-only"> (opens in a new tab)</span></a>`;
}

const badge = (fresh) => (fresh ? ` <span class="badge">New</span>` : "");

const editButton = (item) =>
  `<button type="button" class="icon-btn item-edit" data-action="edit-item" data-id="${esc(item.id)}" aria-label="Edit ${esc(item.title)}">${ICON.edit}</button>`;

function itemHTML(item, ctx) {
  return `<li class="item" data-id="${esc(item.id)}">
  ${patchSVG(item.title)}
  <div class="item-body">
    <p class="item-title">${titleHTML(item)}${badge(ctx.isNew(item))}</p>
    ${item.note ? `<p class="item-note">${esc(item.note)}</p>` : ""}
    ${item.since ? `<p class="item-since">Since ${esc(item.since)}</p>` : ""}
  </div>
  ${ctx.editing ? editButton(item) : ""}
</li>`;
}

function categoryHTML(cat, items, ctx) {
  const id = esc(cat.id);
  const name = esc(cat.name);
  return `<section class="cat" id="cat-${id}" style="--c:${colorOf(cat)}" aria-labelledby="cat-${id}-name">
  <div class="cat-head">
    <h3 class="cat-name" id="cat-${id}-name"><span class="dot" aria-hidden="true"></span>${name}<span class="cat-count"><span class="sr-only">, </span>${items.length}<span class="sr-only"> ${items.length === 1 ? "thing" : "things"}</span></span></h3>
    ${ctx.editing ? `<button type="button" class="icon-btn" data-action="edit-category" data-id="${id}" aria-label="Edit the ${name} category">${ICON.edit}</button>` : ""}
  </div>
  ${items.length ? `<ul class="items" role="list">${items.map((it) => itemHTML(it, ctx)).join("")}</ul>` : `<p class="cat-empty">Nothing here yet.</p>`}
  ${ctx.editing ? `<button type="button" class="add-inline" data-action="add-item" data-cat="${id}">${ICON.plus}<span>Add to ${name}</span></button>` : ""}
</section>`;
}

function rowHTML(item, cat, ctx) {
  const d = new Date(item.addedAt);
  return `<li class="row" data-id="${esc(item.id)}" style="--c:${colorOf(cat)}">
  ${patchSVG(item.title)}
  <div class="row-body">
    <p class="row-title">${titleHTML(item)}${badge(ctx.isNew(item))}</p>
    ${item.note ? `<p class="row-note">${esc(item.note)}</p>` : ""}
  </div>
  <div class="row-meta">
    <time class="row-date" datetime="${esc(item.addedAt)}" title="Added ${esc(fmtDate(item.addedAt))}">${esc(DAY.format(d))}</time>
    <p class="row-cat"><span class="dot" aria-hidden="true"></span>${esc(cat?.name ?? "")}</p>
  </div>
  ${ctx.editing ? editButton(item) : ""}
</li>`;
}

export function shelfHTML(doc, { view = "category", editing = false, now = Date.now() } = {}) {
  const ctx = { editing, isNew: newChecker(doc, now) };
  if (!doc.items.length && !editing) {
    return `<p class="shelf-empty">The shelf is empty for now.</p>`;
  }

  if (view === "timeline") {
    const cats = new Map(doc.categories.map((c) => [c.id, c]));
    const months = [];
    for (const item of newestFirst(doc)) {
      const d = new Date(item.addedAt);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      if (months.at(-1)?.key !== key) months.push({ key, label: MONTH.format(d), items: [] });
      months.at(-1).items.push(item);
    }
    if (!months.length) return `<p class="shelf-empty">Nothing on the shelf yet. Add your first thing.</p>`;
    return `<div class="timeline">${months
      .map(
        (m) => `<section class="month" aria-labelledby="m-${m.key}">
  <h3 class="month-name" id="m-${m.key}">${esc(m.label)}</h3>
  <ol class="rows" role="list">${m.items.map((it) => rowHTML(it, cats.get(it.categoryId), ctx)).join("")}</ol>
</section>`
      )
      .join("")}</div>`;
  }

  const groups = itemsByCategory(doc);
  const cats = doc.categories.filter((c) => editing || groups.get(c.id).length);
  return `<div class="cats">${cats.map((c) => categoryHTML(c, groups.get(c.id), ctx)).join("")}</div>`;
}

// ---------------------------------------------------------------- footer

/** "Find me on GitHub, LinkedIn and Instagram, or email me." — or "" when there are no links. */
export function contactHTML(doc) {
  const links = doc.profile.links ?? {};
  const web = LINKS.filter((l) => l.key !== "email" && links[l.key]);
  const email = links.email;
  if (!web.length && !email) return "";
  const a = (href, label) => `<a href="${esc(href)}" rel="me noopener" target="_blank">${esc(label)}</a>`;
  const list = web.map((l) => a(links[l.key], l.label));
  const joined = list.length > 1 ? `${list.slice(0, -1).join(", ")} and ${list.at(-1)}` : list[0] ?? "";
  const mail = email ? `<a href="mailto:${esc(email)}">email me</a>` : "";
  if (joined && mail) return `Find me on ${joined}, or ${mail}.`;
  if (joined) return `Find me on ${joined}.`;
  return `Say hello: ${mail.replace(">email me<", `>${esc(email)}<`)}.`;
}
