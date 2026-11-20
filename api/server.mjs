/**
 * u-api — Node HTTP server para a VPS (Ubuntu + OpenLiteSpeed reverse proxy).
 * Contrato identico ao worker/api.mjs (Stremio-compatible).
 * Sem dependencias externas: usa apenas Node 22+ (fetch/Request/Response global).
 */
import http from "node:http";
import { readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { handleAnime } from "./anime.mjs";

let handleResolve = null;
try {
  ({ handleResolve } = await import("./embed-resolver.mjs"));
} catch {
  // Modulo opcional de resolucao de embeds ainda nao disponibilizado.
}

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(ROOT, "..", "public");
const PORT = Number(process.env.PORT ?? 3001);
const ORIGIN = (process.env.METADATA_ORIGIN ?? "https://u-api.palv.org").replace(/\/$/, "");
const TMDB_KEY = process.env.TMDB_KEY ?? process.env.TMDB_API_KEY ?? "";
const MAL_CLIENT_ID = process.env.MAL_CLIENT_ID ?? "";
const CACHE_TTL = 24 * 60 * 60 * 1000;
const cache = new Map();
const STATS_FILE = path.join(ROOT, "stats.json");

// Proxy completo roda no fly.palv.org; a VPS apenas replica a chamada.
const FLY_ORIGIN = (process.env.FLY_ORIGIN ?? "https://fly.palv.org").replace(/\/$/, "");

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "*",
};

const PRIVATE_PREFIXES = [
  "/api/auth",
  "/api/profile",
  "/api/library",
  "/api/sync",
  "/api/report",
  "/api/resolve",
];
const PUBLIC_PREFIXES = [
  "/api/catalog/",
  "/api/meta/",
  "/api/stream/",
  "/api/subtitles/",
  "/api/search",
  "/api/epg/",
  "/api/addons/verified",
];

/** anime.mjs foi escrito para Workers; em Node basta emular caches.default. */
const memoryCache = new Map();
globalThis.caches = {
  default: {
    async match(request) {
      const hit = memoryCache.get(request.url);
      if (!hit || hit.expires < Date.now()) {
        memoryCache.delete(request.url);
        return null;
      }
      return hit.response.clone();
    },
    async put(request, response) {
      const control = response.headers.get("cache-control") ?? "";
      const match = control.match(/max-age=(\d+)/);
      const ttl = match ? Number(match[1]) * 1000 : 60_000;
      memoryCache.set(request.url, { expires: Date.now() + ttl, response: response.clone() });
      if (memoryCache.size > 1000) memoryCache.delete(memoryCache.keys().next().value);
    },
  },
};

/** Contadores persistidos em disco, com flush periodico. */
let stats = {
  total: 0,
  hours: {},
  byPath: {},
  latencyAll: { count: 0, sum: 0, min: Number.MAX_SAFE_INTEGER, max: 0 },
  samples: [],
};
try {
  stats = { ...stats, ...JSON.parse(await readFile(STATS_FILE, "utf8")) };
} catch {
  // arquivo ainda nao existe
}
let statsDirty = false;
setInterval(async () => {
  if (!statsDirty) return;
  statsDirty = false;
  try {
    await writeFile(STATS_FILE, JSON.stringify(stats));
  } catch {
    // proximo flush tenta de novo
  }
}, 3000).unref();

function recordStat(pathname, latency) {
  stats.total++;
  const hour = new Date().toISOString().slice(0, 13);
  stats.hours[hour] = (stats.hours[hour] ?? 0) + 1;
  stats.byPath[pathname] = (stats.byPath[pathname] ?? 0) + 1;
  stats.latencyAll.count++;
  stats.latencyAll.sum += latency;
  stats.latencyAll.min = Math.min(stats.latencyAll.min, latency);
  stats.latencyAll.max = Math.max(stats.latencyAll.max, latency);
  stats.samples.push(latency);
  if (stats.samples.length > 2000) stats.samples = stats.samples.slice(-2000);
  statsDirty = true;
}

