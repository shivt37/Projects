import { checkSession, isAuthEnabled, loginPageHtml } from "./auth.js";
import { getConfig } from "./store.js";

function notFound(headers) {
  return new Response("Not found", {
    status: 404,
    headers: { "content-type": "text/plain; charset=utf-8", ...headers },
  });
}

function withCache(response, isPublic) {
  const headers = new Headers(response.headers);
  headers.set("Cache-Control", isPublic ? "public, max-age=3600" : "private, no-store");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function safeAssetPath(project) {
  const path = String(project.assetPath || "");
  if (!path || path.startsWith("/") || path.includes("..") || path.includes("\\")) return null;
  return path;
}

export async function handleProject(request, env, slug, subpath) {
  const config = await getConfig(env);
  const project = config.projects.find((p) => p.slug === slug && p.kind === "repo");
  const privateHeaders = { "Cache-Control": "private, no-store" };

  if (!project) return notFound(privateHeaders);

  if (!project.public && isAuthEnabled(env)) {
    const ok = await checkSession(request, env);
    if (!ok) {
      return new Response(loginPageHtml(env), {
        status: 401,
        headers: { "content-type": "text/html; charset=utf-8", ...privateHeaders },
      });
    }
  }

  const assetPath = safeAssetPath(project);
  if (!assetPath) return notFound(privateHeaders);

  const isDirectory = assetPath.endsWith("/");
  const target = isDirectory
    ? assetPath + (subpath || project.entry || "index.html")
    : assetPath;

  const assetResponse = await env.ASSETS.fetch(
    new Request(new URL("/" + target, request.url), request),
  );
  if (!assetResponse.ok) return notFound(privateHeaders);

  let response = withCache(assetResponse, Boolean(project.public));
  const type = response.headers.get("content-type") || "";
  if (isDirectory && !subpath && type.includes("text/html")) {
    response = new HTMLRewriter()
      .on("head", {
        element(head) {
          head.prepend(`<base href="/p/${slug}/">`, { html: true });
        },
      })
      .transform(response);
  }
  return response;
}
