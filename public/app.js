const DEFAULT_ICON = { mode: "iconify", id: "mdi:pencil", svgUrl: "https://api.iconify.design/mdi/pencil.svg", license: "Apache-2.0" };
const FALLBACK_ICON_DATA = `data:image/svg+xml;charset=utf-8,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#06b6d4" stroke-width="2" stroke-linecap="round"><rect x="3" y="3" width="18" height="18" rx="4"/><path d="M7 12h10M12 7v10"/></svg>')}`;
const X_SVG = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
const ACCENT_STORAGE_KEY = "projects_accent";
const ACCENT_COLORS = [
  { name: 'Amber', hex: '#fb923c' }, { name: 'Gold', hex: '#f59e0b' },
  { name: 'Rose', hex: '#f43f5e' }, { name: 'Magenta', hex: '#e63d64' },
  { name: 'Sky Blue', hex: '#60a5fa' }, { name: 'Ice Blue', hex: '#38bdf8' },
  { name: 'Indigo', hex: '#818cf8' }, { name: 'Violet', hex: '#5550f7' },
  { name: 'Cyan', hex: '#06b6d4' }, { name: 'Emerald', hex: '#19be81' },
  { name: 'Pure White', hex: '#e2e8f0' }, { name: 'Slate', hex: '#94a3b8' },
];

const state = { groups: [], projects: [] };
let activeGroup = "all";
let editingId = null;
let originalIcon = null;
let iconTouched = false;
let pendingDelete = null;
let dirty = false;

const $ = (selector) => document.querySelector(selector);
const cards = $("#cards");
const nav = $("#group-nav");
const drawerNav = $("#drawer-nav");
const drawer = $("#drawer");
const menuBtn = $("#menuBtn");
const statusEl = $("#status");
const projectDialog = $("#project-dialog");
const groupDialog = $("#group-dialog");
const confirmDialog = $("#confirm-dialog");

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function announce(message) {
  statusEl.textContent = message;
  statusEl.classList.add("show");
  clearTimeout(announce.timer);
  announce.timer = setTimeout(() => statusEl.classList.remove("show"), 3200);
}

function markDirty() {
  dirty = true;
  $("#save").classList.add("dirty");
}

