/**
 * u-api.palv.org — API gateway no estilo Stremio.
 *
 * Contrato de recursos identico ao protocolo Stremio:
 *   catalog -> { metas }   meta -> { meta }
 *   stream  -> { streams } subtitles -> { subtitles }
 *
 * O gateway e um proxy fino para a VPS (ORIGIN). Rotas publicas sao cacheadas
 * na borda; rotas de usuario nunca sao cacheadas.
 */

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "*",
};

const PUBLIC_TTL = 24 * 60 * 60;
const EPG_TTL = 60 * 60;

const IMAGE_HOSTS = new Set([
  "image.tmdb.org",
  "images.anilist.co",
  "cdn.anilist.co",
  "s4.anilist.co",
  "i.imgur.com",
  "upload.wikimedia.org",
]);

// Rotas publicas (sem usuario) -> podem ir para o cache da borda.
const PUBLIC_PATHS = [
  "/api/catalog/",
  "/api/meta/",
  "/api/stream/",
  "/api/subtitles/",
  "/api/search",
  "/api/addons/verified",
  "/api/epg/",
  "/api/image",
];

// Rotas de usuario -> nunca cachear.
const PRIVATE_PATHS = [
  "/api/auth",
  "/api/profile",
  "/api/library",
  "/api/sync",
  "/api/report",
];

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, "Content-Type": "application/json; charset=utf-8" },
  });
}

function isPublic(path) {
  return PUBLIC_PATHS.some((prefix) => path.startsWith(prefix));
}

function isPrivate(path) {
  return PRIVATE_PATHS.some((prefix) => path.startsWith(prefix));
}

function ttlFor(path) {
  if (path.startsWith("/api/epg/")) return EPG_TTL;
  return PUBLIC_TTL;
}

/** Encaminha para a VPS sem nunca aceitar URL arbitraria (anti-SSRF). */
async function forward(request, env, path) {
  const origin = (env.METADATA_ORIGIN ?? "https://u-api.palv.org").replace(/\/$/, "");
  const upstream = new URL(`${origin}${path}`);

  const headers = { Accept: "application/json" };
  const auth = request.headers.get("Authorization");
  if (auth) headers.Authorization = auth;

  const response = await fetch(upstream.toString(), {
    method: request.method,
    headers,
    body: request.method === "POST" ? await request.text() : undefined,
  });

  const body = await response.arrayBuffer();
  const responseHeaders = {
    ...CORS,
    "Content-Type": response.headers.get("content-type") ?? "application/json; charset=utf-8",
  };

  if (isPublic(path)) {
    responseHeaders["Cache-Control"] = `public, max-age=${ttlFor(path)}`;
  } else {
    responseHeaders["Cache-Control"] = "private, no-store";
  }

  return new Response(body, { status: response.status, headers: responseHeaders });
}

async function proxyImage(request) {
  const target = new URL(request.url).searchParams.get("url");
  if (!target) return json({ error: { code: "MISSING_URL", message: "missing url" } }, 400);

  let parsed;
  try {
    parsed = new URL(target);
  } catch {
    return json({ error: { code: "INVALID_URL", message: "invalid url" } }, 400);
  }

  if (parsed.protocol !== "https:" || !IMAGE_HOSTS.has(parsed.hostname)) {
    return json({ error: { code: "HOST_NOT_ALLOWED", message: "host not allowed" } }, 403);
  }

  const cacheKey = new Request(request.url, request);
  const cached = await caches.default.match(cacheKey);
  if (cached) return cached;

  const upstream = await fetch(parsed.toString(), {
    headers: { Accept: "image/avif,image/webp,image/*" },
  });
  if (!upstream.ok) return json({ error: { code: "UPSTREAM", message: `upstream ${upstream.status}` } }, 502);

  const response = new Response(upstream.body, {
    headers: {
      ...CORS,
      "Content-Type": upstream.headers.get("content-type") ?? "image/webp",
      "Cache-Control": `public, max-age=${PUBLIC_TTL}`,
    },
  });
  await caches.default.put(cacheKey, response.clone());
  return response;
}

async function proxyMetadata(request, env) {
  const query = new URL(request.url).searchParams.get("q") ?? "";
  if (!query) return json({ metas: [] });

  const path = `/api/search?q=${encodeURIComponent(query)}`;
  const cacheKey = new Request(new URL(request.url).origin + path, request);
  const cached = await caches.default.match(cacheKey);
  if (cached) return cached;

  const response = await forward(request, env, path);
  if (response.ok) await caches.default.put(cacheKey, response.clone());
  return response;
}

/**
 * Retorna uma Response para rotas /api/*, ou null se a rota nao eh da API.
 */
export async function handleApi(request, env) {
  const url = new URL(request.url);
  const path = url.pathname;

  if (!path.startsWith("/api/")) return null;

  if (path === "/api/ping") {
    return json({ status: "ok", service: "u-api", protocol: "stremio-compatible" });
  }

  if (path === "/api/image") return proxyImage(request);
  if (path === "/api/metadata/search") return proxyMetadata(request, env);

  if (isPrivate(path) && !request.headers.get("Authorization")) {
    return json({ error: { code: "UNAUTHORIZED", message: "Bearer token required" } }, 401);
  }

  return forward(request, env, path + url.search);
}
