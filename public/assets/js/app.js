// The public page: load the shelf, draw it, and make the intro playable.
// Editing lives in admin.js and only loads when the owner asks for it.

import { SEED } from "./seed.js";
import { sanitizeDoc } from "./schema.js";
import {
  heroHTML,
  shelfHTML,
  contactHTML,
  sentenceSlots,
  sentenceForm,
  relTime,
  fmtDate,
  latestColors,
} from "./render.js";

const CACHE_KEY = "shmshxr:shelf:v1";
const OWNER_KEY = "shmshxr:owner";
const VIEW_KEY = "shmshxr:view";

const $ = (selector) => document.querySelector(selector);
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
const canHover = matchMedia("(hover: hover) and (pointer: fine)");

const local = {
  get(key) {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key, value) {
    try {
      if (value == null) localStorage.removeItem(key);
      else localStorage.setItem(key, value);
    } catch {
      /* private mode or storage blocked: the page works without it */
    }
  },
};

const els = {
  root: document.documentElement,
  header: $(".site-header"),
  heroText: $("#hero-text"),
  heroStatus: $("#hero-status"),
  heroHint: $("#hero-hint"),
  heroUpdated: $("#hero-updated"),
  shelf: $("#shelf-body"),
  seg: $("#shelf-view"),
  contact: $("#contact-text"),
  navContact: $("#nav-contact"),
  footUpdated: $("#foot-updated"),
  year: $("#year"),
  owner: $("#owner-edit"),
  toasts: $("#toasts"),
  live: $("#sr-status"),
  glow: $("#glow"),
};

const state = {
  doc: null,
  view: local.get(VIEW_KEY) === "timeline" ? "timeline" : "category",
  picks: {},
  editing: false,
};

// ---------------------------------------------------------------- data

function readCache() {
  const raw = local.get(CACHE_KEY);
  if (!raw) return null;
  try {
    return sanitizeDoc(JSON.parse(raw)).doc;
  } catch {
    return null;
  }
}

function writeCache(doc) {
  local.set(CACHE_KEY, JSON.stringify(doc));
}

async function fetchShelf() {
  const res = await fetch("/api/shelf");
  if (!res.ok) throw new Error(`The shelf answered ${res.status}`);
  return sanitizeDoc(await res.json()).doc;
}

const sameDoc = (a, b) => a && b && a.rev === b.rev && a.updatedAt === b.updatedAt;

// ---------------------------------------------------------------- drawing

function renderHero({ reveal = false } = {}) {
  const doc = state.doc;
  els.heroText.innerHTML = heroHTML(doc, state.picks);
  els.heroText.classList.add("is-ready");

  const status = doc.profile.status;
  els.heroStatus.hidden = !status;
  els.heroStatus.querySelector(".status-text").textContent = status;
  els.heroHint.hidden = sentenceSlots(doc).length === 0;

  if (reveal && !reducedMotion.matches) {
    document.body.classList.add("is-intro");
    setTimeout(() => document.body.classList.remove("is-intro"), 2600);
  }
}

function renderMeta() {
  const { updatedAt } = state.doc;
  els.heroUpdated.textContent = `Updated ${relTime(updatedAt)}`;
  els.heroUpdated.title = fmtDate(updatedAt);
  els.footUpdated.textContent = `Updated ${fmtDate(updatedAt)}`;
  els.year.textContent = String(new Date().getFullYear());
  const [a, b] = latestColors(state.doc);
  els.root.style.setProperty("--x1", a);
  els.root.style.setProperty("--x2", b);
}

function renderShelf({ animate = false } = {}) {
  els.shelf.innerHTML = shelfHTML(state.doc, { view: state.view, editing: state.editing });
  els.seg.dataset.active = state.view;
  for (const btn of els.seg.querySelectorAll("[data-view]")) {
    btn.setAttribute("aria-pressed", String(btn.dataset.view === state.view));
  }
  if (animate && !reducedMotion.matches) {
    els.shelf.animate(
      [
        { opacity: 0, transform: "translateY(8px)" },
        { opacity: 1, transform: "none" },
      ],
      { duration: 420, easing: "cubic-bezier(.16,1,.3,1)" }
    );
  }
}

function renderContact() {
  const html = contactHTML(state.doc);
  els.contact.innerHTML = html;
  els.contact.hidden = !html;
  els.navContact.hidden = !html;
}

