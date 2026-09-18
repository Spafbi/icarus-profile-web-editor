/* =========================================================
   ICARUS Profile Editor — app.js
   Reads, validates, and edits Profile.json entirely in-browser.
   Only `MetaResources` entries are ever mutated; every other
   key in the save file is preserved exactly as loaded.
   ========================================================= */
(function () {
  "use strict";

  // ---- Currency mapping (internal MetaRow -> in-game display name) ----
  var CURRENCY_MAP = {
    Credits: "Ren",
    Exotic1: "Exotics",
    Exotic_Red: "Red Exotics",
    Biomass: "Legendary Biomass",
    Licence: "Legendary Licences",
    Exotic_Uranium: "Uranium Rods",
    Refund: "Respec Points"
  };

  var EXPORT_FILENAME = "Profile.json";
  var ADD_STEP = 10000;
  var SET_MAX = 999999;

  // ---- State ----
  var profileData = null;
  var fileName = "";
  var originalCounts = {};
  var loaded = false;
  var toastTimer = null;

  // ---- DOM refs ----
  var dropzone = document.getElementById("dropzone");
  var fileInput = document.getElementById("file-input");
  var browseBtn = document.getElementById("browse-btn");
  var statusEl = document.getElementById("status");
  var editorPanel = document.querySelector(".editor-panel");
  var fileChip = document.getElementById("file-chip");
  var currencyGrid = document.getElementById("currency-grid");
  var downloadBtn = document.getElementById("download-btn");
  var toastEl = document.getElementById("toast");

  /* ---------- Helpers ---------- */
  function clampCount(value) {
    var n = Math.floor(Number(value));
    if (!isFinite(n) || n < 0) return 0;
    return n;
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
    if (!profileData || !Array.isArray(profileData.MetaResources)) return false;
    for (var i = 0; i < profileData.MetaResources.length; i++) {
      var entry = profileData.MetaResources[i];
      var row = entry && entry.MetaRow;
      if (row in originalCounts) {
        if (originalCounts[row] !== entry.Count) return true;
      } else {
        return true; // a row was injected that wasn't present originally
      }
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

  function renderCurrencyCards() {
    currencyGrid.textContent = "";

    for (var metaRow in CURRENCY_MAP) {
      if (!Object.prototype.hasOwnProperty.call(CURRENCY_MAP, metaRow)) continue;

      var name = CURRENCY_MAP[metaRow];
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
      actions.appendChild(makeQuickButton("add", "+10,000"));
      actions.appendChild(makeQuickButton("set", "Set 999,999"));
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
    var input = card.querySelector(".currency-count");
    var current = clampCount(input.value);

    var next;
    if (action === "add") {
      next = current + ADD_STEP;
    } else if (action === "set") {
      next = SET_MAX;
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
    loaded = true;

    renderCurrencyCards();
    editorPanel.classList.remove("is-hidden");
    downloadBtn.disabled = false;

    var userId = typeof data.UserID === "string" ? data.UserID : "";
    fileChip.textContent = [
      name || "Profile.json",
      userId ? "UserID " + userId : "",
      data.MetaResources.length + " meta-resource row(s)"
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
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();