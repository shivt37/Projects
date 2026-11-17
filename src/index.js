import { handleApi } from "./api.js";
import {
  checkSession,
  handleLogin,
  handleLogout,
  isAuthEnabled,
  loginPageHtml,
  noStore,
} from "./auth.js";

const HTML_HEADERS = noStore({ "content-type": "text/html; charset=utf-8" });

function loginResponse(env, error = "") {
  return new Response(loginPageHtml(env, error), { status: 401, headers: HTML_HEADERS });
}

async function noStoreAsset(response) {
  const headers = new Headers(response.headers);
  headers.set("Cache-Control", "private, no-store");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function assetFetch(request, env, path) {
  return env.ASSETS.fetch(new Request(new URL(path, request.url), request));
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204 });
    }

    if (url.pathname === "/login") {
      if (request.method === "GET") {
        return new Response(loginPageHtml(env, url.searchParams.get("error") || ""), {
          headers: noStore({ "content-type": "text/html; charset=utf-8" }),
        });
      }
      if (request.method === "POST") {
        return handleLogin(request, env);
      }
      return new Response("Method not allowed", { status: 405 });
    }

    if (url.pathname === "/logout") {
      return handleLogout(request);
    }

    if (isAuthEnabled(env)) {
      const ok = await checkSession(request, env);
      if (!ok) {
        if (url.pathname.startsWith("/api/")) {
          return new Response(JSON.stringify({ error: "Sign in required" }), {
            status: 401,
            headers: noStore({ "content-type": "application/json; charset=utf-8" }),
          });
        }
        return loginResponse(env);
      }
    }

    if (url.pathname.startsWith("/api/")) {
      return handleApi(request, env, url);
    }

    if (url.pathname === "/") {
      return noStoreAsset(await assetFetch(request, env, "/index.html"));
    }

    return noStoreAsset(await env.ASSETS.fetch(request));
  },
};