function renderAll(options = {}) {
  renderHero(options);
  renderMeta();
  renderShelf(options);
  renderContact();
}

/** Redraw after the live copy turns out to differ from what's on screen. */
function softRender() {
  renderAll();
  if (reducedMotion.matches) return;
  for (const el of [els.heroText, els.shelf]) {
    el.animate([{ opacity: 0.25 }, { opacity: 1 }], { duration: 500, easing: "ease-out" });
  }
}

function setView(view) {
  if (view === state.view) return;
  state.view = view;
  local.set(VIEW_KEY, view);
  renderShelf({ animate: true });
}

// ---------------------------------------------------------------- the playable intro

function announce(message) {
  els.live.textContent = "";
  requestAnimationFrame(() => {
    els.live.textContent = message;
  });
}

function swapFace(button, text) {
  const old = button.querySelector(".slot-face");
  if (!old) return;
  if (reducedMotion.matches || typeof button.animate !== "function") {
    old.textContent = text;
    return;
  }
  button.getAnimations({ subtree: true }).forEach((a) => a.finish());
  button.querySelectorAll(".slot-face.is-leaving").forEach((n) => n.remove());

  const lineHeight = parseFloat(getComputedStyle(button).lineHeight) || 0;
  const oneLine = () => !lineHeight || button.offsetHeight < lineHeight * 1.5;
  const fromWidth = button.getBoundingClientRect().width;
  const wasOneLine = oneLine();

  const face = document.createElement("span");
  face.className = "slot-face";
  face.textContent = text;
  old.replaceWith(face);
  const toWidth = button.getBoundingClientRect().width;
  const ease = "cubic-bezier(.2,.8,.2,1)";

  if (!(wasOneLine && oneLine())) {
    face.animate([{ opacity: 0, filter: "blur(6px)" }, { opacity: 1, filter: "blur(0)" }], { duration: 420, easing: ease });
    return;
  }

  old.classList.add("is-leaving");
  button.prepend(old);
  button.classList.add("is-flipping");
  const grow = toWidth > fromWidth;
  const resize = button.animate([{ width: `${fromWidth}px` }, { width: `${toWidth}px` }], { duration: 460, easing: ease });
  old
    .animate(
      [
        { opacity: 1, transform: "translateY(0)", filter: "blur(0)" },
        { opacity: 0, transform: "translateY(-0.45em)", filter: "blur(8px)" },
      ],
      { duration: 280, easing: "cubic-bezier(.4,0,1,1)", fill: "forwards" }
    )
    .finished.then(() => old.remove(), () => old.remove());
  face.animate(
    [
      { opacity: 0, transform: "translateY(0.45em)", filter: "blur(8px)" },
      { opacity: 1, transform: "none", filter: "blur(0)" },
    ],
    { duration: 520, delay: grow ? 170 : 90, easing: ease, fill: "backwards" }
  );
  resize.finished.then(
    () => button.classList.remove("is-flipping"),
    () => button.classList.remove("is-flipping")
  );
}

function jumpTo(categoryId) {
  if (state.view !== "category") setView("category");
  const section = document.getElementById(`cat-${categoryId}`);
  if (!section) return;
  section.scrollIntoView({ behavior: reducedMotion.matches ? "auto" : "smooth", block: "center" });
  section.classList.remove("is-flash");
  void section.offsetWidth;
  section.classList.add("is-flash");
  const heading = section.querySelector(".cat-name");
  heading.setAttribute("tabindex", "-1");
  heading.focus({ preventScroll: true });
}

function flip(button) {
  const id = button.dataset.cat;
  const slot = sentenceSlots(state.doc).find((s) => s.cat.id === id);
  if (!slot) return;
  if (slot.items.length < 2) {
    jumpTo(id);
    return;
  }
  const next = ((state.picks[id] ?? 0) + 1) % slot.items.length;
  state.picks[id] = next;
  const item = slot.items[next];
  const label = `${item.title}, ${next + 1} of ${slot.items.length} in ${slot.cat.name}`;
  button.setAttribute("aria-label", label);
  swapFace(button, sentenceForm(slot.cat, item.title));
  announce(label);
  glowAt(button);
}

function glowAt(button) {
  const r = button.getBoundingClientRect();
  els.glow.style.setProperty("--gx", `${r.left + r.width / 2}px`);
  els.glow.style.setProperty("--gy", `${r.top + r.height / 2}px`);
  els.glow.style.setProperty("--gc", button.style.getPropertyValue("--c"));
  els.glow.classList.add("is-on");
}

