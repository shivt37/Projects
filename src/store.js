const CONFIG_KEY = "config";

const DEFAULT_CONFIG = {
  v: 1,
  groups: [
    { id: "g1", name: "Projects", order: 1 },
  ],
  projects: [
    {
      id: "p1", groupId: "g1", name: "SVG Composer", slug: "svg-composer",
      icon: { mode: "iconify", id: "mdi:pencil", svgUrl: "https://api.iconify.design/mdi/pencil.svg", license: "Apache-2.0" },
      kind: "repo", assetPath: "projects/svg-composer/", entry: "index.html", public: false, url: null,
    },
    {
      id: "p2", groupId: "g1", name: "Boxy SVG Editor", slug: "boxy-svg-editor",
      icon: { mode: "iconify", id: "mdi:vector-square", svgUrl: "https://api.iconify.design/mdi/vector-square.svg", license: "Apache-2.0" },
      kind: "repo", assetPath: "projects/boxy-svg-editor.html", entry: null, public: false, url: null,
    },
    {
      id: "p3", groupId: "g1", name: "Nuvio Badge Patterns", slug: "nuvio-badge-patterns",
      icon: { mode: "iconify", id: "mdi:view-grid", svgUrl: "https://api.iconify.design/mdi/view-grid.svg", license: "Apache-2.0" },
      kind: "repo", assetPath: "projects/nuvio-badge-patterns.html", entry: null, public: false, url: null,
    },
    {
      id: "p4", groupId: "g1", name: "Nuvio Badge Studio", slug: "nuvio-badge-studio",
      icon: { mode: "iconify", id: "mdi:star", svgUrl: "https://api.iconify.design/mdi/star.svg", license: "Apache-2.0" },
      kind: "repo", assetPath: "projects/nuvio-badge-studio.html", entry: null, public: false, url: null,
    },
  ],
};

const SLUG_RE = /^[a-z0-9][a-z0-9-_]{0,63}$/;

function normalizeIcon(icon) {
  if (!icon || typeof icon !== "object") {
    return { mode: "iconify", id: "mdi:pencil", svgUrl: "https://api.iconify.design/mdi/pencil.svg", license: "Apache-2.0" };
  }
  const mode = ["upload", "url", "inline", "iconify"].includes(icon.mode) ? icon.mode : "iconify";
  const out = { mode };
  if (mode === "inline" || mode === "upload") out.svg = String(icon.svg || icon.svgText || "").slice(0, 200000);
  if (mode === "url") out.url = String(icon.url || "").slice(0, 2000);
  if (mode === "iconify") {
    out.id = String(icon.id || "mdi:pencil").slice(0, 200);
    out.svgUrl = String(icon.svgUrl || `https://api.iconify.design/${out.id}.svg`).slice(0, 2000);
    out.license = String(icon.license || "").slice(0, 100);
  }
  return out;
}

export function normalizeConfig(input) {
  const source = input && typeof input === "object" ? input : {};
  const groups = Array.isArray(source.groups) ? source.groups.slice(0, 100) : [];
  const projects = Array.isArray(source.projects) ? source.projects.slice(0, 500) : [];
  const cleanGroups = groups.map((group, index) => ({
    id: String(group.id || `g${index + 1}`).slice(0, 64),
    name: String(group.name || `Group ${index + 1}`).slice(0, 80),
    order: Number.isFinite(Number(group.order)) ? Number(group.order) : index + 1,
  }));
  const groupIds = new Set(cleanGroups.map((group) => group.id));
  const seenSlugs = new Set();
  const cleanProjects = projects.map((project, index) => {
    const kind = project.kind === "external" ? "external" : "repo";
    let slug = String(project.slug || "").toLowerCase().trim();
    if (!SLUG_RE.test(slug) || seenSlugs.has(slug)) slug = `project-${index + 1}`;
    seenSlugs.add(slug);
    return {
      id: String(project.id || `p${index + 1}`).slice(0, 64),
      groupId: groupIds.has(project.groupId) ? project.groupId : (cleanGroups[0]?.id || "g1"),
      name: String(project.name || slug).slice(0, 120),
      slug,
      icon: normalizeIcon(project.icon),
      kind,
      assetPath: kind === "repo"
        ? String(project.assetPath || `projects/${slug}/`).replace(/^\/+/, "").replace(/\.\./g, "").slice(0, 500)
        : null,
      entry: kind === "repo" && project.entry ? String(project.entry).replace(/^\/+/, "").slice(0, 200) : null,
      public: Boolean(project.public),
      url: kind === "external" ? String(project.url || "").slice(0, 2000) : (project.url ? String(project.url).slice(0, 2000) : null),
      linkLabel: project.linkLabel ? String(project.linkLabel).slice(0, 80) : null,
    };
  });
  return { v: 1, groups: cleanGroups, projects: cleanProjects };
}

export async function getConfig(env) {
  const raw = await env.GATEWAY.get(CONFIG_KEY);
  if (!raw) {
    const initial = normalizeConfig(DEFAULT_CONFIG);
    await env.GATEWAY.put(CONFIG_KEY, JSON.stringify(initial));
    return initial;
  }
  try {
    return normalizeConfig(JSON.parse(raw));
  } catch {
    return normalizeConfig(DEFAULT_CONFIG);
  }
}

export async function saveConfig(env, config) {
  const clean = normalizeConfig(config);
  await env.GATEWAY.put(CONFIG_KEY, JSON.stringify(clean));
  return clean;
}
