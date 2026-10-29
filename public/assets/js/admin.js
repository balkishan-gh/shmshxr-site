// Edit mode: unlock with the edit key, then add, change and remove things.
// Loaded on demand from app.js, so visitors never download it.

import { sanitizeDoc, makeId, slugify, cleanText, cleanUrl, cleanEmail, PALETTE, COLOR_NAMES, LIMITS, LINKS } from "./schema.js";
import { esc, ICON, itemsByCategory, sentenceForm } from "./render.js";

let app = null;
let built = false;
let queue = Promise.resolve();
let lastCategory = null;
const dlg = {};
let bar = null;

const COLOR_LABELS = {
  coral: "Coral",
  orange: "Orange",
  amber: "Amber",
  lime: "Lime",
  green: "Green",
  teal: "Teal",
  sky: "Sky",
  blue: "Blue",
  violet: "Violet",
  pink: "Pink",
  stone: "Stone",
};

// ---------------------------------------------------------------- entry points

export async function start(appApi) {
  app = appApi;
  if (!built) build();
  if (app.isEditing()) return;
  const signedIn = await checkSession();
  if (signedIn === true) await enter();
  else if (signedIn === false) openUnlock();
}

async function checkSession() {
  try {
    await api("GET", "/api/admin/session");
    return true;
  } catch (err) {
    if (err.status === 401) return false;
    app.toast(err.message);
    return null;
  }
}

async function enter() {
  try {
    const doc = await api("GET", "/api/admin/shelf");
    app.setDoc(sanitizeDoc(doc).doc);
  } catch (err) {
    if (err.status === 401) openUnlock();
    else app.toast(err.message);
    return;
  }
  if (app.getView() !== "category") app.setView("category");
  app.setEditing(true);
  app.setOwner(true);
  bar.hidden = false;
  if (location.pathname !== "/") history.replaceState(null, "", `/${location.hash}`);
  app.toast("You’re editing. Changes save as you make them.");
}

function exit() {
  app.setEditing(false);
  bar.hidden = true;
}

function signedOut() {
  Object.values(dlg).forEach((d) => d.open && d.close());
  exit();
  openUnlock("Your session ended. Enter your edit key to keep editing.");
}

// ---------------------------------------------------------------- server

