/**
 * u-api — Node HTTP server para a VPS (Ubuntu + OpenLiteSpeed reverse proxy).
 * Contrato identico ao worker/api.mjs (Stremio-compatible).
 * Sem dependencias externas: usa apenas Node 22+ (fetch global).
 */
import http from "node:http";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(ROOT, "..", "public");
const PORT = Number(process.env.PORT ?? 3001);
const ORIGIN = (process.env.METADATA_ORIGIN ?? "https://u-api.palv.org").replace(/\/$/, "");
const TMDB_KEY = process.env.TMDB_KEY ?? "";
const CACHE_TTL = 24 * 60 * 60 * 1000;
const cache = new Map();

const IMAGE_HOSTS = new Set([
  "image.tmdb.org",
  "images.anilist.co",
  "cdn.anilist.co",
  "s4.anilist.co",
  "i.imgur.com",
  "upload.wikimedia.org",
]);

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "*",
};

const PRIVATE_PREFIXES = ["/api/auth", "/api/profile", "/api/library", "/api/sync", "/api/report"];
const PUBLIC_PREFIXES = [
  "/api/catalog/",
  "/api/meta/",
  "/api/stream/",
  "/api/subtitles/",
  "/api/search",
  "/api/epg/",
  "/api/addons/verified",
];

function json(res, data, status = 200) {
  const body = JSON.stringify(data);
  res.writeHead(status, { ...CORS, "Content-Type": "application/json; charset=utf-8", "Content-Length": Buffer.byteLength(body) });
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

async function proxyImage(url, res) {
  const target = url.searchParams.get("url");
  if (!target) return json(res, { error: { code: "MISSING_URL", message: "missing url" } }, 400);
  let parsed;
  try { parsed = new URL(target); } catch { return json(res, { error: { code: "INVALID_URL", message: "invalid url" } }, 400); }
  if (parsed.protocol !== "https:" || !IMAGE_HOSTS.has(parsed.hostname)) {
    return json(res, { error: { code: "HOST_NOT_ALLOWED", message: "host not allowed" } }, 403);
  }
  const cached = cacheGet(parsed.toString());
  if (cached) {
    res.writeHead(200, { ...CORS, "Content-Type": cached.type, "Cache-Control": "public, max-age=86400" });
    return res.end(cached.body);
  }
  const upstream = await fetch(parsed, { headers: { Accept: "image/avif,image/webp,image/*" } });
  if (!upstream.ok) return json(res, { error: { code: "UPSTREAM", message: `upstream ${upstream.status}` } }, 502);
  const body = Buffer.from(await upstream.arrayBuffer());
  const type = upstream.headers.get("content-type") ?? "image/webp";
  cacheSet(parsed.toString(), { body, type });
  res.writeHead(200, { ...CORS, "Content-Type": type, "Cache-Control": "public, max-age=86400" });
  res.end(body);
}

async function proxyMetadata(url, req, res) {
  const query = url.searchParams.get("q") ?? "";
  if (!query) return json(res, { metas: [] });
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

async function proxyGeneric(url, req, res) {
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

  try {
    if (url.pathname === "/api/ping") return json(res, { status: "ok", service: "u-api", protocol: "stremio-compatible" });
    if (url.pathname === "/api/image") return await proxyImage(url, res);
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
  }
});

server.listen(PORT, "127.0.0.1", () => console.log(`u-api listening on 127.0.0.1:${PORT}`));
