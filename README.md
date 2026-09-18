# ICARUS Profile Editor

A lightweight, **100% client-side** web app for editing [ICARUS](https://www.icarusgame.com/) (by RocketWerkz) character save files. It lets you adjust the in-game **meta-resources** — Ren, Exotics, Respec Points, and more — right in your browser.

Built with plain HTML, CSS, and vanilla JavaScript. No build step, no framework, no backend.

> [!IMPORTANT]
> This is an **unofficial fan project**. It is **not** associated with, sponsored by, or endorsed by RocketWerkz. All game assets and trademarks belong to RocketWerkz.

---

## Features

- **Local-only / private.** Everything runs in your browser using the `FileReader` API. Your save file is **never uploaded** anywhere.
- **Drag & drop** or a traditional **file picker** to load a `Profile.json`.
- **Safe validation.** The file is checked to be valid JSON and to contain the required `MetaResources` array, with clear, friendly error messages otherwise.
- **Full state preservation.** The whole file is parsed into memory and only the `Count` values inside `MetaResources` are ever modified. Talents, `UnlockedFlags`, `UserID`, `NextChrSlot`, `DataVersion`, and everything else pass through **unmodified**.
- **Missing currencies are handled.** Any supported currency absent from your file is displayed as `0` and is injected (with the value you set) the moment you edit it.
- **Quick tools.** Each currency has `+10,000`, `Set 999,999`, and `Reset` helpers.
- **Exact export.** Downloads a `Profile.json` (case-sensitive) serialized with 2-space indentation.

### Supported currencies

| Internal `MetaRow`   | In-game display name  |
| -------------------- | --------------------- |
| `Credits`            | Ren                   |
| `Exotic1`            | Exotics               |
| `Refund`             | Respec Point          |
| `Exotic_Red`         | Red Exotics           |
| `Biomass`            | Legendary Biomass     |
| `Exotic_Uranium`     | Uranium Rod           |
| `Licence`            | Legendary Licence     |
| `Biomass_Converter`  | Flux                  |

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

> Replace `<YourSteamID>` with the numeric ID folder you see in that directory (e.g. `76561198027894420`).

---

## ⚠️ Safety warning

**Always back up your original `Profile.json` before you overwrite it.**

- Copy the file somewhere safe (or rename it to `Profile.json.bak`) **before** you replace it with the edited version.
- ICARUS does **not** lock `Profile.json`. Keep the game **running and on the title screen** when you overwrite the file — there's no need to close or restart it.
- While this editor only touches `MetaResources` and preserves everything else, a manual backup is still strongly recommended in case anything goes wrong.

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
├── index.html        # Semantic HTML5 layout (dropzone, currency cards, export)
├── style.css         # Icarus-themed, responsive styling
├── app.js            # File reading, parsing, validation, editing, export
├── README.md         # This file
├── assets/
│   └── icon.png      # (optional) square app icon / tab favicon
└── references/       # (dev reference only — not used by the app)
    ├── Profile.json                      # sample save
    ├── icarus_missions_list.csv
    ├── icarus_all_missions_complete.csv
    └── UnlockedFlags.csv
```

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

- **State preservation:** the file is loaded with `JSON.parse`, held as a single in-memory object, and only `MetaResources` entries are mutated. Export is `JSON.stringify(data, null, 2)`.
- **Injection:** a missing `MetaRow` is appended to `MetaResources` as `{ "MetaRow": "<key>", "Count": <value> }` on first edit.
- **Validation:** rejects non-JSON input, non-object roots, a missing `MetaResources` array, and malformed array entries — each with a specific message.
- **Privacy:** no network calls beyond the Google Fonts stylesheet; the save file is never transmitted.