function sanitizeSvg(svg) {
  return String(svg || "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<foreignObject[\s\S]*?<\/foreignObject>/gi, "")
    .replace(/\son[a-z]+\s*=\s*(["']).*?\1/gi, "")
    .replace(/javascript:/gi, "")
    .trim();
}

function iconSrc(icon) {
  if (!icon) return FALLBACK_ICON_DATA;
  if (icon.mode === "url") return icon.url || FALLBACK_ICON_DATA;
  if (icon.mode === "inline" || icon.mode === "upload") {
    return icon.svg ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(icon.svg)}` : FALLBACK_ICON_DATA;
  }
  if (icon.svgUrl && /^https:\/\/api\.iconify\.design\/[^/]*:/.test(icon.svgUrl)) {
    const [prefix, ...name] = String(icon.id || "mdi:pencil").split(":");
    return `https://api.iconify.design/${prefix}/${name.join("-")}.svg`;
  }
  return icon.svgUrl || FALLBACK_ICON_DATA;
}

async function load() {
  const response = await fetch("/api/state", { headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error(`State request failed (${response.status})`);
  const config = await response.json();
  state.groups = config.groups || [];
  state.projects = config.projects || [];
  render();
}

function renderNavInto(container, isDrawer) {
  container.replaceChildren();
  const choose = (id) => { activeGroup = id; render(); if (isDrawer) closeDrawer(); };

  const all = el("button", "group-btn");
  all.type = "button";
  all.append(el("span", null, "All projects"), el("span", "count", String(state.projects.length)));
  all.setAttribute("aria-current", activeGroup === "all" ? "true" : "false");
  all.addEventListener("click", () => choose("all"));
  container.append(all);

  for (const group of [...state.groups].sort((a, b) => a.order - b.order)) {
    const count = state.projects.filter((p) => p.groupId === group.id).length;
    const row = el("div", "group-row");
    const button = el("button", "group-btn");
    button.type = "button";
    button.append(el("span", null, group.name), el("span", "count", String(count)));
    button.setAttribute("aria-current", activeGroup === group.id ? "true" : "false");
    button.addEventListener("click", () => choose(group.id));

    const remove = el("button", "group-del");
    remove.type = "button";
    remove.innerHTML = X_SVG;
    remove.title = `Remove ${group.name}`;
    remove.setAttribute("aria-label", `Remove group ${group.name}`);
    remove.addEventListener("click", () => {
      askConfirm(`Remove group “${group.name}”? Its projects will move to the first group.`, () => {
        state.groups = state.groups.filter((g) => g.id !== group.id);
        if (!state.groups.length) state.groups.push({ id: "g1", name: "Projects", order: 1 });
        for (const project of state.projects) {
          if (project.groupId === group.id) project.groupId = state.groups[0].id;
        }
        if (activeGroup === group.id) activeGroup = "all";
        markDirty();
        render();
      });
    });
    row.append(button, remove);
    container.append(row);
  }
}

function syncNavInert() {
  const open = drawer.open;
  nav.inert = open;
  drawerNav.inert = !open;
  nav.setAttribute("aria-hidden", String(open));
  drawerNav.setAttribute("aria-hidden", String(!open));
}

function renderNav() {
  renderNavInto(nav, false);
  renderNavInto(drawerNav, true);
  syncNavInert();
}

function cardFor(project) {
  const card = el("article", "card");
  const href = project.kind === "external" ? project.url : `/p/${encodeURIComponent(project.slug)}`;

  const icon = el("img", "icon");
  icon.src = iconSrc(project.icon);
  icon.alt = "";
  icon.width = 16;
  icon.height = 16;
  icon.addEventListener("error", () => { icon.src = FALLBACK_ICON_DATA; });
  card.append(icon);

  const heading = el("h3");
  const link = el("a", "card-link", project.name);
  link.href = href || "#";
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  heading.append(link);
  if (project.kind === "repo" && project.public) heading.append(el("span", "badge-public", "public"));
  card.append(heading);
  card.append(el("p", "meta", project.kind === "repo" ? project.assetPath : project.url));

  const footer = el("footer");
  if (project.kind === "repo" && project.url) {
    const extra = el("a", "ghost", project.linkLabel || "Open link");
    extra.href = project.url;
    extra.target = "_blank";
    extra.rel = "noopener noreferrer";
    footer.append(extra);
  }
  const edit = el("button", "ghost", "Edit");
  edit.type = "button";
  edit.addEventListener("click", () => openProject(project));
  const remove = el("button", "danger", "Delete");
  remove.type = "button";
  remove.addEventListener("click", () => askConfirm(`Delete “${project.name}”?`, () => {
    state.projects = state.projects.filter((p) => p.id !== project.id);
    card.remove();
    if (!cards.querySelector(".card")) cards.append(el("p", "hint", "No projects here yet. Use “Add project” to create one."));
    $("#count").textContent = String(cards.querySelectorAll(".card").length);
    renderNav();
    markDirty();
  }));
  footer.append(edit, remove);
  card.append(footer);
  return card;
}

function render() {
  renderNav();
  const visible = state.projects.filter((p) => activeGroup === "all" || p.groupId === activeGroup);
  $("#section-title").textContent = activeGroup === "all"
    ? "All projects"
    : state.groups.find((g) => g.id === activeGroup)?.name || "Projects";
  $("#count").textContent = String(visible.length);
  cards.replaceChildren(...visible.map(cardFor));
  if (!visible.length) cards.append(el("p", "hint", "No projects here yet. Use “Add project” to create one."));
}

function askConfirm(message, onConfirm) {
  $("#confirm-message").textContent = message;
  pendingDelete = onConfirm;
  confirmDialog.showModal();
}

$("#confirm-cancel").addEventListener("click", () => { pendingDelete = null; confirmDialog.close(); });
$("#confirm-delete").addEventListener("click", () => {
  const action = pendingDelete;
  pendingDelete = null;
  confirmDialog.close();
  if (action) action();
});

for (const button of document.querySelectorAll("[data-close]")) {
  button.addEventListener("click", () => button.closest("dialog").close());
}

function setFieldError(input, invalid) {
  input.setAttribute("aria-invalid", invalid ? "true" : "false");
  const error = document.getElementById(input.dataset.error);
  if (error) error.hidden = !invalid;
  const id = input.dataset.error;
  const current = (input.getAttribute("aria-describedby") || "").split(/\s+/).filter(Boolean);
  const ids = invalid ? [...new Set([...current, id])] : current.filter((value) => value !== id);
  if (ids.length) input.setAttribute("aria-describedby", ids.join(" "));
  else input.removeAttribute("aria-describedby");
}

for (const input of document.querySelectorAll("input[data-error]")) {
  input.addEventListener("blur", () => { if (input.value) setFieldError(input, !input.checkValidity()); });
  input.addEventListener("input", () => { if (input.getAttribute("aria-invalid") === "true" && input.checkValidity()) setFieldError(input, false); });
}

function fillGroups() {
  const select = $("#p-group");
  select.replaceChildren();
  for (const group of [...state.groups].sort((a, b) => a.order - b.order)) {
    const option = el("option", null, group.name);
    option.value = group.id;
    select.append(option);
  }
}

function showKindFields(kind) {
  for (const field of document.querySelectorAll("[data-when]")) {
    const visible = field.dataset.when === kind;
    field.hidden = !visible;
    const input = field.querySelector("input, select, textarea");
    if (input && (input.id === "p-path" || input.id === "p-url")) input.required = visible;
  }
}

function showIconFields(mode) {
  for (const field of document.querySelectorAll("[data-icon]")) {
    field.hidden = field.dataset.icon !== mode;
  }
}

function previewIcon(icon) {
  const image = $("#icon-preview");
  const source = iconSrc(icon);
  if (!source) { image.hidden = true; image.removeAttribute("src"); return; }
  image.src = source;
  image.alt = "Selected icon preview";
  image.hidden = false;
}

function setIconMode(mode) {
  const radio = document.querySelector(`input[name="iconMode"][value="${mode}"]`);
  if (radio) radio.checked = true;
  showIconFields(mode);
}

async function generateIcon() {
  announce("Choosing an icon…");
  try {
    const response = await fetch("/api/random-icon", { method: "POST" });
    if (!response.ok) throw new Error(`Icon request failed (${response.status})`);
    const icon = await response.json();
    iconTouched = true;
    $("#p-icon-code").value = icon.svgText || "";
    $("#p-icon-code").dataset.license = icon.license || "";
    $("#p-icon-code").dataset.iconId = icon.id || "";
    setIconMode("inline");
    previewIcon({ mode: "inline", svg: icon.svgText });
    announce("Icon chosen.");
  } catch {
    announce("Could not reach the icon service. You can paste or upload an SVG instead.");
  }
}

$("#random-icon").addEventListener("click", generateIcon);

$("#p-icon-file").addEventListener("change", async (event) => {
  const file = event.target.files?.[0];
  if (!file) return;
  const svg = sanitizeSvg(await file.text());
  iconTouched = true;
  $("#p-icon-code").value = svg;
  setIconMode("inline");
  previewIcon({ mode: "inline", svg });
});

for (const radio of document.querySelectorAll('input[name="kind"]')) {
  radio.addEventListener("change", () => showKindFields(radio.value));
}
for (const radio of document.querySelectorAll('input[name="iconMode"]')) {
  radio.addEventListener("change", () => { iconTouched = true; showIconFields(radio.value); });
}
for (const id of ["p-icon-url", "p-icon-code"]) {
  $(`#${id}`).addEventListener("input", () => { iconTouched = true; });
}

function openProject(project = null) {
  editingId = project?.id || null;
  const form = $("#project-form");
  form.reset();
  for (const input of form.querySelectorAll("input[data-error]")) setFieldError(input, false);
  fillGroups();
  $("#project-title").textContent = project ? "Edit project" : "Add project";
  $("#delete-project").hidden = !project;
  originalIcon = project?.icon || null;
  iconTouched = false;

  if (project) {
    $("#p-name").value = project.name;
    $("#p-slug").value = project.slug;
    $("#p-group").value = project.groupId || state.groups[0]?.id || "";
    document.querySelector(`input[name="kind"][value="${project.kind}"]`).checked = true;
    $("#p-path").value = project.assetPath || "";
    $("#p-entry").value = project.entry || "";
    $("#p-url").value = project.kind === "external" ? (project.url || "") : "";
    $("#p-extra-url").value = project.kind === "repo" ? (project.url || "") : "";
    $("#p-link-label").value = project.linkLabel || "";
    $("#p-public").checked = Boolean(project.public);
    const icon = project.icon || {};
    const mode = icon.mode === "url" ? "url" : (["inline", "upload"].includes(icon.mode) ? "inline" : "random");
    setIconMode(mode);
    if (mode === "url") $("#p-icon-url").value = icon.url || "";
    else if (mode === "inline") {
      $("#p-icon-code").value = icon.svg || "";
      $("#p-icon-code").dataset.license = icon.license || "";
      $("#p-icon-code").dataset.iconId = icon.id || "";
    }
    previewIcon(icon);
  } else {
    $("#p-icon-code").dataset.license = "";
    $("#p-icon-code").dataset.iconId = "";
    showIconFields("random");
    $("#icon-preview").hidden = true;
  }
  showKindFields(project?.kind === "external" ? "external" : "repo");
  projectDialog.showModal();
}

$("#add-project").addEventListener("click", () => openProject());
$("#add-group").addEventListener("click", () => {
  $("#group-form").reset();
  setFieldError($("#group-name"), false);
  groupDialog.showModal();
});

$("#group-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const input = $("#group-name");
  if (!input.checkValidity()) { setFieldError(input, true); input.focus(); return; }
  const name = input.value.trim();
  const group = { id: `g-${crypto.randomUUID().slice(0, 8)}`, name, order: state.groups.length + 1 };
  state.groups.push(group);
  activeGroup = group.id;
  markDirty();
  render();
  groupDialog.close();
  announce("Group added. Save changes to keep it.");
});

$("#project-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.target;
  const fields = [$("#p-name"), $("#p-slug")];
  const kind = form.querySelector('input[name="kind"]:checked').value;
  fields.push(kind === "repo" ? $("#p-path") : $("#p-url"));
  let valid = true;
  for (const field of fields) {
    if (!field.checkValidity() || !field.value.trim()) { setFieldError(field, true); valid = false; }
  }
  if (!valid) { fields.find((f) => f.getAttribute("aria-invalid") === "true")?.focus(); return; }

  let icon;
  const iconMode = form.querySelector('input[name="iconMode"]:checked').value;
  if (iconMode === "random" && originalIcon && !iconTouched) {
    icon = originalIcon;
  } else if (iconMode === "random") {
    try {
      const response = await fetch("/api/random-icon", { method: "POST" });
      if (!response.ok) throw new Error(`Icon request failed (${response.status})`);
      const data = await response.json();
      icon = {
        mode: "inline",
        svg: data.svgText,
        id: data.id,
        license: data.license,
        svgUrl: data.svgUrl,
      };
    } catch {
      icon = originalIcon || DEFAULT_ICON;
    }
  } else if (iconMode === "url") {
    const iconUrl = $("#p-icon-url").value.trim();
    icon = iconUrl ? { mode: "url", url: iconUrl } : (originalIcon && !iconTouched ? originalIcon : DEFAULT_ICON);
  } else {
    const code = $("#p-icon-code").value;
    if (code.trim()) {
      icon = {
        mode: "inline",
        svg: sanitizeSvg(code),
        id: $("#p-icon-code").dataset.iconId || "custom:icon",
        license: $("#p-icon-code").dataset.license || "",
        svgUrl: null,
      };
    } else {
      icon = originalIcon && !iconTouched ? originalIcon : DEFAULT_ICON;
    }
  }

  const existing = state.projects.find((p) => p.id === editingId);
  const url = kind === "external" ? $("#p-url").value.trim() : ($("#p-extra-url").value.trim() || null);
  const linkLabel = $("#p-link-label").value.trim() || null;
  const project = {
    id: existing?.id || `p-${crypto.randomUUID().slice(0, 8)}`,
    groupId: $("#p-group").value || state.groups[0]?.id || null,
    name: $("#p-name").value.trim(),
    slug: $("#p-slug").value.trim().toLowerCase(),
    icon,
    kind,
    assetPath: kind === "repo" ? $("#p-path").value.trim().replace(/^\/+/, "") : null,
    entry: kind === "repo" && $("#p-entry").value.trim() ? $("#p-entry").value.trim() : null,
    public: $("#p-public").checked,
    url,
    linkLabel,
  };

  const duplicate = state.projects.some((p) => p.slug === project.slug && p.id !== project.id);
  if (duplicate) {
    setFieldError($("#p-slug"), true);
    announce("That slug is already used by another project.");
    return;
  }

  if (existing) state.projects[state.projects.indexOf(existing)] = project;
  else state.projects.push(project);
  markDirty();
  render();
  projectDialog.close();
  announce("Project updated. Save changes to keep it.");
});

$("#delete-project").addEventListener("click", () => {
  const id = editingId;
  if (!id) return;
  askConfirm("Delete this project?", () => {
    state.projects = state.projects.filter((p) => p.id !== id);
    markDirty();
    render();
    projectDialog.close();
  });
});

$("#save").addEventListener("click", async () => {
  const button = $("#save");
  button.disabled = true;
  try {
    const response = await fetch("/api/config", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(state),
    });
    if (!response.ok) throw new Error(`Save failed (${response.status})`);
    const result = await response.json();
    state.groups = result.config.groups;
    state.projects = result.config.projects;
    dirty = false;
    $("#save").classList.remove("dirty");
    render();
    announce("Saved.");
  } catch (error) {
    announce(error.message);
  } finally {
    button.disabled = false;
  }
});

/* Mobile groups drawer */
function openDrawer() {
  drawer.showModal();
  menuBtn.setAttribute("aria-expanded", "true");
  syncNavInert();
}
function closeDrawer() {
  if (drawer.open) drawer.close();
  menuBtn.setAttribute("aria-expanded", "false");
  syncNavInert();
}
menuBtn.addEventListener("click", openDrawer);
$("#drawer-close").addEventListener("click", closeDrawer);
drawer.addEventListener("close", () => {
  menuBtn.setAttribute("aria-expanded", "false");
  syncNavInert();
});
drawer.addEventListener("click", (event) => {
  const sheet = drawer.querySelector(".drawer-sheet");
  if (sheet && !sheet.contains(event.target)) closeDrawer();
});

/* Light-dismiss fallback for browsers without <dialog closedby> support */
if (!("closedBy" in HTMLDialogElement.prototype)) {
  for (const dialog of document.querySelectorAll("dialog[closedby='any']")) {
    dialog.addEventListener("click", (event) => {
      if (event.target !== dialog) return;
      const rect = dialog.getBoundingClientRect();
      const inside = rect.top <= event.clientY && event.clientY <= rect.top + rect.height &&
        rect.left <= event.clientX && event.clientX <= rect.left + rect.width;
      if (!inside) dialog.close();
    });
  }
}

/* Accent selector */
function applyAccent(hex) {
  const color = ACCENT_COLORS.find((entry) => entry.hex === hex) || ACCENT_COLORS[8];
  const value = parseInt(color.hex.slice(1), 16);
  const r = (value >> 16) & 255;
  const g = (value >> 8) & 255;
  const b = value & 255;
  const pale = color.name === "Pure White" || color.name === "Slate";
  const root = document.documentElement;
  root.style.setProperty("--accent", color.hex);
  root.style.setProperty("--accent-dim", `rgba(${r},${g},${b},${pale ? 0.08 : 0.10})`);
  root.style.setProperty("--accent-glow", `rgba(${r},${g},${b},${pale ? 0.14 : 0.18})`);
  root.style.setProperty("--accent-soft", `rgba(${r},${g},${b},0.06)`);
  for (const swatch of document.querySelectorAll(".swatch")) {
    const selected = swatch.dataset.hex === color.hex;
    swatch.classList.toggle("selected", selected);
    swatch.setAttribute("aria-checked", selected ? "true" : "false");
    swatch.tabIndex = selected ? 0 : -1;
  }
}

function initAccent() {
  const popup = $("#accent-popup");
  const button = $("#accentBtn");
  const grid = el("div", "swatches");
  popup.append(el("p", "accent-popup-title", "Accent colour"), grid);

  for (const color of ACCENT_COLORS) {
    const swatch = el("button", "swatch");
    swatch.type = "button";
    swatch.style.background = color.hex;
    swatch.dataset.hex = color.hex;
    swatch.title = color.name;
    swatch.setAttribute("role", "radio");
    swatch.setAttribute("aria-label", `Accent colour: ${color.name}`);
    swatch.addEventListener("click", () => {
      applyAccent(color.hex);
      try { localStorage.setItem(ACCENT_STORAGE_KEY, color.hex); } catch {}
      popup.hidden = true;
      button.setAttribute("aria-expanded", "false");
    });
    swatch.addEventListener("keydown", (event) => {
      const items = [...grid.children];
      const index = items.indexOf(swatch);
      const steps = { ArrowRight: 1, ArrowDown: 6, ArrowLeft: -1, ArrowUp: -6 };
      let next = null;
      if (event.key in steps) next = (index + steps[event.key] + items.length) % items.length;
      else if (event.key === "Home") next = 0;
      else if (event.key === "End") next = items.length - 1;
      if (next === null) return;
      event.preventDefault();
      items[next].focus();
    });
    grid.append(swatch);
  }

  let saved = "#06b6d4";
  try { saved = localStorage.getItem(ACCENT_STORAGE_KEY) || saved; } catch {}
  applyAccent(saved);

  button.addEventListener("click", () => {
    popup.hidden = !popup.hidden;
    button.setAttribute("aria-expanded", popup.hidden ? "false" : "true");
  });
  document.addEventListener("click", (event) => {
    if (!popup.hidden && !popup.contains(event.target) && !button.contains(event.target)) {
      popup.hidden = true;
      button.setAttribute("aria-expanded", "false");
    }
  });
}
initAccent();

window.addEventListener("beforeunload", (event) => {
  if (!dirty) return;
  event.preventDefault();
  event.returnValue = "";
});

load().catch((error) => announce(error.message));