function statsPayload() {
  const now = Date.now();
  let requests24h = 0;
  for (const [hour, count] of Object.entries(stats.hours)) {
    if (now - Date.parse(`${hour}:00:00Z`) < 24 * 60 * 60 * 1000) requests24h += count;
  }
  const sorted = [...stats.samples].sort((a, b) => a - b);
  const pct = (p) => (sorted.length ? sorted[Math.floor((sorted.length - 1) * p)] : 0);
  const all = stats.latencyAll;
  return {
    requests24h,
    total: stats.total,
    latency: {
      avg: all.count ? Math.round(all.sum / all.count) : 0,
      min: all.count && Number.isFinite(all.min) ? all.min : 0,
      max: all.max ?? 0,
      p50: pct(0.5),
      p95: pct(0.95),
      samples: sorted.length,
    },
    byPath: stats.byPath,
    generatedAt: now,
  };
}

function json(res, data, status = 200) {
  const body = JSON.stringify(data);
  res.writeHead(status, { ...CORS, "Content-Type": "application/json; charset=utf-8", "Content-Length": Buffer.byteLength(body) });
  res.end(body);
}

async function sendResponse(res, response) {
  const body = Buffer.from(await response.arrayBuffer());
  const headers = Object.fromEntries(response.headers.entries());
  res.writeHead(response.status, headers);
  res.end(body);
}

function cacheGet(key) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL) return hit.value;
  cache.delete(key);
  return null;
}

function cacheSet(key, value) {
  cache.set(key, { at: Date.now(), value });
  if (cache.size > 500) cache.delete(cache.keys().next().value);
}

async function proxyImage(url, req, res) {
  const target = url.searchParams.get("url");
  if (!target) return json(res, { error: { code: "MISSING_URL", message: "missing url" } }, 400);

  const fly = new URL(`${FLY_ORIGIN}/api/image`);
  for (const [key, value] of url.searchParams) fly.searchParams.set(key, value);

  const fetchHeaders = { Accept: req.headers.accept ?? "image/avif,image/webp,image/*" };
  if (req.headers["if-none-match"]) fetchHeaders["If-None-Match"] = req.headers["if-none-match"];
  const upstream = await fetch(fly, {
    headers: fetchHeaders,
    signal: AbortSignal.timeout(60_000),
  });
  const body = Buffer.from(await upstream.arrayBuffer());

  const headers = {
    ...CORS,
    "Content-Type": upstream.headers.get("content-type") ?? "application/json; charset=utf-8",
  };
  for (const name of ["cache-control", "etag", "x-cache", "x-image-format", "x-image-dimensions", "vary", "content-disposition"]) {
    const value = upstream.headers.get(name);
    if (value) headers[name] = value;
  }

  res.writeHead(upstream.status, headers);
  res.end(body);
}

async function proxyMetadata(url, req, res) {
  const query = url.searchParams.get("q") ?? "";
  if (!query || (!TMDB_KEY && !hasMetadataBackend())) return json(res, { metas: [] });
  const upstream = TMDB_KEY
    ? `https://api.themoviedb.org/3/search/multi?api_key=${encodeURIComponent(TMDB_KEY)}&query=${encodeURIComponent(query)}`
    : `${ORIGIN}/search?q=${encodeURIComponent(query)}`;
  const cached = cacheGet(upstream);
  if (cached) return json(res, cached);
  const response = await fetch(upstream, { headers: { Accept: "application/json" } });
  if (!response.ok) return json(res, { error: { code: "UPSTREAM", message: `upstream ${response.status}` } }, 502);
  const data = await response.json();
  cacheSet(upstream, data);
  json(res, data);
}

/** Evita o loop antigo: METADATA_ORIGIN apontando para o proprio u-api. */
function hasMetadataBackend() {
  if (!process.env.METADATA_ORIGIN) return false;
  let host;
  try {
    host = new URL(ORIGIN).hostname.toLowerCase();
  } catch {
    return false;
  }
  return !["u-api.palv.org", "localhost", "127.0.0.1"].includes(host);
}

