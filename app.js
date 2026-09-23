/* =========================================================
   ICARUS Profile Editor — app.js
   Reads, validates, and edits Profile.json entirely in-browser.
   Only the values the user edits (`MetaResources` counts and
   `UnlockedFlags` entries) are ever mutated; every other key
   in the save file is preserved exactly as loaded.

   Currency names and the unlock-flag catalogue live in external
   JSON files under data/ so they can be updated per game patch
   without touching this script.
   ========================================================= */
(function () {
  "use strict";

  // ---- External data files (fetched at startup) ----
  var DATA_FILES = {
    currencyMap: "data/currency_map.json",
    generalAccountUnlocks: "data/general_account_unlocks.json"
  };

  // ---- Toggle section registry ----
  // Each entry describes one toggleable list rendered in the
  // "Account Unlocks" panel. To add a future catalogue (missions,
  // workshop unlocks, talents, ...), drop a JSON file under data/
  // and register it here — the rendering pipeline is generic.
  var TOGGLE_SECTIONS = [
    {
      id: "general-account",
      title: "General Account Unlocks",
      sourceKey: "generalAccountUnlocks", // key into DATA_FILES
      itemsKey: "UnlockedFlags",          // property inside that JSON file
      descriptionKey: "description",
      valueKey: "unlock_flag_value"
    }
  ];

  var EXPORT_FILENAME = "Profile.json";
  // Defaults applied when a currency entry in data/currency_map.json
  // omits the per-currency fields.
  var DEFAULT_ADD_STEP = 10000;
  var DEFAULT_SET_MAX = 999999;

  // ---- State ----
  var profileData = null;
  var fileName = "";
  var originalCounts = {};
  var originalUnlockedFlags = [];
  var loaded = false;
  var toastTimer = null;

  // External catalogues, fetched from data/ before a profile is loaded.
  var currencyMap = null;
  var dataSources = {};
  var appReady = false;

  // ---- DOM refs ----
  var dropzone = document.getElementById("dropzone");
  var fileInput = document.getElementById("file-input");
  var browseBtn = document.getElementById("browse-btn");
  var statusEl = document.getElementById("status");
  var editorPanel = document.querySelector(".editor-panel");
  var fileChip = document.getElementById("file-chip");
  var currencyGrid = document.getElementById("currency-grid");
  var toggleSectionsEl = document.getElementById("toggle-sections");
  var downloadBtn = document.getElementById("download-btn");
  var toastEl = document.getElementById("toast");

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
  // Each entry in data/currency_map.json may be:
  //   "MetaRow": { "name": ..., "addStep": ..., "setMax": ... }
  //   "MetaRow": "Display name"            (legacy / minimal form)
  // Missing addStep / setMax fall back to the defaults below.
  function getCurrencyConfig(metaRow) {
    var name = metaRow;
    var addStep = DEFAULT_ADD_STEP;
    var setMax = DEFAULT_SET_MAX;

    var entry = currencyMap && currencyMap[metaRow];
    if (typeof entry === "string" && entry) {
      name = entry;
    } else if (entry && typeof entry === "object") {
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
  function getFlagValue(item, section) {
    var raw = item && item[section.valueKey];
    var n = Number(raw);
    return isFinite(n) ? n : null;
  }

  function isFlagUnlocked(value) {
    if (!profileData || !Array.isArray(profileData.UnlockedFlags)) return false;
    for (var i = 0; i < profileData.UnlockedFlags.length; i++) {
      if (profileData.UnlockedFlags[i] === value) return true;
    }
    return false;
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

  function onToggleChange(e) {
    var input = e.target;
    if (!input || input.type !== "checkbox") return;
    var value = Number(input.getAttribute("data-flag-value"));
    if (!isFinite(value)) return;
    setFlagUnlocked(value, input.checked);
    var row = input.closest(".toggle-row");
    if (row) row.classList.toggle("is-on", input.checked);
  }

  function renderToggleSections() {
    if (!toggleSectionsEl) return;
    toggleSectionsEl.textContent = "";

    for (var s = 0; s < TOGGLE_SECTIONS.length; s++) {
      var section = TOGGLE_SECTIONS[s];
      var source = dataSources[section.sourceKey] || {};
      var items = Array.isArray(source[section.itemsKey])
        ? source[section.itemsKey]
        : [];

      var block = makeElement("div", {
        "class": "toggle-block",
        id: "toggle-block-" + section.id
      });
      block.appendChild(
        makeElement("h4", { "class": "toggle-block-title", text: section.title })
      );

      var list = makeElement("div", { "class": "toggle-list" });
      var seen = {};
      for (var i = 0; i < items.length; i++) {
        var item = items[i];
        var value = getFlagValue(item, section);
        if (value === null) continue;
        if (seen[value]) continue; // guard against duplicate catalogue entries
        seen[value] = true;

        var checked = isFlagUnlocked(value);
        var rowId = "toggle-" + section.id + "-" + value;
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
        input.setAttribute("data-section", section.id);
        input.setAttribute("data-flag-value", String(value));
        row.appendChild(input);
        row.appendChild(
          makeElement("span", { "class": "toggle-switch", "aria-hidden": "true" })
        );

        var text = makeElement("span", { "class": "toggle-text" });
        var desc = item[section.descriptionKey];
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
    }
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
    loaded = true;

    renderCurrencyCards();
    renderToggleSections();
    editorPanel.classList.remove("is-hidden");
    downloadBtn.disabled = false;

    var userId = typeof data.UserID === "string" ? data.UserID : "";
    fileChip.textContent = [
      name || "Profile.json",
      userId ? "UserID " + userId : "",
      data.MetaResources.length + " meta-resource row(s)",
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
    var keys = [];
    for (var key in DATA_FILES) {
      if (Object.prototype.hasOwnProperty.call(DATA_FILES, key)) keys.push(key);
    }

    Promise.all(
      keys.map(function (key) {
        return loadJson(DATA_FILES[key]).then(function (data) {
          dataSources[key] = data;
        });
      })
    )
      .then(function () {
        currencyMap = dataSources.currencyMap || {};
        appReady = true;
        setStatus(
          "Ready. Drop a Profile.json to begin " +
            "(" + Object.keys(currencyMap).length + " currencies catalogued).",
          "ok"
        );
      })
      .catch(function (err) {
        setStatus(
          "Could not load the editor catalogues" +
            (err && err.message ? " \u2014 " + err.message : "") +
            ". The app must be served over HTTP(S) (e.g. GitHub Pages) with " +
            "the files in data/ present.",
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

    // Fetch the external catalogues from data/.
    boot();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();