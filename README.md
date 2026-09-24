# ICARUS Profile Editor

A lightweight, **100% client-side** web app for editing [ICARUS](https://store.steampowered.com/app/1149460/ICARUS/) (by RocketWerkz) character save files. It lets you adjust the in-game **meta-resources** — Ren, Exotics, Respec Points, and more — and **toggle account unlock flags** right in your browser. Mission and workshop unlock editing is on the roadmap.

Built with plain HTML, CSS, and vanilla JavaScript. No build step, no framework, no backend.

# IMPORTANT 
> This is an **unofficial fan project**. It is **not** associated with, sponsored by, or endorsed by RocketWerkz. All game assets and trademarks belong to RocketWerkz.

## A quick word of caution
To preserve the intended experience, **consider saving this tool for bug recovery or post-game convenience**. If you've already conquered the content and just want to bypass tedious grinding, it’s a great time-saver—**otherwise, it can easily take the fun out of early progression**.

---

## Features

- **Local-only / private.** Everything runs in your browser using the `FileReader` API. Your save file is **never uploaded** anywhere.
- **Drag & drop** or a traditional **file picker** to load a `Profile.json`.
- **Safe validation.** The file is checked to be valid JSON and to contain the required `MetaResources` array, with clear, friendly error messages otherwise.
- **Full state preservation.** The whole file is parsed into memory and only the values you edit are ever modified: `Count` values inside `MetaResources` and entries in the `UnlockedFlags` list. Talents, `UserID`, `NextChrSlot`, `DataVersion`, and everything else pass through **unmodified**.
- **Missing currencies are handled.** Any supported currency absent from your file is displayed as `0` and is injected (with the value you set) the moment you edit it.
- **Quick tools.** Each currency has `+N`, `Set N`, and `Reset` helpers, where `N` is per-currency in `data/currency_map.json` (defaults: +10,000 / Set 999,999).
- **Unlock flag toggles.** A list of general account unlock flags, each labeled with a human-readable description (looked up from `data/unlocked_flags.json`). Toggling a flag on adds its value to `UnlockedFlags` (inserted at its sorted position); toggling it off removes it. Flags present in your file but absent from the catalogue are preserved untouched.
- **Data-driven catalogues.** Currency names, the unlock-flag list, and their descriptions live in external JSON files under `data/`, so entries can be added or removed per game update without touching the app code.
- **Exact export.** Downloads a `Profile.json` (case-sensitive) serialized with 2-space indentation.

### Supported currencies

| Internal `MetaRow`   | In-game display name  | Increment | Set value |
| -------------------- | --------------------- | --------- | --------- |
| `Credits`            | Ren                   | +10,000   | 999,999   |
| `Exotic1`            | Exotics               | +10,000   | 999,999   |
| `Exotic_Red`         | Stabilized Exotic     | +10,000   | 999,999   |
| `Biomass`            | Legendary Biomass     | +10,000   | 999,999   |
| `Licence`            | Legendary Licence     | +10       | 500       |
| `Exotic_Uranium`     | Uranium Rod           | +10,000   | 999,999   |
| `Refund`             | Respec Points         | +10       | 500       |

### Known unlock flags

The **list of flags** shown under *Account Unlocks* comes from `data/general_account_unlocks.json` — a plain JSON array of flag values:

```json
{ "UnlockedFlags": [ 3, 4, 95 ] }
```

Each flag's **description** is looked up from `data/unlocked_flags.json` by matching the flag value to that file's `talent`; the matching `rewards` text is what the UI displays. Add or remove flag values in `general_account_unlocks.json` as the game evolves, and add or edit the matching `talent` / `rewards` entries in `unlocked_flags.json` to change what is shown.

| Flag value | Description (from `unlocked_flags.json`) |
| ---------- | ---------------------------------------- |
| `3`        | Level 10 Boost Consumed (Styx)           |
| `4`        | Level 20 Boost Consumed (Promethius)     |
| `95`       | Level 30 Boost Consumed (Elysium)        |

---

## Keeping the catalogues up to date

All user-facing value lists are external JSON files in `data/` — **edit them, commit, and push; no code changes needed.**

- **`data/currency_map.json`** — one entry per currency: `{ "name": <display name>, "addStep": <amount added by the "+N" button>, "setMax": <value written by the "Set N" button> }`. Remove an entry to hide a currency from the UI (it will still pass through the file untouched); add an entry to expose a new one. `addStep` / `setMax` are optional and fall back to `10000` / `999999`. The manual count field is not limited by these — existing counts above `setMax` are preserved.
- **`data/general_account_unlocks.json`** — the list of toggleable general account flags shown under *Account Unlocks*. It is a plain JSON array of integer flag values: `{ "UnlockedFlags": [ 3, 4, 95 ] }`. Add a value as a new flag is identified; remove one for a flag the game has retired.
- **`data/unlocked_flags.json`** — the human-readable text behind unlock flags: an array of `{ "talent": <flag value>, "mission": <mission name>, "rewards": <display text> }`. The *Account Unlocks* labels are resolved by matching a flag value to `talent` and using its `rewards`; a flag with no matching entry falls back to `Flag <value>`.
- **Future catalogues** (missions, workshop unlocks, talents) will follow the same pattern: a JSON file under `data/` plus a small registration entry in `app.js`.

---

## How to find your save file

### Windows

Your profile is typically located at:

```
%LocalAppData%\Icarus\Saved\PlayerData\<YourSteamID>\Profile.json
```

You can jump straight to the folder:

1. Press <kbd>Win</kbd> + <kbd>R</kbd> to open **Run**.
2. Paste the path below and press **Enter**:
   ```
   %LocalAppData%\Icarus\Saved\PlayerData
   ```
3. Open the folder named with your **Steam ID 64**, then find `Profile.json`.

> Replace `<YourSteamID>` with the numeric ID folder you see in that directory (e.g. `76561234567890123`).

---

## ⚠️ Safety warning

**Always back up your original `Profile.json` before you overwrite it.**

- Copy the file somewhere safe (or rename it to `Profile.json.bak`) **before** you replace it with the edited version.
- ICARUS does **not** lock `Profile.json`. Keep the game **running and on the title screen** when you overwrite the file — there's no need to close or restart it.
- While this editor only touches `MetaResources` and `UnlockedFlags` and preserves everything else, a manual backup is still strongly recommended in case anything goes wrong.

### Workflow

1. **Back up** your original `Profile.json`.
2. Load it into the editor.
3. Adjust the currency values you want.
4. Click **Download Profile.json**.
5. Keep ICARUS **running and on the title screen** (the game doesn't lock the file — no need to close it).
6. Overwrite your original `Profile.json` with the downloaded one.

---

## Project layout

```
icarus-profile-web-editor/
├── index.html        # Semantic HTML5 layout (dropzone, editor sections, export)
├── style.css         # Icarus-themed, responsive styling
├── app.js            # File reading, parsing, validation, editing, export
├── README.md         # This file
├── assets/
│   └── icon.png      # (optional) square app icon / tab favicon
└── data/
    ├── currency_map.json           # name / addStep / setMax per currency
    ├── general_account_unlocks.json # list of general account flag values (Account Unlocks)
    └── unlocked_flags.json          # unlock-flag catalogue: talent/mission/rewards (descriptions)
```

> `data/` holds only **catalogue metadata** — the player's `Profile.json` is always uploaded at runtime and never stored in the repository.

### Adding the app icon

Create an `assets/` folder in the project root and drop in:

- `assets/icon.png` — a **square** icon used as the tab favicon and the header mark.

If this file is missing, the app automatically falls back to a clean text monogram, so the site still looks correct with **no** images present.

---

## Deploying to GitHub Pages

This app is fully static, so GitHub Pages is all you need.

### 1. Create a repository and push your code

```bash
git init
git add .
git commit -m "Add ICARUS Profile Editor"
git branch -M main
git remote add origin https://github.com/<your-username>/<your-repo>.git
git push -u origin main
```

### 2. Enable GitHub Pages

1. Go to your repository on GitHub.
2. Open **Settings** → **Pages**.
3. Under **Build and deployment** → **Source**, select **Deploy from a branch**.
4. For **Branch**, choose **`main`** and for **Folder** choose **`/ (root)`**.
5. Click **Save**.

### 3. Open your live site

Wait a minute or two for the build to finish, then visit:

```
https://<your-username>.github.io/<your-repo>/
```

That's it — no build tools, no CI, no server required.

---

## Technical notes

- **State preservation:** the file is loaded with `JSON.parse`, held as a single in-memory object, and only `MetaResources` counts and `UnlockedFlags` entries are mutated. Export is `JSON.stringify(data, null, 2)`.
- **Injection:** a missing `MetaRow` is appended to `MetaResources` as `{ "MetaRow": "<key>", "Count": <value> }` on first edit. A flag toggled on is inserted into `UnlockedFlags` at its sorted (ascending) position.
- **Validation:** rejects non-JSON input, non-object roots, a missing `MetaResources` array, and malformed array entries — each with a specific message. A missing `UnlockedFlags` array is normalized to `[]` so toggles still work.
- **Catalogues:** `data/currency_map.json`, `data/general_account_unlocks.json`, and `data/unlocked_flags.json` are fetched at startup (relative URLs, no CORS issues on GitHub Pages). If a catalogue is missing, the app shows a specific error instead of rendering an empty editor.
- **Serving:** because the catalogues are fetched at runtime, the app must be served over HTTP(S) (GitHub Pages works out of the box). Opening `index.html` via `file://` will fail the catalogue fetch — the status line explains why.
- **Privacy:** no network calls beyond the Google Fonts stylesheet and the same-origin `data/` fetches; the save file is never transmitted.
