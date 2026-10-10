# Sonder

A private, local-first journal and timeline. Installable on Android, works offline, no accounts, no servers.
Everything you write is stored on your phone (IndexedDB). Nothing is sent anywhere.

## Files

| File | What it does |
|---|---|
| `index.html` | Page shell |
| `styles.css` | All styling (dark and light themes via CSS variables at the top) |
| `app.js` | All screens and behaviour: Home, Timeline, Editor, Quick Log, Insights, Budget, Plan a purchase, Account |
| `db.js` | Storage layer, moods and tags, default settings and default budget goals. Has a versioned schema |
| `icons.js` | Inline SVG icons |
| `sw.js` | Service worker (offline + updates) |
| `manifest.webmanifest`, `icons/` | What makes it installable |

## Try it on your computer

```
cd C:\Users\Student\Desktop\Sonder
python3 -m http.server 8000
```
Open http://localhost:8000. The service worker works on `localhost` too.

## Put it on your phone (free)

1. Create a GitHub account and a new **public** repository (e.g. `sonder`). Your journal entries are *not* in the repo, only the app code.
2. Upload all the files in this folder (keep the `icons/` folder).
3. Repo **Settings → Pages**, source: *Deploy from a branch*, branch `main`, folder `/ (root)`.
4. After a minute your app is at `https://<your-username>.github.io/sonder/`.
5. Open that address in Chrome on your Moto, tap **⋮ → Install app** (or *Add to Home screen*).

## Updating the app

1. Change the files (or have Claude change them).
2. In `sw.js`, bump `VERSION` (e.g. `'1.0.1'`). Optionally bump `VERSION` in `app.js` too, so About shows it.
3. Commit/upload to GitHub. Pages republishes in about a minute.
4. Next time you open Sonder online, it fetches the new files and shows a **Reload** banner.

Your entries live in the browser database, separate from the code, so updates never touch them.
If a future change needs a different data shape, bump `DB_VERSION` in `db.js` and add a migration step in `upgrade()`.

## Keeping your data safe

- Browsers can delete site data if you clear it manually or your phone is very low on storage. Sonder asks Chrome to protect its storage, but **no browser guarantees it**.
- Use **Account → Backup & restore → Back up now** now and then and keep the `.json` file somewhere safe (Drive, email to yourself).
- **App lock** is a screen lock (PIN). It keeps people out of the app but does not encrypt the stored data.
- **Daily reminder** is an in-app nudge shown when you open Sonder after your chosen time. Real background notifications need a push server, which would defeat the "free and private" goal.

## Budget

- Money is stored as whole cents, so nothing drifts by a fraction of a cent. Data lives in the `meta` store under the key `budget` (no `DB_VERSION` bump needed) and is included in backups.
- Change the default goals (names, shares, the Lenovo link) in `DEFAULT_BUDGET` in `db.js`, or in the app under Budget > Goals > Edit.
- Share percentages only affect money added from then on. Old balances never change.
- "History only" records (old purchases, income already spent) are kept for reference but ignored in balances.

## Next up

The AI side (reflect on an entry, ask about patterns) can plug into the Editor and Insights screens, calling Ollama over Tailscale as planned.
