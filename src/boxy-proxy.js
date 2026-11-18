const BASE = "https://boxy-svg.com/node_modules/@boxy-svg/boxy-svg/";
const PREFIX = "/p/boxy-svg-editor/boxy/";

const DROP_HEADERS = new Set([
  "content-security-policy",
  "content-security-policy-report-only",
  "x-content-security-policy",
  "x-webkit-csp",
  "x-frame-options",
  "content-length",
  "content-encoding",
  "transfer-encoding",
  "set-cookie",
  "access-control-allow-origin",
  "cross-origin-resource-policy",
]);

const TEXT_TYPE = /^(text\/|application\/javascript|application\/json|image\/svg\+xml)/i;

function notFound() {
  return new Response("Not found", {
    status: 404,
    headers: { "content-type": "text/plain; charset=utf-8", "Cache-Control": "private, no-store" },
  });
}

export async function proxyBoxy(request, path, isPublic = false) {
  if (!path || path.includes("..") || path.includes("\\")) return notFound();
  if (request.method !== "GET" && request.method !== "HEAD") {
    return new Response("Method not allowed", { status: 405 });
  }

  const remote = new URL(path, BASE);
  if (remote.origin !== "https://boxy-svg.com" ||
      !remote.pathname.startsWith("/node_modules/@boxy-svg/boxy-svg/")) {
    return notFound();
  }
  remote.search = new URL(request.url).search;

  let upstream;
  try {
    upstream = await fetch(remote.toString(), {
      method: "GET",
      headers: { Accept: request.headers.get("Accept") || "*/*" },
      redirect: "follow",
    });
  } catch {
    return notFound();
  }

  const headers = new Headers();
  for (const [name, value] of upstream.headers) {
    if (!DROP_HEADERS.has(name.toLowerCase())) headers.set(name, value);
  }
  headers.set("Cache-Control", isPublic ? "public, max-age=3600" : "private, no-store");

  const type = upstream.headers.get("content-type") || "";
  if (request.method === "HEAD") {
    return new Response(null, { status: upstream.status, statusText: upstream.statusText, headers });
  }

  if (TEXT_TYPE.test(type)) {
    const text = await upstream.text();
    const rewritten = text.split(BASE).join(PREFIX).split(BASE.slice(0, -1)).join(PREFIX.slice(0, -1));
    return new Response(rewritten, { status: upstream.status, statusText: upstream.statusText, headers });
  }

  return new Response(upstream.body, { status: upstream.status, statusText: upstream.statusText, headers });
}