async function proxyGeneric(url, req, res) {
  if (!hasMetadataBackend()) {
    return json(res, {
      error: {
        code: "NOT_IMPLEMENTED",
        message: "metadata backend not configured (set METADATA_ORIGIN)",
      },
    }, 501);
  }
  const target = `${ORIGIN}${url.pathname}${url.search}`;
  const headers = { Accept: "application/json" };
  const auth = req.headers.authorization;
  if (auth) headers.Authorization = auth;
  const response = await fetch(target, { method: req.method, headers });
  const body = Buffer.from(await response.arrayBuffer());
  const isPublic = PUBLIC_PREFIXES.some((prefix) => url.pathname.startsWith(prefix));
  res.writeHead(response.status, {
    ...CORS,
    "Content-Type": response.headers.get("content-type") ?? "application/json; charset=utf-8",
    "Cache-Control": isPublic ? "public, max-age=86400" : "private, no-store",
  });
  res.end(body);
}

async function serveStatic(url, res) {
  const rel = decodeURIComponent(url.pathname).replace(/^\/+/, "") || "index.html";
  const file = path.join(PUBLIC, rel);
  if (!file.startsWith(PUBLIC)) return json(res, { error: "forbidden" }, 403);
  try {
    const info = await stat(file);
    if (!info.isFile()) throw new Error("not a file");
    const body = await readFile(file);
    const ext = path.extname(file).toLowerCase();
    const types = {
      ".html": "text/html; charset=utf-8", ".json": "application/json; charset=utf-8",
      ".png": "image/png", ".webp": "image/webp", ".js": "text/javascript; charset=utf-8",
      ".css": "text/css; charset=utf-8", ".apk": "application/vnd.android.package-archive",
    };
    res.writeHead(200, { ...CORS, "Content-Type": types[ext] ?? "application/octet-stream", "Cache-Control": rel.startsWith("apk/") ? "no-cache" : "public, max-age=3600" });
    res.end(body);
  } catch {
    json(res, { error: "not found" }, 404);
  }
}

const server = http.createServer(async (req, res) => {
  if (req.method === "OPTIONS") { res.writeHead(204, CORS); return res.end(); }
  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
  const started = Date.now();

  try {
    if (url.pathname === "/api/ping") return json(res, { status: "ok", service: "u-api", protocol: "stremio-compatible" });
    if (url.pathname === "/api/stats") return json(res, statsPayload());

    if (handleResolve) {
      const resolveResponse = await handleResolve(req);
      if (resolveResponse) return await sendResponse(res, resolveResponse);
    }

    const animeRequest = new Request(`http://127.0.0.1${req.url}`);
    const animeResponse = await handleAnime(animeRequest, {
      TMDB_API_KEY: TMDB_KEY,
      MAL_CLIENT_ID,
    });
    if (animeResponse) return await sendResponse(res, animeResponse);

    if (url.pathname === "/api/image") return await proxyImage(url, req, res);
    if (url.pathname === "/api/metadata/search") return await proxyMetadata(url, req, res);
    if (url.pathname.startsWith("/api/")) {
      if (PRIVATE_PREFIXES.some((prefix) => url.pathname.startsWith(prefix)) && !req.headers.authorization) {
        return json(res, { error: { code: "UNAUTHORIZED", message: "Bearer token required" } }, 401);
      }
      return await proxyGeneric(url, req, res);
    }
    return await serveStatic(url, res);
  } catch (error) {
    json(res, { error: { code: "INTERNAL", message: String(error) } }, 500);
  } finally {
    if (url.pathname.startsWith("/api/") && url.pathname !== "/api/stats") {
      recordStat(url.pathname, Date.now() - started);
    }
  }
});

server.listen(PORT, "127.0.0.1", () => console.log(`u-api listening on 127.0.0.1:${PORT}`));
