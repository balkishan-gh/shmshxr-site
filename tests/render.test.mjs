// Checks of the shared rules and the HTML the page draws.

import { test } from "node:test";
import assert from "node:assert/strict";

import { SEED } from "../public/assets/js/seed.js";
import { sanitizeDoc, cleanUrl, cleanEmail, makeId } from "../public/assets/js/schema.js";
import { heroHTML, shelfHTML, contactHTML, sentenceForm, sentenceSlots, newChecker } from "../public/assets/js/render.js";

const seed = () => sanitizeDoc(SEED).doc;
const text = (html) => html.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();

test("the seed is valid", () => {
  const { errors, doc } = sanitizeDoc(SEED);
  assert.deepEqual(errors, []);
  assert.equal(doc.items.length, 17);
  assert.equal(doc.categories.length, 11);
});

test("the intro reads as one sentence built from the newest picks", () => {
  assert.equal(
    text(heroHTML(seed())),
    "I’m Bal Kishan (shmshxr), a computer science engineer building a career in full stack development. Lately I’ve been watching Rick and Morty, playing Anuv Jain on repeat and thinking about AI."
  );
});

test("flipping a slot moves through its category", () => {
  const html = heroHTML(seed(), { shows: 1, curious: 2 });
  assert.match(text(html), /watching Family Guy,/);
  assert.match(text(html), /thinking about space exploration\.$/);
});

test("the intro grows when a project is added", () => {
  const doc = seed();
  doc.items.push({ id: "shelf-app-x1y2", categoryId: "projects", title: "This site", note: "", since: "", link: "", addedAt: "2026-11-02T10:00:00.000Z" });
  assert.match(text(heroHTML(doc)), /Lately I’ve been building This site, watching Rick and Morty, playing Anuv Jain on repeat and thinking about AI\.$/);
});

test("two slots join with 'and', one slot stands alone", () => {
  const doc = seed();
  doc.categories.find((c) => c.id === "artists").sentence.on = false;
  assert.match(text(heroHTML(doc)), /watching Rick and Morty and thinking about AI\.$/);
  doc.categories.find((c) => c.id === "curious").sentence.on = false;
  assert.match(text(heroHTML(doc)), /Lately I’ve been watching Rick and Morty\.$/);
});

test("lowercasing keeps acronyms", () => {
  const cat = { sentence: { lower: true } };
  assert.equal(sentenceForm(cat, "AI"), "AI");
  assert.equal(sentenceForm(cat, "Space exploration"), "space exploration");
  assert.equal(sentenceForm({ sentence: { lower: false } }, "Space exploration"), "Space exploration");
});

test("everything typed in is escaped", () => {
  const doc = seed();
  doc.profile.name = `<img src=x onerror=alert(1)>`;
  doc.items[0].title = `"><script>alert(1)</script>`;
  doc.categories[1].name = `<b>Shows</b>`;
  for (const html of [heroHTML(doc), shelfHTML(doc), shelfHTML(doc, { view: "timeline" }), shelfHTML(doc, { editing: true })]) {
    assert.doesNotMatch(html, /<script>|<img src=x|<b>Shows/);
  }
});

test("empty categories only show while editing", () => {
  assert.doesNotMatch(shelfHTML(seed()), /cat-projects/);
  assert.match(shelfHTML(seed(), { editing: true }), /cat-projects/);
  assert.match(shelfHTML(seed(), { editing: true }), /Add to Projects/);
});

test("the timeline groups by month, newest first", () => {
  const doc = seed();
  doc.items.push({ id: "new-one-a1b2", categoryId: "shows", title: "Severance", note: "", since: "", link: "", addedAt: "2027-01-10T10:00:00.000Z" });
  const html = shelfHTML(doc, { view: "timeline", now: Date.parse("2027-01-12T00:00:00Z") });
  assert.ok(html.indexOf("January 2027") < html.indexOf("October 2026"));
  assert.match(html, /Severance <span class="badge">New<\/span>/);
});

test("launch-day items are not marked new", () => {
  const doc = seed();
  const isNew = newChecker(doc, Date.parse("2026-10-28T00:00:00Z"));
  assert.ok(doc.items.every((i) => !isNew(i)));
});

test("links and emails are checked", () => {
  assert.equal(cleanUrl("github.com/balkishan-gh"), "https://github.com/balkishan-gh");
  assert.equal(cleanUrl("javascript:alert(1)"), null);
  assert.equal(cleanUrl("not a url"), null);
  assert.equal(cleanUrl(""), "");
  assert.equal(cleanEmail("mailto:hi@example.com"), "hi@example.com");
  assert.equal(cleanEmail("nope"), null);
});

test("ids are unique and readable", () => {
  const taken = new Set();
  for (let i = 0; i < 200; i++) taken.add(makeId("Breaking Bad", taken));
  assert.equal(taken.size, 200);
  assert.match([...taken][0], /^breaking-bad-[a-z0-9]{4}$/);
});

test("the footer sentence lists whatever links exist", () => {
  const doc = seed();
  assert.equal(text(contactHTML(doc)), "Find me on GitHub.");
  doc.profile.links.linkedin = "https://www.linkedin.com/in/someone";
  doc.profile.links.email = "hi@example.com";
  assert.equal(text(contactHTML(doc)), "Find me on GitHub and LinkedIn, or email me.");
  doc.profile.links = { github: "", linkedin: "", instagram: "", x: "", email: "" };
  assert.equal(contactHTML(doc), "");
});

test("sentence slots skip empty and switched-off categories", () => {
  assert.deepEqual(
    sentenceSlots(seed()).map((s) => s.cat.id),
    ["shows", "artists", "curious"]
  );
});
