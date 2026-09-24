/* =========================================================
   ICARUS Profile Editor — app.js
   Reads, validates, and edits Profile.json entirely in-browser.
   Only the values the user edits (`MetaResources` counts and
   `UnlockedFlags` entries) are ever mutated; every other key
   in the save file is preserved exactly as loaded.

   Currency names, unlock flags, and missions live in the single
   data.json file in the project root so they can be updated per
   game patch without touching this script.
   ========================================================= */
(function () {
  "use strict";

  // ---- External data (fetched at startup) ----
  // A single data.json file in the project root holds every catalogue:
  //   MetaResources                 currency name / addStep / setMax
  //   General_Account_Unlocked_Flags  toggleable account-wide flag values
  //   Mission_Talents                per-map list of { mission, talent, UnlockedFlags? }
  //   Map_Display_Weights            map-name -> sort order for mission groups
  //   Unlocked_Flags                 flag value -> rewards text (descriptions)
  var DATA_FILE = "data.json";

  var EXPORT_FILENAME = "Profile.json";
  // Defaults applied when a MetaResources entry in data.json
  // omits the per-currency fields.
  var DEFAULT_ADD_STEP = 100;
  var DEFAULT_SET_MAX = 999999;

  // ---- State ----
  var profileData = null;
  var fileName = "";
  var originalCounts = {};
  var originalUnlockedFlags = [];
  // Sorted signature of the talent RowNames present at load, used to detect
  // "unsaved changes" made by the Completed Missions toggles (which may alter
  // Talents without touching any other list).
  var originalTalentSignature = "";
  var loaded = false;
  var toastTimer = null;

  // Catalogues from data.json, fetched before a profile is loaded.
  var currencyMap = null;
  var catalog = null;
  var appReady = false;
  // Map of unlock-flag value -> human-readable description, built from
  // data.json's Unlocked_Flags list (talent -> rewards) at startup.
  var flagDescriptions = {};

  // ---- DOM refs ----
  var dropzone = document.getElementById("dropzone");
  var fileInput = document.getElementById("file-input");
  var browseBtn = document.getElementById("browse-btn");
  var statusEl = document.getElementById("status");
  var editorPanel = document.querySelector(".editor-panel");
  var fileChip = document.getElementById("file-chip");
  var currencyGrid = document.getElementById("currency-grid");
  var toggleSectionsEl = document.getElementById("toggle-sections");
  var missionsEl = document.getElementById("missions-section");
  var workshopEl = document.getElementById("workshop-section");
  var downloadBtn = document.getElementById("download-btn");
  var toastEl = document.getElementById("toast");
  var mainTabBar = document.getElementById("main-tab-bar");
  var mainTabPanels = document.getElementById("main-tab-panels");

  /* ---------- Helpers ---------- */
  function clampCount(value) {
    var n = Math.floor(Number(value));
    if (!isFinite(n) || n < 0) return 0;
    return n;
  }

  function formatNumber(n) {
    return Number(n).toLocaleString("en-US");
  }

  function getMetaEntry(metaRow) {
    if (!profileData || !Array.isArray(profileData.MetaResources)) return null;
    for (var i = 0; i < profileData.MetaResources.length; i++) {
      var entry = profileData.MetaResources[i];
      if (entry && entry.MetaRow === metaRow) return entry;
    }
    return null;
  }

  function setStatus(message, type) {
    statusEl.textContent = message || "";
    statusEl.className = "status" + (type ? " status-" + type : "");
  }

  function showToast(message, type) {
    toastEl.textContent = message;
    toastEl.className = "toast toast-show" + (type ? " toast-" + type : "");
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      toastEl.className = "toast";
      toastEl.textContent = "";
    }, 2600);
  }

  function isDirty() {
    if (!profileData) return false;

    if (Array.isArray(profileData.MetaResources)) {
      for (var i = 0; i < profileData.MetaResources.length; i++) {
        var entry = profileData.MetaResources[i];
        var row = entry && entry.MetaRow;
        if (row in originalCounts) {
          if (originalCounts[row] !== entry.Count) return true;
        } else {
          return true; // a row was injected that wasn't present originally
        }
      }
    }

    var flags = Array.isArray(profileData.UnlockedFlags)
      ? profileData.UnlockedFlags
      : [];
    if (flags.length !== originalUnlockedFlags.length) return true;
    for (var f = 0; f < flags.length; f++) {
      if (flags[f] !== originalUnlockedFlags[f]) return true;
    }

    // Talents: a mission toggle may add/remove RowName entries without
    // touching any other list, so compare the set of RowNames too.
    if (talentRowNames().slice().sort().join("\u0000") !== originalTalentSignature) {
      return true;
    }
    return false;
  }

  /* ---------- Rendering ---------- */
  function makeElement(tag, props) {
    var el = document.createElement(tag);
    if (props) {
      for (var key in props) {
        if (Object.prototype.hasOwnProperty.call(props, key)) {
          if (key === "text") el.textContent = props[key];
          else el.setAttribute(key, props[key]);
        }
      }
    }
    return el;
  }

  function makeQuickButton(action, label) {
    return makeElement("button", {
      type: "button",
      "class": "btn-quick",
      "data-action": action,
      text: label
    });
  }

  /* ---------- Currency configuration ---------- */
  // Each MetaResources entry in data.json is:
  //   "MetaRow": { "name": ..., "addStep": ..., "setMax": ... }
  // Missing addStep / setMax fall back to the defaults below.
  function getCurrencyConfig(metaRow) {
    var name = metaRow;
    var addStep = DEFAULT_ADD_STEP;
    var setMax = DEFAULT_SET_MAX;

    var entry = currencyMap && currencyMap[metaRow];
    if (entry && typeof entry === "object") {
      if (typeof entry.name === "string" && entry.name) name = entry.name;
      if (isFinite(Number(entry.addStep)) && Number(entry.addStep) > 0) {
        addStep = Math.round(Number(entry.addStep));
      }
      if (isFinite(Number(entry.setMax)) && Number(entry.setMax) > 0) {
        setMax = Math.round(Number(entry.setMax));
      }
    }
    return { name: name, addStep: addStep, setMax: setMax };
  }

  function renderCurrencyCards() {
    currencyGrid.textContent = "";

    for (var metaRow in currencyMap) {
      if (!Object.prototype.hasOwnProperty.call(currencyMap, metaRow)) continue;

      var config = getCurrencyConfig(metaRow);
      var name = config.name;
      var entry = getMetaEntry(metaRow);
      var value = entry && isFinite(Number(entry.Count)) ? Number(entry.Count) : 0;
      var present = !!entry;

      var card = makeElement(
        "article",
        { "class": "currency-card" + (present ? "" : " currency-card-missing") }
      );
      card.setAttribute("data-meta-row", metaRow);

      var head = makeElement("div", { "class": "currency-head" });
      head.appendChild(makeElement("span", { "class": "currency-name", text: name }));
      head.appendChild(makeElement("code", { "class": "currency-key", text: metaRow }));
      card.appendChild(head);

      var inputId = "count-" + metaRow;
      var label = makeElement("label", { "class": "visually-hidden", text: name + " count" });
      label.setAttribute("for", inputId);
      card.appendChild(label);

      var input = makeElement("input", {
        id: inputId,
        "class": "currency-count",
        type: "number",
        min: "0",
        step: "1",
        inputmode: "numeric"
      });
      input.value = String(value);
      card.appendChild(input);

      var hint = makeElement("span", {
        "class": "currency-hint" + (present ? "" : " currency-hint-missing"),
        text: present ? "\u00a0" : "Not in file \u2014 added on edit"
      });
      card.appendChild(hint);

      var actions = makeElement("div", { "class": "currency-actions" });
      actions.appendChild(makeQuickButton("add", "+" + formatNumber(config.addStep)));
      actions.appendChild(makeQuickButton("set", "Set " + formatNumber(config.setMax)));
      actions.appendChild(makeQuickButton("reset", "Reset"));
      card.appendChild(actions);

      input.addEventListener("input", onCountInput);
      input.addEventListener("change", onCountChange);
      input.addEventListener("blur", onCountChange);
      var buttons = actions.querySelectorAll(".btn-quick");
      for (var b = 0; b < buttons.length; b++) {
        buttons[b].addEventListener("click", onQuickClick);
      }

      currencyGrid.appendChild(card);
    }
  }

  /* ---------- Unlock flags ---------- */
  // Build a map of unlock-flag value -> human-readable description from the
  // unlocked-flags catalogue (data.json Unlocked_Flags: talent -> rewards).
  function buildFlagDescriptions() {
    var map = {};
    var arr = (catalog && Array.isArray(catalog.Unlocked_Flags))
      ? catalog.Unlocked_Flags
      : [];
    for (var i = 0; i < arr.length; i++) {
      var e = arr[i];
      if (!e) continue;
      var key = Number(e.talent);
      if (isFinite(key) && typeof e.rewards === "string" && e.rewards) {
        map[key] = e.rewards;
      }
    }
    return map;
  }

  function isFlagUnlocked(value) {
    if (!profileData || !Array.isArray(profileData.UnlockedFlags)) return false;
    for (var i = 0; i < profileData.UnlockedFlags.length; i++) {
      if (profileData.UnlockedFlags[i] === value) return true;
    }
    return false;
  }

  /* ---------- Talents (Completed Missions) ---------- */
  // The set of talent RowNames currently present in the profile.
  function talentRowNames() {
    if (!profileData || !Array.isArray(profileData.Talents)) return [];
    var names = [];
    for (var i = 0; i < profileData.Talents.length; i++) {
      var t = profileData.Talents[i];
      if (t && typeof t.RowName === "string" && t.RowName) names.push(t.RowName);
    }
    return names;
  }

  function isTalentPresent(rowName) {
    if (!profileData || !Array.isArray(profileData.Talents)) return false;
    for (var i = 0; i < profileData.Talents.length; i++) {
      if (profileData.Talents[i] && profileData.Talents[i].RowName === rowName) {
        return true;
      }
    }
    return false;
  }

  // Add or remove a talent ({ Rank: 1, RowName }) in the profile's Talents
  // list. Rank is always 1 for these RowNames, matching an unmodified save.
  function setTalent(rowName, enabled) {
    if (!profileData) return;
    if (!Array.isArray(profileData.Talents)) profileData.Talents = [];
    var talents = profileData.Talents;
    if (enabled) {
      if (isTalentPresent(rowName)) return;
      talents.push({ RowName: rowName, Rank: 1 });
    } else {
      for (var i = talents.length - 1; i >= 0; i--) {
        if (talents[i] && talents[i].RowName === rowName) talents.splice(i, 1);
      }
    }
  }

  function setFlagUnlocked(value, enabled) {
    if (!profileData) return;
    if (!Array.isArray(profileData.UnlockedFlags)) {
      profileData.UnlockedFlags = [];
    }
    var flags = profileData.UnlockedFlags;

    if (enabled) {
      if (isFlagUnlocked(value)) return;
      // Insert at its sorted (ascending) position to keep the list tidy,
      // matching the convention of an unmodified save file.
      var idx = flags.length;
      for (var i = 0; i < flags.length; i++) {
        if (typeof flags[i] === "number" && flags[i] > value) {
          idx = i;
          break;
        }
      }
      flags.splice(idx, 0, value);
    } else {
      for (var j = 0; j < flags.length; j++) {
        if (flags[j] === value) {
          flags.splice(j, 1);
          break;
        }
      }
    }
  }

  /* ---------- Completed Missions catalogue ---------- */
  // Build the mission list grouped by map, sorted by Map_Display_Weights
  // (ascending). data.json's Mission_Talents is an object keyed by map,
  // each value a list of { mission, talent, UnlockedFlags? } entries.
  // Entries within a map sharing the same talent RowName are collapsed
  // into one toggle: the first-seen mission name is kept and their
  // UnlockedFlags are unioned, since the toggle state is driven by the
  // RowName.
  function buildMissionGroups() {
    var weights = (catalog && catalog.Map_Display_Weights) || {};
    var byMap = (catalog && catalog.Mission_Talents) || {};

    var mapToTalents = {};
    var mapFirstSeen = {};
    var mapSeq = 0;

    for (var map in byMap) {
      if (!Object.prototype.hasOwnProperty.call(byMap, map)) continue;
      var items = Array.isArray(byMap[map]) ? byMap[map] : [];
      if (!mapToTalents[map]) {
        mapToTalents[map] = {};
        mapFirstSeen[map] = ++mapSeq;
      }
      var bucket = mapToTalents[map];
      for (var i = 0; i < items.length; i++) {
        var it = items[i];
        if (!it || typeof it !== "object") continue;
        var talent = it.talent;
        if (typeof talent !== "string" || !talent) continue;
        if (!bucket[talent]) bucket[talent] = { name: "", flags: {} };
        var entry = bucket[talent];
        if (!entry.name && typeof it.mission === "string" && it.mission) {
          entry.name = it.mission;
        }
        if (Array.isArray(it.UnlockedFlags)) {
          for (var f = 0; f < it.UnlockedFlags.length; f++) {
            var n = Number(it.UnlockedFlags[f]);
            if (isFinite(n)) entry.flags[n] = true;
          }
        }
      }
    }

    var mapNames = Object.keys(mapToTalents);
    mapNames.sort(function (a, b) {
      var wa = isFinite(Number(weights[a])) ? Number(weights[a]) : Infinity;
      var wb = isFinite(Number(weights[b])) ? Number(weights[b]) : Infinity;
      if (wa !== wb) return wa - wb;
      return mapFirstSeen[a] - mapFirstSeen[b];
    });

    var groups = [];
    for (var g = 0; g < mapNames.length; g++) {
      var mapName = mapNames[g];
      var bucket2 = mapToTalents[mapName];
      var missions = [];
      var talents = Object.keys(bucket2);
      for (var t = 0; t < talents.length; t++) {
        var talentName = talents[t];
        var e = bucket2[talentName];
        var flags = Object.keys(e.flags)
          .map(Number)
          .sort(function (a, b) { return a - b; });
        missions.push({ name: e.name || talentName, talent: talentName, flags: flags });
      }
      groups.push({ map: mapName, missions: missions });
    }
    return groups;
  }

  // Resolve a mission's numeric unlock flags to a flat list of reward
  // descriptions. Each flag's `rewards` text is split on commas so multi-item
  // rewards (e.g. "Caveworm Knife, Caveworm Spear") read as separate chips.
  function missionRewardList(flags) {
    var out = [];
    for (var i = 0; i < flags.length; i++) {
      var text = flagDescriptions[flags[i]];
      if (typeof text !== "string" || !text) continue;
      var parts = text.split(",");
      for (var p = 0; p < parts.length; p++) {
        var part = parts[p].replace(/^\s+|\s+$/g, "");
        if (part) out.push(part);
      }
    }
    return out;
  }

  // Escape an arbitrary string (map name / RowName) for use inside a DOM id.
  function escapeId(s) {
    return String(s).replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  }

  // Apply one toggle row's on/off state to the row itself (checkbox +
  // .is-on class) and to the underlying profile state. The row's data-*
  // attributes decide which setters run; both setters are idempotent, so it
  // is safe to call this for rows already in the target state. Shared by the
  // delegated change handlers and the per-tab "toggle all" checkboxes.
  function setRowToggled(input, enabled) {
    input.checked = enabled;
    var row = input.closest(".toggle-row");
    if (row) row.classList.toggle("is-on", enabled);

    if (input.hasAttribute("data-mission-talent")) {
      setTalent(input.getAttribute("data-mission-talent"), enabled);
      var flagParts = (input.getAttribute("data-mission-flags") || "").split(",").filter(Boolean);
      for (var i = 0; i < flagParts.length; i++) {
        var n = Number(flagParts[i]);
        if (isFinite(n)) setFlagUnlocked(n, enabled);
      }
    } else if (input.hasAttribute("data-workshop-talent")) {
      setTalent(input.getAttribute("data-workshop-talent"), enabled);
    } else {
      var value = Number(input.getAttribute("data-flag-value"));
      if (isFinite(value)) setFlagUnlocked(value, enabled);
    }
  }

  function onToggleChange(e) {
    var input = e.target;
    if (!input || input.type !== "checkbox") return;
    if (!input.hasAttribute("data-flag-value")) return;
    setRowToggled(input, input.checked);
    refreshTabStates(input);
  }

  /* ---------- Editor tabs ---------- */
  // A tab bar (role=tablist) is paired with a container of tab panels
  // (role=tabpanel). The top-level editor sections and the per-map /
  // per-category sub-tabs both reuse these two helpers; each bar is wired
  // to its own panels container so the levels never interfere.
  function activateTab(bar, panelsEl, tabId, focusTab) {
    var btns = Array.prototype.slice.call(bar.querySelectorAll(".tab-btn"));
    for (var i = 0; i < btns.length; i++) {
      var selected = btns[i].getAttribute("data-tab-id") === tabId;
      btns[i].classList.toggle("is-active", selected);
      btns[i].setAttribute("aria-selected", selected ? "true" : "false");
      btns[i].tabIndex = selected ? 0 : -1;
    }
    if (panelsEl) {
      // Only the bar's own (direct child) panels: the sub-tab panels nested
      // inside a top-level panel must not be toggled by the outer bar.
      var panels = Array.prototype.slice.call(panelsEl.querySelectorAll("[role='tabpanel']"))
        .filter(function (p) { return p.parentElement === panelsEl; });
      for (var p = 0; p < panels.length; p++) {
        var active = panels[p].getAttribute("data-tab-id") === tabId;
        panels[p].classList.toggle("is-active", active);
        if (active) panels[p].removeAttribute("hidden");
        else panels[p].setAttribute("hidden", "");
      }
    }
    if (focusTab) {
      for (var f = 0; f < btns.length; f++) {
        if (btns[f].getAttribute("data-tab-id") === tabId) {
          btns[f].focus();
          break;
        }
      }
    }
  }

  // Attach click + arrow-key (Left/Right, Home/End) navigation to every tab
  // button in a bar. The newly selected tab receives focus, following the
  // WAI-ARIA tabs pattern.
  function wireTabBar(bar, panelsEl) {
    var btns = Array.prototype.slice.call(bar.querySelectorAll(".tab-btn"));
    for (var i = 0; i < btns.length; i++) {
      (function (btn) {
        btn.addEventListener("click", function () {
          activateTab(bar, panelsEl, btn.getAttribute("data-tab-id"));
        });
        btn.addEventListener("keydown", function (e) {
          var cur = btns.indexOf(btn);
          var idx = -1;
          if (e.key === "ArrowRight" || e.key === "ArrowDown") idx = (cur + 1) % btns.length;
          else if (e.key === "ArrowLeft" || e.key === "ArrowUp") idx = (cur - 1 + btns.length) % btns.length;
          else if (e.key === "Home") idx = 0;
          else if (e.key === "End") idx = btns.length - 1;
          else return;
          e.preventDefault();
          activateTab(bar, panelsEl, btns[idx].getAttribute("data-tab-id"), true);
        });
      })(btns[i]);
    }
  }

  // Build the "toggle all" row that lives inside a tab group's panel —
  // below its section title (where the panel has one) and above its toggle
  // rows. `scopeLabel` names the scope (map / category / account unlocks)
  // for the visible label; `panelId` identifies the panel. The wrapping
  // <label> also lets the text itself activate the checkbox.
  function buildSelectAllRow(scopeLabel, panelId) {
    var row = makeElement("label", {
      "class": "selectall-row",
      "data-panel-id": panelId
    });
    row.appendChild(
      makeElement("input", { type: "checkbox", "class": "tab-selectall" })
    );
    row.appendChild(makeElement("span", { text: "Toggle all " + scopeLabel }));
    return row;
  }

  // The toggle rows belonging to one panel (the select-all checkbox is
  // excluded: it carries its own class, not .toggle-input).
  function panelToggleInputs(panel) {
    return Array.prototype.slice.call(
      panel.querySelectorAll('input.toggle-input[type="checkbox"]')
    );
  }

  // Wire one panel's "toggle all" row to that panel's toggle rows. A click
  // turns every row on — or all off, if they are already all on. The
  // checkbox's own tri-state and the tab's count badge are recomputed from
  // the rows afterwards, which is order-independent with respect to the
  // engine's native checkbox toggle / change event sequencing.
  function wireSelectAllRow(row, panel) {
    var cb = row.querySelector("input.tab-selectall");
    cb.addEventListener("click", function () {
      var inputs = panelToggleInputs(panel);
      if (!inputs.length) return;
      var anyOff = false;
      for (var k = 0; k < inputs.length; k++) {
        if (!inputs[k].checked) { anyOff = true; break; }
      }
      var target = anyOff; // any off -> turn all on; else turn all off
      for (var j = 0; j < inputs.length; j++) setRowToggled(inputs[j], target);
      refreshSelectAllRow(cb, panel);
    });
    cb.addEventListener("change", function () {
      refreshSelectAllRow(cb, panel);
    });
  }

  // Recompute a panel's "toggle all" checkbox tri-state and — where its tab
  // carries one — the "n / total" count badge, from the current row states.
  function refreshSelectAllRow(cb, panel) {
    var inputs = panelToggleInputs(panel);
    var on = 0;
    for (var k = 0; k < inputs.length; k++) if (inputs[k].checked) on++;
    cb.checked = inputs.length > 0 && on === inputs.length;
    cb.indeterminate = on > 0 && on < inputs.length;
    if (panel.id) {
      var btn = document.querySelector(
        '[role="tab"][aria-controls="' + panel.id + '"]'
      );
      var badge = btn && btn.querySelector(".tab-count");
      if (badge) badge.textContent = on + " / " + inputs.length;
    }
  }

  // Entry point used by the delegated change handlers: update the
  // "toggle all" row (and the tab badge) of the panel holding the row.
  function refreshTabStates(input) {
    var panel = input.closest('[role="tabpanel"]');
    if (!panel) return;
    var cb = panel.querySelector("input.tab-selectall");
    if (cb) refreshSelectAllRow(cb, panel);
  }

  // Build one Completed Missions toggle row (switch + name + reward chips).
  function buildMissionRow(mapName, mission) {
    var checked = isTalentPresent(mission.talent);
    var rowId = "mission-" + escapeId(mapName) + "-" + escapeId(mission.talent);
    var row = makeElement("label", {
      "class": "toggle-row" + (checked ? " is-on" : ""),
      "for": rowId
    });

    var input = makeElement("input", {
      id: rowId,
      "class": "toggle-input",
      type: "checkbox"
    });
    input.checked = checked;
    input.setAttribute("data-mission-talent", mission.talent);
    input.setAttribute("data-mission-flags", mission.flags.join(","));
    row.appendChild(input);
    row.appendChild(
      makeElement("span", { "class": "toggle-switch", "aria-hidden": "true" })
    );

    var text = makeElement("span", { "class": "toggle-text" });
    text.appendChild(
      makeElement("span", { "class": "toggle-desc", text: mission.name })
    );

    var rewards = missionRewardList(mission.flags);
    if (rewards.length) {
      var rewardsEl = makeElement("span", { "class": "mission-rewards" });
      for (var r = 0; r < rewards.length; r++) {
        rewardsEl.appendChild(
          makeElement("span", { "class": "mission-reward", text: rewards[r] })
        );
      }
      text.appendChild(rewardsEl);
    }
    row.appendChild(text);
    return row;
  }

  // Render the Completed Missions section as a sub-tab bar: one tab per map
  // (labelled with a "completed / total" count badge) and one panel per map
  // holding that map's mission toggles. The first map is active on load.
  function renderCompletedMissions() {
    if (!missionsEl) return;
    missionsEl.textContent = "";

    var groups = buildMissionGroups();
    if (!groups.length) {
      missionsEl.appendChild(
        makeElement("div", {
          "class": "missions-empty",
          text: "No missions catalogued yet (data.json has no Mission_Talents entries)."
        })
      );
      return;
    }

    var bar = makeElement("div", {
      "class": "tab-bar tab-bar-sub",
      role: "tablist",
      "aria-label": "Completed missions by map"
    });
    var panelsEl = makeElement("div", { "class": "subtab-panels" });
    var firstTabId = "";

    for (var g = 0; g < groups.length; g++) {
      var group = groups[g];
      var key = escapeId(group.map) || ("map-" + g);
      var tabId = "missions-tab-" + key;
      var panelId = "missions-panel-" + key;

      var completed = 0;
      for (var m = 0; m < group.missions.length; m++) {
        if (isTalentPresent(group.missions[m].talent)) completed++;
      }

      var btn = makeElement("button", {
        type: "button",
        role: "tab",
        id: tabId,
        "aria-controls": panelId,
        "class": "tab-btn",
        "data-tab-id": panelId
      });
      btn.appendChild(makeElement("span", { "class": "tab-label", text: group.map }));
      btn.appendChild(
        makeElement("span", {
          "class": "tab-count",
          text: completed + " / " + group.missions.length
        })
      );

      bar.appendChild(btn);

      var panel = makeElement("section", {
        role: "tabpanel",
        id: panelId,
        "aria-labelledby": tabId,
        "class": "tab-panel subtab-panel"
      });
      panel.setAttribute("data-tab-id", panelId);
      if (!firstTabId) firstTabId = panelId;

      // The "toggle all" row lives inside the panel (which has no section
      // title), above the toggle rows.
      var selectAllRow = buildSelectAllRow(group.map + " missions", panelId);
      panel.appendChild(selectAllRow);

      var list = makeElement("div", { "class": "toggle-list" });
      for (var i = 0; i < group.missions.length; i++) {
        list.appendChild(buildMissionRow(group.map, group.missions[i]));
      }
      panel.appendChild(list);
      panelsEl.appendChild(panel);
      wireSelectAllRow(selectAllRow, panel);
    }

    missionsEl.appendChild(bar);
    missionsEl.appendChild(panelsEl);

    wireTabBar(bar, panelsEl);
    activateTab(bar, panelsEl, firstTabId);
  }

  // One delegated handler for all Completed Missions toggles. Marking a
  // mission completed adds its talent RowName to Talents and its numeric
  // flags to UnlockedFlags; unmarking removes both.
  function onMissionToggleChange(e) {
    var input = e.target;
    if (!input || input.type !== "checkbox") return;
    if (!input.hasAttribute("data-mission-talent")) return;
    setRowToggled(input, input.checked);
    refreshTabStates(input);
  }

  /* ---------- Workshop Unlocks catalogue ---------- */
  // data.json's Workshop_Talents is an object keyed by category; each
  // category maps a display name to a talent RowName. Toggling one on adds
  // { RowName, Rank: 1 } to Talents, exactly like mission talents.
  // Categories are sorted ascending by Workshop_Category_Weights, with
  // first-seen order as the tie-break (mirrors the map groups).
  function buildWorkshopGroups() {
    var weights = (catalog && catalog.Workshop_Category_Weights) || {};
    var byCategory = (catalog && typeof catalog.Workshop_Talents === "object" && catalog.Workshop_Talents)
      ? catalog.Workshop_Talents
      : {};

    var groups = [];
    var firstSeen = {};
    var seq = 0;
    for (var category in byCategory) {
      if (!Object.prototype.hasOwnProperty.call(byCategory, category)) continue;
      var talentsByDisplay = byCategory[category];
      if (!talentsByDisplay || typeof talentsByDisplay !== "object") continue;

      var talents = [];
      var seen = {};
      for (var name in talentsByDisplay) {
        if (!Object.prototype.hasOwnProperty.call(talentsByDisplay, name)) continue;
        var rowName = talentsByDisplay[name];
        if (typeof rowName !== "string" || !rowName) continue;
        if (seen[rowName]) continue; // guard against duplicate RowName entries
        seen[rowName] = true;
        talents.push({ name: name, talent: rowName });
      }
      if (talents.length) {
        groups.push({ category: category, talents: talents });
        firstSeen[category] = ++seq;
      }
    }

    groups.sort(function (a, b) {
      var wa = isFinite(Number(weights[a.category])) ? Number(weights[a.category]) : Infinity;
      var wb = isFinite(Number(weights[b.category])) ? Number(weights[b.category]) : Infinity;
      if (wa !== wb) return wa - wb;
      return firstSeen[a.category] - firstSeen[b.category];
    });
    return groups;
  }

  // Build one Workshop Unlocks toggle row (switch + blueprint name).
  function buildWorkshopRow(category, talent) {
    var checked = isTalentPresent(talent.talent);
    var rowId = "workshop-" + escapeId(category) + "-" + escapeId(talent.talent);
    var row = makeElement("label", {
      "class": "toggle-row" + (checked ? " is-on" : ""),
      "for": rowId
    });

    var input = makeElement("input", {
      id: rowId,
      "class": "toggle-input",
      type: "checkbox"
    });
    input.checked = checked;
    input.setAttribute("data-workshop-talent", talent.talent);
    row.appendChild(input);
    row.appendChild(
      makeElement("span", { "class": "toggle-switch", "aria-hidden": "true" })
    );

    var text = makeElement("span", { "class": "toggle-text" });
    text.appendChild(
      makeElement("span", { "class": "toggle-desc", text: talent.name })
    );
    row.appendChild(text);
    return row;
  }

  // Render the Workshop Unlocks section as a sub-tab bar: one tab per
  // category (labelled with an "unlocked / total" count badge) and one panel
  // per category holding that category's blueprint toggles. The first
  // category is active on load.
  function renderWorkshopUnlocks() {
    if (!workshopEl) return;
    workshopEl.textContent = "";

    var groups = buildWorkshopGroups();
    if (!groups.length) {
      workshopEl.appendChild(
        makeElement("div", {
          "class": "missions-empty",
          text: "No workshop unlocks catalogued yet (data.json has no Workshop_Talents entries)."
        })
      );
      return;
    }

    var bar = makeElement("div", {
      "class": "tab-bar tab-bar-sub",
      role: "tablist",
      "aria-label": "Workshop unlocks by category"
    });
    var panelsEl = makeElement("div", { "class": "subtab-panels" });
    var firstTabId = "";

    for (var g = 0; g < groups.length; g++) {
      var group = groups[g];
      var key = escapeId(group.category) || ("cat-" + g);
      var tabId = "workshop-tab-" + key;
      var panelId = "workshop-panel-" + key;

      var unlocked = 0;
      for (var t = 0; t < group.talents.length; t++) {
        if (isTalentPresent(group.talents[t].talent)) unlocked++;
      }

      var btn = makeElement("button", {
        type: "button",
        role: "tab",
        id: tabId,
        "aria-controls": panelId,
        "class": "tab-btn",
        "data-tab-id": panelId
      });
      btn.appendChild(makeElement("span", { "class": "tab-label", text: group.category }));
      btn.appendChild(
        makeElement("span", {
          "class": "tab-count",
          text: unlocked + " / " + group.talents.length
        })
      );

      bar.appendChild(btn);

      var panel = makeElement("section", {
        role: "tabpanel",
        id: panelId,
        "aria-labelledby": tabId,
        "class": "tab-panel subtab-panel"
      });
      panel.setAttribute("data-tab-id", panelId);
      if (!firstTabId) firstTabId = panelId;

      // The "toggle all" row lives inside the panel (which has no section
      // title), above the toggle rows.
      var selectAllRow = buildSelectAllRow(group.category + " blueprints", panelId);
      panel.appendChild(selectAllRow);

      var list = makeElement("div", { "class": "toggle-list" });
      for (var i = 0; i < group.talents.length; i++) {
        list.appendChild(buildWorkshopRow(group.category, group.talents[i]));
      }
      panel.appendChild(list);
      panelsEl.appendChild(panel);
      wireSelectAllRow(selectAllRow, panel);
    }

    workshopEl.appendChild(bar);
    workshopEl.appendChild(panelsEl);

    wireTabBar(bar, panelsEl);
    activateTab(bar, panelsEl, firstTabId);
  }

  // One delegated handler for all Workshop Unlocks toggles: marking one on
  // adds its talent RowName to Talents (Rank 1); unmarking removes it.
  function onWorkshopToggleChange(e) {
    var input = e.target;
    if (!input || input.type !== "checkbox") return;
    if (!input.hasAttribute("data-workshop-talent")) return;
    setRowToggled(input, input.checked);
    refreshTabStates(input);
  }

  function renderToggleSections() {
    if (!toggleSectionsEl) return;
    toggleSectionsEl.textContent = "";

    // The toggleable flag list comes straight from data.json's
    // General_Account_Unlocked_Flags array of integer flag values;
    // each flag's label is looked up from the Unlocked_Flags catalogue.
    var items = (catalog && Array.isArray(catalog.General_Account_Unlocked_Flags))
      ? catalog.General_Account_Unlocked_Flags
      : [];

    var block = makeElement("div", {
      "class": "toggle-block",
      id: "toggle-block-general-account"
    });

    // The "toggle all" row lives inside the panel: below the section title
    // (the h3 in the panel's static markup) and above the flag rows.
    var selectAllRow = buildSelectAllRow("general account unlocks", "panel-account-unlocks");
    block.appendChild(selectAllRow);

    var list = makeElement("div", { "class": "toggle-list" });
    var seen = {};
    for (var i = 0; i < items.length; i++) {
      var value = Number(items[i]);
      if (!isFinite(value)) continue;
      if (seen[value]) continue; // guard against duplicate catalogue entries
      seen[value] = true;

      var checked = isFlagUnlocked(value);
      var rowId = "toggle-general-account-" + value;
      var row = makeElement("label", {
        "class": "toggle-row" + (checked ? " is-on" : ""),
        for: rowId
      });
      var input = makeElement("input", {
        id: rowId,
        "class": "toggle-input",
        type: "checkbox"
      });
      input.checked = checked;
      input.setAttribute("data-section", "general-account");
      input.setAttribute("data-flag-value", String(value));
      row.appendChild(input);
      row.appendChild(
        makeElement("span", { "class": "toggle-switch", "aria-hidden": "true" })
      );

      var text = makeElement("span", { "class": "toggle-text" });
      // Prefer the description looked up from data.json's Unlocked_Flags;
      // fall back to a generic label.
      var desc = flagDescriptions[value];
      text.appendChild(
        makeElement("span", {
          "class": "toggle-desc",
          text: typeof desc === "string" && desc ? desc : "Flag " + value
        })
      );
      row.appendChild(text);
      list.appendChild(row);
    }
    block.appendChild(list);
    toggleSectionsEl.appendChild(block);

    var panel = block.closest('[role="tabpanel"]');
    if (panel) wireSelectAllRow(selectAllRow, panel);
  }

  /* ---------- Editing ---------- */
  function writeCount(metaRow, value) {
    if (!profileData) return;
    var entry = getMetaEntry(metaRow);
    if (entry) {
      entry.Count = value;
    } else {
      profileData.MetaResources.push({ MetaRow: metaRow, Count: value });
    }
  }

  function onCountInput(e) {
    var input = e.target;
    if (input.value === "") return; // allow temporary empty while typing
    var metaRow = input.closest(".currency-card").getAttribute("data-meta-row");
    writeCount(metaRow, clampCount(input.value));
  }

  function onCountChange(e) {
    var input = e.target;
    var metaRow = input.closest(".currency-card").getAttribute("data-meta-row");
    var value = clampCount(input.value);
    input.value = String(value);
    writeCount(metaRow, value);
  }

  function onQuickClick(e) {
    var btn = e.currentTarget;
    var action = btn.getAttribute("data-action");
    var card = btn.closest(".currency-card");
    var metaRow = card.getAttribute("data-meta-row");
    var config = getCurrencyConfig(metaRow);
    var input = card.querySelector(".currency-count");
    var current = clampCount(input.value);

    var next;
    if (action === "add") {
      next = current + config.addStep;
    } else if (action === "set") {
      next = config.setMax;
    } else if (action === "reset") {
      next = Object.prototype.hasOwnProperty.call(originalCounts, metaRow)
        ? originalCounts[metaRow]
        : 0;
    } else {
      return;
    }

    next = clampCount(next);
    input.value = String(next);
    writeCount(metaRow, next);
  }

  /* ---------- Loading ---------- */
  function handleFile(file) {
    if (!file) return;

    if (!appReady) {
      setStatus(
        "The editor catalogues are still loading \u2014 give it a second and try again.",
        "error"
      );
      return;
    }

    if (loaded && isDirty()) {
      var ok = window.confirm(
        "You have unsaved changes. Load a different file and discard them?"
      );
      if (!ok) return;
    }

    var reader = new FileReader();
    reader.onerror = function () {
      setStatus("Failed to read the file. Please try again.", "error");
    };
    reader.onload = function (ev) {
      loadFromText(String(ev.target.result || ""), file.name);
    };
    reader.readAsText(file);
  }

  function loadFromText(text, name) {
    var clean = text.replace(/^\uFEFF/, "").trim();
    if (!clean) {
      setStatus("The file is empty.", "error");
      return;
    }

    var data;
    try {
      data = JSON.parse(clean);
    } catch (err) {
      setStatus(
        "That file is not valid JSON" + (err && err.message ? " \u2014 " + err.message : "") + ".",
        "error"
      );
      return;
    }

    if (!data || typeof data !== "object" || Array.isArray(data)) {
      setStatus("This file doesn't look like an ICARUS Profile.json (unexpected structure).", "error");
      return;
    }

    if (!Array.isArray(data.MetaResources)) {
      setStatus('Valid JSON, but the required \u201cMetaResources\u201d array is missing.', "error");
      return;
    }

    for (var i = 0; i < data.MetaResources.length; i++) {
      var entry = data.MetaResources[i];
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
        setStatus('The \u201cMetaResources\u201d array contains an invalid entry.', "error");
        return;
      }
    }

    // Accept the file as the new source of truth.
    profileData = data;
    fileName = name || "Profile.json";
    originalCounts = {};
    for (var j = 0; j < data.MetaResources.length; j++) {
      var row = data.MetaResources[j];
      if (row && typeof row.MetaRow === "string" && typeof row.Count === "number") {
        originalCounts[row.MetaRow] = row.Count;
      }
    }
    if (!Array.isArray(data.UnlockedFlags)) {
      data.UnlockedFlags = [];
    }
    originalUnlockedFlags = data.UnlockedFlags.slice();
    // Snapshot the talent RowNames so the "unsaved changes" check covers edits
    // made through the Completed Missions toggles.
    originalTalentSignature = talentRowNames().slice().sort().join("\u0000");
    loaded = true;

    renderCurrencyCards();
    renderToggleSections();
    renderCompletedMissions();
    renderWorkshopUnlocks();
    editorPanel.classList.remove("is-hidden");
    downloadBtn.disabled = false;

    var userId = typeof data.UserID === "string" ? data.UserID : "";
    var talentCount = Array.isArray(data.Talents) ? data.Talents.length : 0;
    fileChip.textContent = [
      name || "Profile.json",
      userId ? "UserID " + userId : "",
      data.MetaResources.length + " meta-resource row(s)",
      talentCount + " talent(s)",
      data.UnlockedFlags.length + " unlocked flag(s)"
    ]
      .filter(Boolean)
      .join("  \u00b7  ");

    setStatus("Loaded " + (name || "Profile.json") + ". Adjust the values, then download.", "ok");
  }

  /* ---------- Export ---------- */
  function downloadProfile() {
    if (!profileData) return;
    try {
      var json = JSON.stringify(profileData, null, 2);
      var blob = new Blob([json], { type: "application/json" });
      var url = URL.createObjectURL(blob);
      var a = document.createElement("a");
      a.href = url;
      a.download = EXPORT_FILENAME;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 1000);

      showToast("Profile.json downloaded \u2713", "success");
      setStatus("Exported " + EXPORT_FILENAME + " with 2-space indentation.", "ok");
    } catch (err) {
      showToast("Download failed" + (err && err.message ? ": " + err.message : ""), "error");
      setStatus("Export failed" + (err && err.message ? " \u2014 " + err.message : "") + ".", "error");
    }
  }

  /* ---------- Catalogue loading ---------- */
  function loadJson(path) {
    return fetch(path, { cache: "no-cache" }).then(function (res) {
      if (!res.ok) throw new Error(path + " \u2014 HTTP " + res.status);
      return res.json();
    });
  }

  function boot() {
    loadJson(DATA_FILE)
      .then(function (data) {
        catalog = data && typeof data === "object" && !Array.isArray(data) ? data : {};
        currencyMap = (catalog && catalog.MetaResources) || {};
        flagDescriptions = buildFlagDescriptions();
        appReady = true;
        setStatus(
          "Ready. Drop a Profile.json to begin " +
            "(" + Object.keys(currencyMap).length + " meta-resources catalogued).",
          "ok"
        );
      })
      .catch(function (err) {
        setStatus(
          "Could not load the editor catalogue" +
            (err && err.message ? " \u2014 " + err.message : "") +
            ". The app must be served over HTTP(S) (e.g. GitHub Pages) with " +
            "the data.json file present in the project root.",
          "error"
        );
      });
  }

  /* ---------- Wiring ---------- */
  function openPicker() {
    fileInput.click();
  }

  function init() {
    // Open the file picker.
    browseBtn.addEventListener("click", function (e) {
      e.stopPropagation();
      openPicker();
    });
    dropzone.addEventListener("click", openPicker);
    dropzone.addEventListener("keydown", function (e) {
      if (e.key === "Enter" || e.key === " " || e.key === "Spacebar") {
        e.preventDefault();
        openPicker();
      }
    });

    fileInput.addEventListener("change", function () {
      var file = fileInput.files && fileInput.files[0];
      if (file) handleFile(file);
      fileInput.value = ""; // allow re-selecting the same file
    });

    // Drag & drop.
    ["dragenter", "dragover"].forEach(function (evt) {
      dropzone.addEventListener(evt, function (e) {
        e.preventDefault();
        dropzone.classList.add("dropzone-active");
      });
    });
    ["dragleave", "dragend"].forEach(function (evt) {
      dropzone.addEventListener(evt, function (e) {
        e.preventDefault();
        dropzone.classList.remove("dropzone-active");
      });
    });
    dropzone.addEventListener("drop", function (e) {
      e.preventDefault();
      dropzone.classList.remove("dropzone-active");
      var files = e.dataTransfer && e.dataTransfer.files;
      var file = files && files[0];
      if (file) handleFile(file);
    });

    // Prevent the browser from navigating when a file is dropped elsewhere.
    window.addEventListener("dragover", function (e) { e.preventDefault(); });
    window.addEventListener("drop", function (e) { e.preventDefault(); });

    downloadBtn.addEventListener("click", downloadProfile);

    // Toggle switches (unlock flags) — one delegated listener.
    if (toggleSectionsEl) {
      toggleSectionsEl.addEventListener("change", onToggleChange);
    }

    // Completed Missions toggles — separate delegated listener.
    if (missionsEl) {
      missionsEl.addEventListener("change", onMissionToggleChange);
    }

    // Workshop Unlocks toggles — separate delegated listener.
    if (workshopEl) {
      workshopEl.addEventListener("change", onWorkshopToggleChange);
    }

    // Top-level editor tabs (Meta-Resources / General Account Unlocks /
    // Completed Missions / Workshop Unlocks). The per-map and per-category
    // sub-tab bars — and each tab group's "toggle all" row, which lives
    // inside its panel — are wired inside their own render functions.
    if (mainTabBar && mainTabPanels) {
      wireTabBar(mainTabBar, mainTabPanels);
    }

    // Fetch the external catalogue from data.json.
    boot();
  }

  // init must run exactly once. The DOMContentLoaded listener is only
  // registered while the document is still loading, but some environments
  // (e.g. test harnesses that dispatch DOMContentLoaded manually) can fire
  // it a second time; the guard keeps init idempotent either way.
  var initRan = false;
  function runInit() {
    if (initRan) return;
    initRan = true;
    init();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", runInit);
  } else {
    runInit();
  }
})();
