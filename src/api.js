import { getConfig, saveConfig } from "./store.js";

const ICONIFY = "https://api.iconify.design";
const FALLBACK_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#06b6d4" stroke-width="2" stroke-linecap="round"><rect x="3" y="3" width="18" height="18" rx="4"/><path d="M7 12h10M12 7v10"/></svg>';

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "Cache-Control": "private, no-store",
    },
  });
}

export function sanitizeSvg(svg) {
  return String(svg || "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<foreignObject[\s\S]*?<\/foreignObject>/gi, "")
    .replace(/\son[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/javascript:/gi, "")
    .trim();
}

async function pickRandomIcon() {
  try {
    const collectionsResponse = await fetch(`${ICONIFY}/collections`);
    const collections = await collectionsResponse.json();
    const prefixes = Object.entries(collections)
      .filter(([, value]) => value && value.palette === false && value.total >= 20 && value.total <= 1500)
      .map(([prefix]) => prefix);
    if (!prefixes.length) throw new Error("no suitable icon sets");

    const prefix = prefixes[Math.floor(Math.random() * prefixes.length)];
    const collectionResponse = await fetch(`${ICONIFY}/collection?prefix=${encodeURIComponent(prefix)}`);
    const collection = await collectionResponse.json();
    const hidden = new Set(collection.hidden || []);
    const aliases = new Set(Object.keys(collection.aliases || {}));
    const names = [...(collection.uncategorized || []), ...Object.values(collection.categories || {}).flat()]
      .filter((name) => !hidden.has(name) && !aliases.has(name));
    if (!names.length) throw new Error("no icons in set");

    const name = names[Math.floor(Math.random() * names.length)];
    const id = `${prefix}:${name}`;
    const svgUrl = `${ICONIFY}/${prefix}/${name}.svg?color=%2306b6d4`;
    const svgResponse = await fetch(svgUrl);
    if (!svgResponse.ok) throw new Error(`iconify ${svgResponse.status}`);
    const svgText = sanitizeSvg(await svgResponse.text());
    if (!svgText.startsWith("<svg")) throw new Error("invalid svg");
    return {
      mode: "inline",
      id,
      svgUrl,
      svgText,
      license: collections[prefix]?.license?.spdx || "",
    };
  } catch {
    return { mode: "inline", id: "fallback:plus", svgUrl: null, svgText: FALLBACK_SVG, license: "" };
  }
}

export async function handleApi(request, env, url) {
  const { pathname } = url;

  if (pathname === "/api/state" && request.method === "GET") {
    return json(await getConfig(env));
  }

  if (pathname === "/api/config" && request.method === "POST") {
    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: "Invalid JSON body" }, 400);
    }
    const config = await saveConfig(env, body);
    return json({ ok: true, config });
  }

  if (pathname === "/api/random-icon" && request.method === "POST") {
    return json(await pickRandomIcon());
  }

  return json({ error: "Not found" }, 404);
}