async function api(method, path, body) {
  let res;
  try {
    res = await fetch(path, {
      method,
      credentials: "same-origin",
      cache: "no-store",
      headers: body === undefined ? { accept: "application/json" } : { accept: "application/json", "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw Object.assign(new Error("Couldn’t reach the server. Check your connection and try again."), { status: 0 });
  }
  let data = null;
  if (res.status !== 204) {
    try {
      data = await res.json();
    } catch {
      data = null;
    }
  }
  if (!res.ok) {
    const err = new Error(data?.error?.message || `Something went wrong (error ${res.status}). Try again.`);
    err.status = res.status;
    err.code = data?.error?.code;
    err.detail = data?.error ?? null;
    throw err;
  }
  return data;
}

/**
 * Apply a change: draw it straight away, save it, then draw what the server
 * kept. Saves run one at a time so each one builds on the last.
 * Resolves to { ok: true } or { ok: false, error }.
 */
function commit(mutate, { message, undo = false } = {}) {
  const run = async () => {
    const before = app.getDoc();
    const draft = mutate(structuredClone(before));
    if (!draft) return { ok: false, error: "That item isn’t on the shelf any more." };
    const { doc: clean, errors } = sanitizeDoc(draft);
    if (errors.length) return { ok: false, error: errors[0].message };

    app.setDoc({ ...clean, rev: before.rev, updatedAt: new Date().toISOString() });
    try {
      const saved = sanitizeDoc(await api("PUT", "/api/admin/shelf", { baseRev: before.rev, doc: clean })).doc;
      app.setDoc(saved);
      if (message) app.toast(message, undo ? { actionLabel: "Undo", onAction: () => restore(before) } : {});
      return { ok: true, doc: saved };
    } catch (err) {
      if (err.status === 409 && err.detail?.doc) {
        app.setDoc(sanitizeDoc(err.detail.doc).doc);
        return { ok: false, error: "This page changed on another device, so the latest version is now loaded. Make your change again." };
      }
      app.setDoc(before);
      if (err.status === 401) {
        signedOut();
        return { ok: false, error: null };
      }
      return { ok: false, error: err.message };
    }
  };
  const next = queue.then(run, run);
  queue = next.then(
    () => {},
    () => {}
  );
  return next;
}

function restore(snapshot) {
  commit(() => structuredClone(snapshot), { message: "Undone." }).then((r) => {
    if (!r.ok && r.error) app.toast(r.error);
  });
}

// ---------------------------------------------------------------- building the UI

function dialog(key, title, body, foot) {
  const d = document.createElement("dialog");
  d.className = "sheet";
  d.id = `dlg-${key}`;
  d.setAttribute("aria-labelledby", `dlg-${key}-title`);
  d.innerHTML = `<form class="sheet-form" novalidate>
  <div class="sheet-head">
    <h2 class="sheet-title" id="dlg-${key}-title">${esc(title)}</h2>
    <button type="button" class="icon-btn" data-close aria-label="Close">${ICON.close}</button>
  </div>
  <div class="sheet-content">${body}</div>
  <div class="sheet-foot">${foot}</div>
</form>`;
  d.addEventListener("click", (event) => {
    if (event.target.closest?.("[data-close]")) {
      d.close();
      return;
    }
    if (event.target !== d) return;
    const r = d.getBoundingClientRect();
    const inside = event.clientX >= r.left && event.clientX <= r.right && event.clientY >= r.top && event.clientY <= r.bottom;
    if (!inside) d.close();
  });
  document.body.append(d);
  dlg[key] = d;
  return d;
}

const field = (id, label, input, { optional = false, help = "" } = {}) => `<div class="field">
  <label for="${id}">${esc(label)}${optional ? ' <span class="opt">(optional)</span>' : ""}</label>
  ${input}
  ${help ? `<p class="help" id="${id}-help">${help}</p>` : ""}
  <p class="field-error" id="${id}-error" hidden></p>
</div>`;

function build() {
  built = true;

  bar = document.createElement("div");
  bar.className = "editbar";
  bar.hidden = true;
  bar.setAttribute("role", "group");
  bar.setAttribute("aria-label", "Editing tools");
  bar.innerHTML = `<span class="editbar-status"><span class="dot" aria-hidden="true"></span><span>Editing</span></span>
  <button type="button" class="btn btn-primary" data-admin="add">${ICON.plus}<span>Add</span></button>
  <button type="button" class="btn" data-admin="profile">Profile</button>
  <button type="button" class="btn" data-admin="done">Done</button>`;
  document.body.append(bar);

  // Unlock
  dialog(
    "unlock",
    "Unlock editing",
    `<p class="sheet-lead" data-role="lead">Only Bal can change this page. Enter your edit key to add, change or remove things.</p>
    <input class="sr-only" type="text" name="username" value="shmshxr" autocomplete="username" tabindex="-1" aria-hidden="true">
    ${field("un-key", "Edit key", `<input class="input" id="un-key" name="key" type="password" autocomplete="current-password" autocapitalize="off" spellcheck="false" aria-describedby="un-key-error">`)}
    <label class="check"><input type="checkbox" name="remember" checked> Keep me signed in on this device</label>`,
    `<span class="spacer"></span>
    <button type="button" class="btn" data-close>Cancel</button>
    <button type="submit" class="btn btn-primary" data-role="submit">Unlock</button>`
  );
  dlg.unlock.querySelector("form").addEventListener("submit", submitUnlock);

  // Item
  dialog(
    "item",
    "Add to the shelf",
    `${field("it-cat", "Category", `<select class="input" id="it-cat" name="categoryId"></select>`)}
    <div data-role="newcat" hidden>${field(
      "it-newcat",
      "Name the new category",
      `<input class="input" id="it-newcat" name="newCategory" maxlength="${LIMITS.categoryName}" autocomplete="off" placeholder="e.g. Podcasts" aria-describedby="it-newcat-error">`
    )}</div>
    ${field(
      "it-title",
      "Name",
      `<input class="input" id="it-title" name="title" maxlength="${LIMITS.title}" autocomplete="off" placeholder="e.g. Breaking Bad" aria-describedby="it-title-error">`
    )}
    ${field("it-note", "Note", `<input class="input" id="it-note" name="note" maxlength="${LIMITS.note}" autocomplete="off" placeholder="e.g. Rewatching season 2">`, { optional: true })}
    <div class="field-row">
      ${field("it-since", "Into it since", `<input class="input" id="it-since" name="since" maxlength="${LIMITS.since}" autocomplete="off" placeholder="e.g. 2019">`, { optional: true })}
      ${field(
        "it-link",
        "Link",
        `<input class="input" id="it-link" name="link" type="url" inputmode="url" maxlength="${LIMITS.url}" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="https://" aria-describedby="it-link-error">`,
        { optional: true }
      )}
    </div>
    <p class="form-error" data-role="form-error" role="alert" hidden></p>`,
    `<button type="button" class="btn btn-danger" data-role="remove" hidden>Remove</button>
    <span class="spacer"></span>
    <button type="button" class="btn" data-close>Cancel</button>
    <button type="submit" class="btn btn-primary" data-role="submit">Add to shelf</button>`
  );
  const itemForm = dlg.item.querySelector("form");
  itemForm.addEventListener("submit", submitItem);
  itemForm.elements.categoryId.addEventListener("change", syncNewCategory);
  dlg.item.querySelector('[data-role="remove"]').addEventListener("click", removeItem);

  // Category
  dialog(
    "category",
    "Edit category",
    `${field("ct-name", "Name", `<input class="input" id="ct-name" name="name" maxlength="${LIMITS.categoryName}" autocomplete="off" aria-describedby="ct-name-error">`)}
    <fieldset class="field">
      <legend>Colour</legend>
      <div class="swatches">${COLOR_NAMES.map(
        (c) => `<label class="swatch" style="--c:${PALETTE[c]}"><input type="radio" name="color" value="${c}" aria-label="${COLOR_LABELS[c]}"><span></span></label>`
      ).join("")}</div>
    </fieldset>
    <div class="field">
      <label class="switch"><span>Show in your intro</span><input type="checkbox" name="sentenceOn" role="switch"></label>
      <p class="help">Your intro shows the newest thing from this category, and visitors can flip through the rest.</p>
    </div>
    <div class="field" data-role="phrase">
      <div class="field-row">
        ${field("ct-before", "Words before", `<input class="input" id="ct-before" name="before" maxlength="${LIMITS.phrase}" autocomplete="off" placeholder="e.g. watching">`)}
        ${field("ct-after", "Words after", `<input class="input" id="ct-after" name="after" maxlength="${LIMITS.phrase}" autocomplete="off" placeholder="e.g. on repeat">`, { optional: true })}
      </div>
      <label class="check"><input type="checkbox" name="lower"> Start with a small letter, as in “space exploration”</label>
      <p class="preview" data-role="preview"></p>
    </div>
    <div class="field">
      <span class="label" data-role="position"></span>
      <div class="order-row">
        <button type="button" class="btn" data-role="up">${ICON.up}<span>Move up</span></button>
        <button type="button" class="btn" data-role="down">${ICON.down}<span>Move down</span></button>
      </div>
    </div>
    <p class="form-error" data-role="form-error" role="alert" hidden></p>`,
    `<button type="button" class="btn btn-danger" data-role="delete">Delete</button>
    <span class="spacer"></span>
    <button type="button" class="btn" data-close>Cancel</button>
    <button type="submit" class="btn btn-primary" data-role="submit">Save</button>`
  );
  const catForm = dlg.category.querySelector("form");
  catForm.addEventListener("submit", submitCategory);
  catForm.addEventListener("input", syncCategoryPreview);
  catForm.addEventListener("change", syncCategoryPreview);
  dlg.category.querySelector('[data-role="up"]').addEventListener("click", () => moveCategory(-1));
  dlg.category.querySelector('[data-role="down"]').addEventListener("click", () => moveCategory(1));
  dlg.category.querySelector('[data-role="delete"]').addEventListener("click", deleteCategory);

  // Profile
  dialog(
    "profile",
    "Your intro",
    `<div class="field-row">
      ${field("pf-name", "Name", `<input class="input" id="pf-name" name="name" maxlength="${LIMITS.name}" autocomplete="off" aria-describedby="pf-name-error">`)}
      ${field("pf-nickname", "Nickname", `<input class="input" id="pf-nickname" name="nickname" maxlength="${LIMITS.nickname}" autocomplete="off">`, { optional: true })}
    </div>
    ${field("pf-intro", "Intro", `<textarea class="input" id="pf-intro" name="intro" rows="2" maxlength="${LIMITS.intro}"></textarea>`)}
    <p class="preview" data-role="preview"></p>
    ${field("pf-status", "Status", `<input class="input" id="pf-status" name="status" maxlength="${LIMITS.status}" autocomplete="off" placeholder="e.g. Open to full stack roles">`, {
      optional: true,
      help: "Shown as a small badge above your intro. Leave it empty to hide it.",
    })}
    <p class="subhead">Links</p>
    ${LINKS.map((l) =>
      field(
        `pf-${l.key}`,
        l.label,
        `<input class="input" id="pf-${l.key}" name="${l.key}" type="${l.key === "email" ? "email" : "url"}" inputmode="${l.key === "email" ? "email" : "url"}" maxlength="${LIMITS.url}" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="${esc(l.placeholder)}" aria-describedby="pf-${l.key}-error">`,
        { optional: true }
      )
    ).join("")}
    <p class="form-error" data-role="form-error" role="alert" hidden></p>
    <div><button type="button" class="link-btn" data-role="signout">Sign out on this device</button></div>`,
    `<span class="spacer"></span>
    <button type="button" class="btn" data-close>Cancel</button>
    <button type="submit" class="btn btn-primary" data-role="submit">Save</button>`
  );
  const profileForm = dlg.profile.querySelector("form");
  profileForm.addEventListener("submit", submitProfile);
  profileForm.addEventListener("input", syncProfilePreview);
  dlg.profile.querySelector('[data-role="signout"]').addEventListener("click", signOut);

  document.addEventListener("click", onClick);
}

function onClick(event) {
  const target = event.target instanceof Element ? event.target : null;
  if (!target || !app.isEditing()) return;
  const action = target.closest("[data-action], [data-admin]");
  if (!action) return;
  const { action: a, admin: b, id, cat } = action.dataset;
  if (a === "edit-item") openItem({ id });
  else if (a === "add-item") openItem({ categoryId: cat });
  else if (a === "edit-category") openCategory(id);
  else if (b === "add") openItem({});
  else if (b === "profile") openProfile();
  else if (b === "done") {
    exit();
    app.toast("Done. Everything you changed is live.");
  }
}

// ---------------------------------------------------------------- form helpers

function clearErrors(form) {
  form.querySelectorAll("[aria-invalid]").forEach((el) => el.removeAttribute("aria-invalid"));
  form.querySelectorAll(".field-error, .form-error").forEach((el) => {
    el.hidden = true;
    el.textContent = "";
  });
}

function fieldError(input, message) {
  input.setAttribute("aria-invalid", "true");
  const el = document.getElementById(`${input.id}-error`);
  if (el) {
    el.textContent = message;
    el.hidden = false;
  }
}

function formError(form, message) {
  const el = form.querySelector('[data-role="form-error"]');
  if (!el || !message) return;
  el.textContent = message;
  el.hidden = false;
}

function busy(form, on, label) {
  const button = form.querySelector('[data-role="submit"]');
  if (on) {
    button.dataset.label = button.textContent;
    button.textContent = label;
    button.disabled = true;
  } else {
    button.textContent = button.dataset.label || button.textContent;
    button.disabled = false;
  }
}

function focusFirstInvalid(form) {
  form.querySelector('[aria-invalid="true"]')?.focus();
}

function flashItem(id) {
  requestAnimationFrame(() => {
    const el = document.querySelector(`[data-id="${CSS.escape(id)}"]`);
    if (!el) return;
    el.classList.remove("is-added");
    void el.offsetWidth;
    el.classList.add("is-added");
  });
}

function nextColor(doc) {
  const used = new Set(doc.categories.map((c) => c.color));
  return COLOR_NAMES.find((c) => c !== "stone" && !used.has(c)) ?? COLOR_NAMES[doc.categories.length % (COLOR_NAMES.length - 1)];
}

function categoryId(name, taken) {
  const slug = slugify(name);
  return slug && !taken.has(slug) ? slug : makeId(name, taken);
}

// ---------------------------------------------------------------- unlock

function openUnlock(lead) {
  const d = dlg.unlock;
  const form = d.querySelector("form");
  clearErrors(form);
  form.elements.key.value = "";
  d.querySelector('[data-role="lead"]').textContent =
    lead ?? "Only Bal can change this page. Enter your edit key to add, change or remove things.";
  d.showModal();
  form.elements.key.focus();
}

async function submitUnlock(event) {
  event.preventDefault();
  const form = event.currentTarget;
  clearErrors(form);
  const key = form.elements.key.value.trim();
  if (!key) {
    fieldError(form.elements.key, "Enter your edit key.");
    form.elements.key.focus();
    return;
  }
  busy(form, true, "Unlocking…");
  try {
    await api("POST", "/api/admin/session", { key, remember: form.elements.remember.checked });
    dlg.unlock.close();
    await enter();
  } catch (err) {
    fieldError(form.elements.key, err.status === 401 ? "That key doesn’t match. Check it and try again." : err.message);
    form.elements.key.select();
  } finally {
    busy(form, false);
  }
}

async function signOut() {
  try {
    await api("DELETE", "/api/admin/session");
  } catch {
    /* the cookie will lapse on its own */
  }
  dlg.profile.close();
  app.setOwner(false);
  exit();
  app.toast("Signed out on this device.");
}

// ---------------------------------------------------------------- items

function syncNewCategory() {
  const form = dlg.item.querySelector("form");
  const isNew = form.elements.categoryId.value === "__new";
  dlg.item.querySelector('[data-role="newcat"]').hidden = !isNew;
  if (isNew) form.elements.newCategory.focus();
}

function openItem({ id = null, categoryId: preset = null } = {}) {
  const doc = app.getDoc();
  const item = id ? doc.items.find((i) => i.id === id) : null;
  if (id && !item) return;
  const d = dlg.item;
  const form = d.querySelector("form");
  clearErrors(form);
  d.dataset.id = item?.id ?? "";
  d.querySelector(".sheet-title").textContent = item ? "Edit" : "Add to the shelf";
  form.querySelector('[data-role="submit"]').textContent = item ? "Save changes" : "Add to shelf";
  d.querySelector('[data-role="remove"]').hidden = !item;

  const select = form.elements.categoryId;
  select.innerHTML =
    doc.categories.map((c) => `<option value="${esc(c.id)}">${esc(c.name)}</option>`).join("") +
    `<option value="__new">New category…</option>`;
  const wanted = item?.categoryId ?? preset ?? lastCategory;
  select.value = doc.categories.some((c) => c.id === wanted) ? wanted : doc.categories[0]?.id ?? "__new";
  dlg.item.querySelector('[data-role="newcat"]').hidden = select.value !== "__new";

  form.elements.newCategory.value = "";
  form.elements.title.value = item?.title ?? "";
  form.elements.note.value = item?.note ?? "";
  form.elements.since.value = item?.since ?? "";
  form.elements.link.value = item?.link ?? "";
  d.showModal();
  form.elements.title.focus();
}

async function submitItem(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const id = dlg.item.dataset.id || null;
  clearErrors(form);

  const title = cleanText(form.elements.title.value, LIMITS.title);
  const note = cleanText(form.elements.note.value, LIMITS.note);
  const since = cleanText(form.elements.since.value, LIMITS.since);
  const link = cleanUrl(form.elements.link.value);
  const newName = cleanText(form.elements.newCategory.value, LIMITS.categoryName);
  let catId = form.elements.categoryId.value;

  if (catId === "__new" && !newName) fieldError(form.elements.newCategory, "Name the new category.");
  if (!title) fieldError(form.elements.title, "Give it a name.");
  if (link === null) fieldError(form.elements.link, "That doesn’t look like a web address.");
  if (form.querySelector('[aria-invalid="true"]')) {
    focusFirstInvalid(form);
    return;
  }

  const doc = app.getDoc();
  let created = null;
  if (catId === "__new") {
    const existing = doc.categories.find((c) => c.name.toLowerCase() === newName.toLowerCase());
    if (existing) catId = existing.id;
    else {
      created = {
        id: categoryId(newName, new Set(doc.categories.map((c) => c.id))),
        name: newName,
        color: nextColor(doc),
        sentence: { on: false, before: "", after: "", lower: false },
      };
      catId = created.id;
    }
  }
  const catName = created?.name ?? doc.categories.find((c) => c.id === catId)?.name ?? "the shelf";
  const newId = id ?? makeId(title, new Set(doc.items.map((i) => i.id)));

  busy(form, true, "Saving…");
  const result = await commit(
    (draft) => {
      if (created && !draft.categories.some((c) => c.id === created.id)) draft.categories.push(created);
      if (id) {
        const it = draft.items.find((i) => i.id === id);
        if (!it) return null;
        Object.assign(it, { categoryId: catId, title, note, since, link: link || "" });
      } else {
        draft.items.push({ id: newId, categoryId: catId, title, note, since, link: link || "", addedAt: new Date().toISOString() });
      }
      return draft;
    },
    { message: id ? `Saved ${title}.` : `Added ${title} to ${catName}.`, undo: true }
  );
  busy(form, false);
  if (result.ok) {
    lastCategory = catId;
    dlg.item.close();
    flashItem(newId);
  } else formError(form, result.error);
}

async function removeItem() {
  const id = dlg.item.dataset.id;
  const item = app.getDoc().items.find((i) => i.id === id);
  if (!item) return;
  const form = dlg.item.querySelector("form");
  const result = await commit(
    (draft) => {
      draft.items = draft.items.filter((i) => i.id !== id);
      return draft;
    },
    { message: `Removed ${item.title}.`, undo: true }
  );
  if (result.ok) dlg.item.close();
  else formError(form, result.error);
}

// ---------------------------------------------------------------- categories

let catDraft = null;

function openCategory(id) {
  const doc = app.getDoc();
  const index = doc.categories.findIndex((c) => c.id === id);
  if (index < 0) return;
  const cat = doc.categories[index];
  catDraft = { id, index, total: doc.categories.length, count: doc.items.filter((i) => i.categoryId === id).length };

  const d = dlg.category;
  const form = d.querySelector("form");
  clearErrors(form);
  d.querySelector(".sheet-title").textContent = `Edit ${cat.name}`;
  form.elements.name.value = cat.name;
  form.querySelector(`input[name="color"][value="${cat.color}"]`).checked = true;
  form.elements.sentenceOn.checked = cat.sentence.on;
  form.elements.before.value = cat.sentence.before;
  form.elements.after.value = cat.sentence.after;
  form.elements.lower.checked = cat.sentence.lower;
  resetDelete();
  syncCategoryPreview();
  syncPosition();
  d.showModal();
  form.elements.name.focus();
}

function syncCategoryPreview() {
  if (!catDraft) return;
  const form = dlg.category.querySelector("form");
  const on = form.elements.sentenceOn.checked;
  dlg.category.querySelector('[data-role="phrase"]').hidden = !on;
  const color = PALETTE[form.elements.color.value] ?? PALETTE.stone;
  const newest = itemsByCategory(app.getDoc()).get(catDraft.id)?.[0];
  const fakeCat = { sentence: { lower: form.elements.lower.checked } };
  const title = newest ? sentenceForm(fakeCat, newest.title) : "something new";
  const before = cleanText(form.elements.before.value, LIMITS.phrase);
  const after = cleanText(form.elements.after.value, LIMITS.phrase);
  const preview = dlg.category.querySelector('[data-role="preview"]');
  preview.style.setProperty("--c", color);
  preview.innerHTML = `Lately I’ve been ${before ? `${esc(before)} ` : ""}<b>${esc(title)}</b>${after ? ` ${esc(after)}` : ""}.`;
}

function syncPosition() {
  const { index, total } = catDraft;
  dlg.category.querySelector('[data-role="position"]').textContent = `Position ${index + 1} of ${total}`;
  dlg.category.querySelector('[data-role="up"]').disabled = index === 0;
  dlg.category.querySelector('[data-role="down"]').disabled = index === total - 1;
}

function moveCategory(step) {
  catDraft.index = Math.min(catDraft.total - 1, Math.max(0, catDraft.index + step));
  syncPosition();
}

function resetDelete() {
  const button = dlg.category.querySelector('[data-role="delete"]');
  button.classList.remove("is-confirming");
  button.textContent = "Delete";
}

async function submitCategory(event) {
  event.preventDefault();
  const form = event.currentTarget;
  clearErrors(form);
  const name = cleanText(form.elements.name.value, LIMITS.categoryName);
  if (!name) {
    fieldError(form.elements.name, "Give the category a name.");
    form.elements.name.focus();
    return;
  }
  const { id, index } = catDraft;
  const doc = app.getDoc();
  if (doc.categories.some((c) => c.id !== id && c.name.toLowerCase() === name.toLowerCase())) {
    fieldError(form.elements.name, "You already have a category with that name.");
    form.elements.name.focus();
    return;
  }
  const next = {
    id,
    name,
    color: form.elements.color.value,
    sentence: {
      on: form.elements.sentenceOn.checked,
      before: cleanText(form.elements.before.value, LIMITS.phrase),
      after: cleanText(form.elements.after.value, LIMITS.phrase),
      lower: form.elements.lower.checked,
    },
  };
  busy(form, true, "Saving…");
  const result = await commit(
    (draft) => {
      const from = draft.categories.findIndex((c) => c.id === id);
      if (from < 0) return null;
      draft.categories.splice(from, 1);
      draft.categories.splice(Math.min(index, draft.categories.length), 0, next);
      return draft;
    },
    { message: `Saved ${name}.`, undo: true }
  );
  busy(form, false);
  if (result.ok) dlg.category.close();
  else formError(form, result.error);
}

async function deleteCategory() {
  const button = dlg.category.querySelector('[data-role="delete"]');
  const { id, count } = catDraft;
  const cat = app.getDoc().categories.find((c) => c.id === id);
  if (!cat) return;
  if (!button.classList.contains("is-confirming")) {
    button.classList.add("is-confirming");
    button.textContent = count ? `Delete ${cat.name} and its ${count} ${count === 1 ? "thing" : "things"}` : `Delete ${cat.name}`;
    return;
  }
  const form = dlg.category.querySelector("form");
  const result = await commit(
    (draft) => {
      draft.categories = draft.categories.filter((c) => c.id !== id);
      draft.items = draft.items.filter((i) => i.categoryId !== id);
      return draft;
    },
    { message: `Deleted ${cat.name}.`, undo: true }
  );
  if (result.ok) dlg.category.close();
  else {
    resetDelete();
    formError(form, result.error);
  }
}

// ---------------------------------------------------------------- profile

function openProfile() {
  const { profile } = app.getDoc();
  const d = dlg.profile;
  const form = d.querySelector("form");
  clearErrors(form);
  form.elements.name.value = profile.name;
  form.elements.nickname.value = profile.nickname;
  form.elements.intro.value = profile.intro;
  form.elements.status.value = profile.status;
  for (const { key } of LINKS) form.elements[key].value = profile.links[key] ?? "";
  syncProfilePreview();
  d.showModal();
  form.elements.name.focus();
}

function syncProfilePreview() {
  const form = dlg.profile.querySelector("form");
  const name = cleanText(form.elements.name.value, LIMITS.name) || "…";
  const nick = cleanText(form.elements.nickname.value, LIMITS.nickname);
  const intro = cleanText(form.elements.intro.value, LIMITS.intro).replace(/[.\s]+$/, "");
  dlg.profile.querySelector('[data-role="preview"]').innerHTML = `I’m <strong>${esc(name)}</strong>${nick ? ` (${esc(nick)})` : ""}${
    intro ? `, ${esc(intro)}` : ""
  }.`;
}

async function submitProfile(event) {
  event.preventDefault();
  const form = event.currentTarget;
  clearErrors(form);
  const name = cleanText(form.elements.name.value, LIMITS.name);
  if (!name) fieldError(form.elements.name, "Add your name.");
  const links = {};
  for (const { key, label } of LINKS) {
    const value = key === "email" ? cleanEmail(form.elements[key].value) : cleanUrl(form.elements[key].value);
    if (value === null) fieldError(form.elements[key], key === "email" ? "That email address doesn’t look right." : `Paste the full ${label} address.`);
    links[key] = value || "";
  }
  if (form.querySelector('[aria-invalid="true"]')) {
    focusFirstInvalid(form);
    return;
  }
  const profile = {
    name,
    nickname: cleanText(form.elements.nickname.value, LIMITS.nickname),
    intro: cleanText(form.elements.intro.value, LIMITS.intro),
    status: cleanText(form.elements.status.value, LIMITS.status),
    links,
  };
  busy(form, true, "Saving…");
  const result = await commit(
    (draft) => {
      draft.profile = profile;
      return draft;
    },
    { message: "Saved your intro.", undo: true }
  );
  busy(form, false);
  if (result.ok) dlg.profile.close();
  else formError(form, result.error);
}
