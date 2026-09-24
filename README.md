# Spafbi's ICARUS Profile Editor

A lightweight, **100% client-side** web app for editing [ICARUS](https://store.steampowered.com/app/1149460/ICARUS/) (by RocketWerkz) profile save files. It lets you adjust the in-game **meta-resources** — Ren, Exotics, Respec Points, and more — **toggle account unlock flags**, **mark missions as completed** to grant their talents, and **unlock workshop blueprints**, all right in your browser.

The editor is organised into **tabs** — *Meta-Resources*, *General Account Unlocks*, *Completed Missions* (sub-tabbed by map), and *Workshop Unlocks* (sub-tabbed by category) — so the long lists stay easy to navigate.

Built with plain HTML, CSS, and vanilla JavaScript. No build step, no framework, no backend.

# IMPORTANT 
> This is an **unofficial fan project**. It is **not** associated with, sponsored by, or endorsed by RocketWerkz. All game assets and trademarks belong to RocketWerkz.

## A quick word of caution
To preserve the intended experience, **consider saving this tool for bug recovery or post-game convenience**. If you've already conquered the content and just want to bypass tedious grinding, it’s a great time-saver—**otherwise, it can easily take the fun out of early progression**.

---

## Features

- **Local-only / private.** Everything runs in your browser using the `FileReader` API. Your save file is **never uploaded** anywhere.
- **Drag & drop** or a traditional **file picker** to load a `Profile.json`.
- **Tabbed editor.** The four sections — *Meta-Resources*, *General Account Unlocks*, *Completed Missions*, and *Workshop Unlocks* — live in tabs, so the UI stays short. *Completed Missions* is further split into **sub-tabs per map** and *Workshop Unlocks* into **sub-tabs per category**; each sub-tab shows an `N / total` count badge (completed missions / unlocked blueprints). Tabs support mouse, keyboard (Left/Right, Home/End), and ARIA screen-reader semantics. Tabs that hold a list of toggles (*General Account Unlocks*, and every map / category sub-tab) carry a **select-all** checkbox inside their expanded panel (below the section title, where the panel has one): it turns every toggle in that panel on, or all off if they are already on. Its tri-state (checked / mixed / unchecked) and the sub-tab's `N / total` badge track the rows as you toggle them individually.
- **Safe validation.** The file is checked to be valid JSON and to contain the required `MetaResources` array, with clear, friendly error messages otherwise.
- **Full state preservation.** The whole file is parsed into memory and only the values you edit are ever modified: `Count` values inside `MetaResources`, entries in the `UnlockedFlags` list, and `Talents` (via Completed Missions and Workshop Unlocks). `UserID`, `NextChrSlot`, `DataVersion`, stats, slots, and everything else pass through **unmodified**.
- **Missing currencies are handled.** Any supported currency absent from your file is displayed as `0` and is injected (with the value you set) the moment you edit it.
- **Quick tools.** Each currency has `+N`, `Set N`, and `Reset` helpers, where `N` is per-currency in the `MetaResources` key of `data.json` (defaults: +100 / Set 999,999).
- **Unlock flag toggles.** A list of general account unlock flags (from `data.json`'s `General_Account_Unlocked_Flags`), each labeled with a human-readable description (looked up from its `Unlocked_Flags` catalogue). Toggling a flag on adds its value to `UnlockedFlags` (inserted at its sorted position); toggling it off removes it. Flags present in your file but absent from the catalogue are preserved untouched.
- **Completed Missions.** Missions are grouped per map (shown as sub-tabs); marking one completed adds its talent RowName to `Talents` and any unlock flags it grants to `UnlockedFlags`, and unmarking removes both.
- **Workshop Unlocks.** Workshop blueprints are grouped by category (shown as sub-tabs); toggling one on adds its talent RowName to `Talents` at rank 1, exactly the way mission talents are recorded, and toggling it off removes it.
- **Data-driven catalogues.** Currency names, the unlock-flag list, its descriptions, the mission lists, and the workshop blueprint lists all live in the single `data.json` file in the project root, so entries can be added or removed per game update without touching the app code.
- **Exact export.** Downloads a `Profile.json` (case-sensitive) serialized with 2-space indentation.

### Supported currencies

| Internal `MetaRow`   | In-game display name  | Increment | Set value |
| -------------------- | --------------------- | --------- | --------- |
| `Credits`            | Ren                   | +100      | 999,999   |
| `Exotic1`            | Exotics               | +100      | 999,999   |
| `Exotic_Red`         | Stabilized Exotic     | +100      | 999,999   |
| `Biomass`            | Legendary Biomass     | +100      | 999,999   |
| `Licence`            | Legendary Licences    | +10       | 500       |
| `Exotic_Uranium`     | Uranium Rod           | +100      | 999,999   |
| `Refund`             | Respec Points         | +10       | 500       |

### Known unlock flags

The **list of flags** shown under *General Account Unlocks* comes from the `General_Account_Unlocked_Flags` key in `data.json` — a plain JSON array of flag values:

```json
"General_Account_Unlocked_Flags": [ 3, 4, 95 ]
```

Each flag's **description** is looked up from `data.json`'s `Unlocked_Flags` catalogue by matching the flag value to its `talent`; the matching `rewards` text is what the UI displays. Add or remove flag values in `General_Account_Unlocked_Flags` as the game evolves, and add or edit the matching `talent` / `rewards` entries in `Unlocked_Flags` to change what is shown.

| Flag value | Description (from `Unlocked_Flags`) |
| ---------- | ---------------------------------------- |
| `3`        | Level 10 Boost Consumed (Styx)           |
| `4`        | Level 20 Boost Consumed (Promethius)     |
| `95`       | Level 30 Boost Consumed (Elysium)        |

### Workshop unlocks

Workshop blueprints live in the `Workshop_Talents` key of `data.json`, grouped by category (currently **Envirosuits** and **Armor**). Each category maps a display name to a talent RowName, e.g.:

```json
"Workshop_Talents": {
    "Envirosuits": {
        "First Cohort": "Workshop_Deluxe_Envirosuit",
        "Xigo S5-II": "Workshop_Envirosuit"
    },
    "Armor": {
        "Naneo Head": "Workshop_Carbon_Head"
    }
}
```

Categories are ordered by `Workshop_Category_Weights` (ascending). Toggling a blueprint on adds its talent to the profile's `Talents` list at rank 1.

---

## Keeping the catalogues up to date

All user-facing value lists live in the single `data.json` file in the project root — **edit it, commit, and push; no code changes needed.**

- **`MetaResources`** — one entry per currency: `{ "name": <display name>, "addStep": <amount added by the "+N" button>, "setMax": <value written by the "Set N" button> }`. Remove an entry to hide a currency from the UI (it will still pass through the file untouched); add an entry to expose a new one. `addStep` / `setMax` are optional and fall back to `100` / `999999`. The manual count field is not limited by these — existing counts above `setMax` are preserved.
- **`General_Account_Unlocked_Flags`** — the list of toggleable general account flags shown under *General Account Unlocks*. It is a plain JSON array of integer flag values: `[ 3, 4, 95 ]`. Add a value as a new flag is identified; remove one for a flag the game has retired.
- **`Unlocked_Flags`** — the human-readable text behind unlock flags: an array of `{ "talent": <flag value>, "rewards": <display text> }`. The *General Account Unlocks* labels and mission reward chips are resolved by matching a flag value to `talent` and using its `rewards`; a flag with no matching entry falls back to `Flag <value>`.
- **`Mission_Talents`** — the *Completed Missions* list, keyed by map (each map becomes a sub-tab): `{ "<Map>": [ { "mission": <name>, "talent": <RowName>, "UnlockedFlags": [<flag values>] } ] }`. `UnlockedFlags` is optional — those flags are granted/revoked together with the mission's talent.
- **`Map_Display_Weights`** — maps a map name to its sort position (ascending) among the *Completed Missions* sub-tabs; maps without a weight sort last.
- **`Workshop_Talents`** — the *Workshop Unlocks* list, keyed by category (each category becomes a sub-tab): `{ "<Category>": { "<Display name>": "<RowName>" } }`.
- **`Workshop_Category_Weights`** — maps a category name to its sort position (ascending) among the *Workshop Unlocks* sub-tabs; categories without a weight sort last.

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
- While this editor only touches `MetaResources`, `UnlockedFlags`, and `Talents` and preserves everything else, a manual backup is still strongly recommended in case anything goes wrong.

### Workflow

1. **Back up** your original `Profile.json`.
2. Load it into the editor.
3. Use the tabs to adjust currency values, account unlock flags, completed missions, and workshop unlocks.
4. Click **Download Profile.json**.
5. Keep ICARUS **running and on the title screen** (the game doesn't lock the file — no need to close it).
6. Overwrite your original `Profile.json` with the downloaded one.

---

## Copyright

Copyright © 2026 Christopher Snow — aka Spafbi.