function glowOff() {
  els.glow.classList.remove("is-on");
}

// ---------------------------------------------------------------- toasts

export function toast(message, { actionLabel, onAction, timeout = 5200 } = {}) {
  const el = document.createElement("div");
  el.className = "toast";
  const text = document.createElement("p");
  text.className = "toast-text";
  text.textContent = message;
  el.append(text);
  let timer;
  const close = () => {
    clearTimeout(timer);
    if (el.classList.contains("is-leaving")) return;
    el.classList.add("is-leaving");
    setTimeout(() => el.remove(), 230);
  };
  if (actionLabel) {
    const action = document.createElement("button");
    action.type = "button";
    action.className = "toast-action";
    action.textContent = actionLabel;
    action.addEventListener("click", () => {
      close();
      onAction?.();
    });
    el.append(action);
  }
  els.toasts.append(el);
  while (els.toasts.children.length > 3) els.toasts.firstElementChild.remove();
  timer = setTimeout(close, timeout);
  el.addEventListener("pointerenter", () => clearTimeout(timer));
  el.addEventListener("pointerleave", () => {
    timer = setTimeout(close, 2400);
  });
  el.addEventListener("focusin", () => clearTimeout(timer));
  return close;
}

// ---------------------------------------------------------------- editing hand-off

const app = {
  getDoc: () => state.doc,
  setDoc(doc) {
    state.doc = doc;
    writeCache(doc);
    renderAll();
  },
  isEditing: () => state.editing,
  setEditing(on) {
    state.editing = on;
    els.root.classList.toggle("is-editing", on);
    renderShelf();
  },
  setOwner(on) {
    local.set(OWNER_KEY, on ? "1" : null);
    els.owner.hidden = !on;
  },
  getView: () => state.view,
  setView,
  toast,
  announce,
};

let admin = null;
async function openEditor() {
  try {
    admin ??= await import("./admin.js");
    await admin.start(app);
  } catch (err) {
    console.error(err);
    toast("Editing couldn’t load. Refresh the page and try again.");
  }
}

// ---------------------------------------------------------------- events

document.addEventListener("click", (event) => {
  const target = event.target instanceof Element ? event.target : null;
  if (!target) return;
  const slot = target.closest(".slot");
  if (slot) {
    flip(slot);
    return;
  }
  const viewButton = target.closest("[data-view]");
  if (viewButton) {
    setView(viewButton.dataset.view);
    return;
  }
  if (target.closest('[data-action="edit"]')) openEditor();
});

els.heroText.addEventListener("pointerover", (event) => {
  const slot = event.target instanceof Element && event.target.closest(".slot");
  if (slot && canHover.matches) glowAt(slot);
});
els.heroText.addEventListener("pointerout", (event) => {
  const slot = event.target instanceof Element && event.target.closest(".slot");
  if (slot && !slot.contains(event.relatedTarget)) glowOff();
});
els.heroText.addEventListener("focusin", (event) => {
  if (event.target instanceof Element && event.target.matches(".slot:focus-visible")) glowAt(event.target);
});
els.heroText.addEventListener("focusout", glowOff);
addEventListener("scroll", glowOff, { passive: true });

new IntersectionObserver(([entry]) => els.header.classList.toggle("is-scrolled", !entry.isIntersecting), {
  rootMargin: "-8px 0px 0px 0px",
}).observe(document.querySelector(".hero"));

// ---------------------------------------------------------------- start

async function boot() {
  const cached = readCache();
  const live = fetchShelf();
  live.catch(() => {});

  let doc = cached;
  if (!doc) doc = await Promise.race([live.catch(() => null), wait(1600).then(() => null)]);
  if (document.fonts?.ready) await Promise.race([document.fonts.ready, wait(700)]);

  state.doc = doc ?? sanitizeDoc(SEED).doc;
  renderAll({ reveal: true });
  els.owner.hidden = local.get(OWNER_KEY) !== "1";

  if (/^\/edit\/?$/.test(location.pathname)) openEditor();

  try {
    const fresh = await live;
    writeCache(fresh);
    if (!state.editing && !sameDoc(fresh, state.doc)) {
      state.doc = fresh;
      softRender();
    }
  } catch (err) {
    console.info("Showing the saved copy of the shelf.", err?.message ?? err);
  }
}

boot();
