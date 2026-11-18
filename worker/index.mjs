/**
 * ultra-content — Cloudflare Worker na frente do R2 + API gateway (u-api).
 *
 * Estaticos: ad frame, envelope de UI, catalogo verificado, APK e assets.
 * /api/*  : delegate para worker/api.mjs (estilo Stremio, proxy para a VPS).
 *
 * Nunca serve conteudo de video/torrent — isso fica no dispositivo do usuario.
 */

import { handleApi } from "./api.mjs";

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}

function cacheControl(path) {
  if (path.startsWith("/assets/")) return "public, max-age=31536000, immutable";
  if (path.startsWith("/apk/")) return "no-cache";
  if (path.startsWith("/updates/")) return "no-cache";
  if (path.endsWith("envelope.json")) return "public, max-age=300";
  if (path.includes("catalog")) return "public, max-age=600";
  return "public, max-age=3600";
}

function contentType(path) {
  if (path.endsWith(".html")) return "text/html; charset=utf-8";
  if (path.endsWith(".json")) return "application/json; charset=utf-8";
  if (path.endsWith(".png")) return "image/png";
  if (path.endsWith(".webp")) return "image/webp";
  if (path.endsWith(".apk")) return "application/vnd.android.package-archive";
  if (path.endsWith(".js")) return "text/javascript; charset=utf-8";
  if (path.endsWith(".css")) return "text/css; charset=utf-8";
  return "application/octet-stream";
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
          "Access-Control-Allow-Headers": "*",
        },
      });
    }

    const url = new URL(request.url);

    const apiResponse = await handleApi(request, env);
    if (apiResponse) return apiResponse;

    if (request.method !== "GET") return json({ error: "method not allowed" }, 405);

    const key = decodeURIComponent(url.pathname.slice(1)) || "index.html";
    const object = await env.ASSETS.get(key);
    if (!object) return json({ error: "not found" }, 404);

    const headers = {
      "Access-Control-Allow-Origin": "*",
      "Content-Type": object.httpMetadata?.contentType ?? contentType(key),
      "Cache-Control": cacheControl(url.pathname),
    };
    if (key.startsWith("apk/")) {
      headers["Content-Disposition"] = `attachment; filename="${key.split("/").pop()}"`;
    }

    return new Response(object.body, { headers });
  },
};
