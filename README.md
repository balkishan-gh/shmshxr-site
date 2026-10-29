# shmshxr

Bal Kishan's personal site: an intro that writes itself from what he's into
lately, and a shelf of everything he likes that he can add to from his phone.

Live at **https://shmshxr.netlify.app**

## Adding things to the shelf

1. Open **https://shmshxr.netlify.app/edit** (or tap **Edit** at the bottom of
   the page).
2. Enter the edit key. It's the `SHELF_ADMIN_KEY` environment variable in
   Netlify.
3. Tap **Add**, pick a category, type the name and save.

Changes are live for everyone within seconds. No redeploy is needed.

While editing you can also:

- edit or remove anything (every change can be undone from the message that
  appears)
- create a category by choosing **New category…** when adding something
- choose which categories appear in the intro, and how they read. For example,
  "playing … on repeat" or "thinking about …". The intro always shows the newest
  thing in each of those categories, and visitors can tap it to flip through
  the rest.
- change your name, intro line, status badge and links under **Profile**

## How it's built

| Path | What it does |
| --- | --- |
| `public/` | The page itself: HTML, CSS and ES modules with no build step |
| `public/assets/js/schema.js` | The rules (limits, colours, validation), shared by the page and the functions |
| `netlify/functions/shelf.mts` | `GET /api/shelf`: the public shelf, cached on Netlify's CDN |
| `netlify/functions/admin.mts` | Unlocking, signing out and saving |
| `netlify/lib/` | Storage, CDN purging, auth and HTTP helpers |
| `tests/` | API and rendering tests. Netlify runs them before every deploy |

- The shelf is one JSON document in **Netlify Blobs** (store `shelf`). Deploy
  previews and local development use a separate store, so trying things out
  never touches the live page.
- Unlocking sets an **HttpOnly, SameSite=Strict cookie** that holds an expiry
  time signed with the edit key. The key itself never stays in the browser.
- Every save sends the revision it was based on. If the shelf changed on
  another device in the meantime, the save is refused and the latest copy is
  loaded instead of being overwritten.
- Each save clears the CDN cache for `/api/shelf`. Within a minute the cache
  also refreshes on its own.

## Changing the edit key

In Netlify, go to **Project configuration › Environment variables** and update
`SHELF_ADMIN_KEY`. Then trigger a new deploy under **Deploys**. Changing the
key signs out every device.

## Local development

```sh
npm install
npm run dev     # http://localhost:8888, in-memory shelf, edit key "local-edit-key"
npm test
```

Set `SHELF_ADMIN_KEY=…` before `npm run dev` to use a different local key.
Requires Node.js 22.6 or later.

## Credits

Type is [Inter](https://rsms.me/inter/) by Rasmus Andersson, used under the SIL
Open Font License (see `public/assets/fonts/OFL.txt`).
