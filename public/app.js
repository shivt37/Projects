const DEFAULT_ICON = { mode: "iconify", id: "mdi:pencil", svgUrl: "https://api.iconify.design/mdi/pencil.svg", license: "Apache-2.0" };

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
  if (!icon) return "";
  if (icon.mode === "url") return icon.url || "";
  if (icon.mode === "inline" || icon.mode === "upload") {
    return icon.svg ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(icon.svg)}` : "";
  }
  return icon.svgUrl || "";
}

async function load() {
  const response = await fetch("/api/state", { headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error(`State request failed (${response.status})`);
  const config = await response.json();
  state.groups = config.groups || [];
  state.projects = config.projects || [];
  render();
}

function renderNav() {
  nav.replaceChildren();
  const all = el("button", "group-btn");
  all.type = "button";
  all.append(el("span", null, "All projects"), el("span", "count", String(state.projects.length)));
  all.setAttribute("aria-current", activeGroup === "all" ? "true" : "false");
  all.addEventListener("click", () => { activeGroup = "all"; render(); });
  nav.append(all);

  for (const group of [...state.groups].sort((a, b) => a.order - b.order)) {
    const count = state.projects.filter((p) => p.groupId === group.id).length;
    const row = el("div", "group-row");
    const button = el("button", "group-btn");
    button.type = "button";
    button.append(el("span", null, group.name), el("span", "count", String(count)));
    button.setAttribute("aria-current", activeGroup === group.id ? "true" : "false");
    button.addEventListener("click", () => { activeGroup = group.id; render(); });

    const remove = el("button", "group-del", "×");
    remove.type = "button";
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
    nav.append(row);
  }
}

function cardFor(project) {
  const card = el("article", "card");
  const href = project.kind === "external" ? project.url : `/p/${encodeURIComponent(project.slug)}`;

  const icon = el("img", "icon");
  icon.src = iconSrc(project.icon);
  icon.alt = "";
  icon.width = 34;
  icon.height = 34;
  card.append(icon);

  const heading = el("h3");
  const link = el("a", "card-link", project.name);
  link.href = href || "#";
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  heading.append(link);
  if (project.kind === "repo" && project.public) heading.append(el("span", "badge-public", "public"));
  card.append(heading);
  card.append(el("p", null, project.kind === "repo" ? project.assetPath : project.url));

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
    markDirty();
    render();
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
    render();
    announce("Saved.");
  } catch (error) {
    announce(error.message);
  } finally {
    button.disabled = false;
  }
});

window.addEventListener("beforeunload", (event) => {
  if (!dirty) return;
  event.preventDefault();
  event.returnValue = "";
});

load().catch((error) => announce(error.message));
