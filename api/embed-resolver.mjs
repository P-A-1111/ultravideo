/**
 * Resolvedor de embeds com fila priorizada, cache e autenticação por host.
 *
 * Contrato:
 *   GET /api/resolve?type=movie&tmdb=315162&provider=multiembed
 *   GET /api/resolve/status?id=<jobId>
 *
 * - O provider pedido em `provider` entra na fila com prioridade 10;
 *   os demais entram logo depois, na mesma leva, com prioridade 1 quando é refresh.
 * - Provider que não devolve mídia não aparece no JSON.
 * - Cache HIT responde na hora; MISS devolve 202 com jobId (ou 200 se `wait=1`).
 */
import crypto from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { getProvider, providerIds, providers } from "./providers/index.mjs";

const CACHE_TTL = Number(process.env.RESOLVER_TTL_MS ?? 45 * 60 * 1000);
const STALE_TTL = Number(process.env.RESOLVER_STALE_MS ?? 6 * 60 * 60 * 1000);
const NEGATIVE_TTL = Number(process.env.RESOLVER_NEGATIVE_MS ?? 60 * 1000);
const JOB_TIMEOUT = Number(process.env.RESOLVER_JOB_TIMEOUT_MS ?? 75 * 1000);
const PROVIDER_TIMEOUT = Number(process.env.RESOLVER_PROVIDER_TIMEOUT_MS ?? 35 * 1000);
const MAX_WORKERS = Math.max(1, Number(process.env.RESOLVER_WORKERS ?? 2));
const MAX_WAIT = Number(process.env.RESOLVER_MAX_WAIT_MS ?? 10 * 1000);
const STATS_FILE = process.env.RESOLVER_STATS_FILE ?? "";
const FALLBACK_MS = Number(process.env.RESOLVER_FALLBACK_MS ?? 18_000);
const SAMPLE_LIMIT = 60;

const cache = new Map();
const queue = [];
const jobs = new Map();
const waiters = new Map();
const activeByMedia = new Map();
let activeWorkers = 0;

/** Histórico de latência/taxa de sucesso por provider, usado para estimar ETA. */
const stats = {
  startedAt: Date.now(),
  providers: Object.fromEntries(providerIds.map((id) => [id, { samples: [], ok: 0, fail: 0 }])),
  queue: { samples: [] },
  jobs: 0,
};

if (STATS_FILE) {
  try {
    const saved = JSON.parse(await readFile(STATS_FILE, "utf8"));
    for (const id of providerIds) {
      const prev = saved.providers?.[id];
      if (!prev) continue;
      stats.providers[id].samples = Array.isArray(prev.samples) ? prev.samples.slice(-SAMPLE_LIMIT) : [];
      stats.providers[id].ok = Number(prev.ok) || 0;
      stats.providers[id].fail = Number(prev.fail) || 0;
    }
    stats.queue.samples = Array.isArray(saved.queue?.samples) ? saved.queue.samples.slice(-SAMPLE_LIMIT) : [];
    stats.jobs = Number(saved.jobs) || 0;
    stats.startedAt = Number(saved.startedAt) || stats.startedAt;
  } catch {
    // arquivo ainda não existe
  }
}

let statsDirty = false;
if (STATS_FILE) {
  setInterval(async () => {
    if (!statsDirty) return;
    statsDirty = false;
    try {
      await writeFile(STATS_FILE, JSON.stringify(stats));
    } catch {
      // tenta no próximo ciclo
    }
  }, 5000).unref?.();
}

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "*",
  "Access-Control-Expose-Headers": "X-Cache, X-Resolver-Job, X-Resolver-Eta-Ms",
};

function json(data, status = 200, extra = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, "Content-Type": "application/json; charset=utf-8", ...extra },
  });
}

function fail(code, message, status = 400) {
  return json({ ok: false, error: { code, message } }, status);
}

function cacheKey(providerId, params) {
  const media = [params.type, params.videoId ?? params.tmdbId ?? params.imdbId ?? params.anilistId, params.season, params.episode].join(":");
  return `${providerId}|${media}`;
}

function mediaKey(params) {
  return [params.type, params.videoId ?? params.tmdbId ?? params.imdbId ?? params.anilistId, params.season, params.episode].join(":");
}

function cacheGet(key) {
  const entry = cache.get(key);
  if (!entry) return { hit: false, stale: false, value: null };
  const age = Date.now() - entry.at;
  if (age <= entry.ttl) return { hit: true, stale: false, value: entry.value };
  if (age <= entry.ttl + STALE_TTL) return { hit: false, stale: true, value: entry.value };
  cache.delete(key);
  return { hit: false, stale: false, value: null };
}

function cacheSet(key, value, ttl = CACHE_TTL) {
  cache.set(key, { at: Date.now(), value, ttl });
  if (cache.size > 2000) cache.delete(cache.keys().next().value);
}

function percentile(values, p) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return Math.round(sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * p))]);
}

function summarizeProvider(id) {
  const entry = stats.providers[id] ?? { samples: [], ok: 0, fail: 0 };
  const attempts = entry.ok + entry.fail;
  return {
    id,
    samples: entry.samples.length,
    avgMs: entry.samples.length
      ? Math.round(entry.samples.reduce((a, b) => a + b, 0) / entry.samples.length)
      : null,
    p50Ms: percentile(entry.samples, 0.5),
    p95Ms: percentile(entry.samples, 0.95),
    successRate: attempts ? Number((entry.ok / attempts).toFixed(2)) : null,
    ok: entry.ok,
    fail: entry.fail,
  };
}

function recordProvider(id, ms, ok) {
  const entry = stats.providers[id] ?? (stats.providers[id] = { samples: [], ok: 0, fail: 0 });
  entry.samples.push(Math.round(ms));
  if (entry.samples.length > SAMPLE_LIMIT) entry.samples.shift();
  if (ok) entry.ok++;
  else entry.fail++;
  statsDirty = true;
}

function recordQueueWait(ms) {
  stats.queue.samples.push(Math.round(ms));
  if (stats.queue.samples.length > SAMPLE_LIMIT) stats.queue.samples.shift();
  statsDirty = true;
}

/** Estimativa baseada em histórico real; `confidence` cresce com o número de amostras. */
function estimate(selected, ownJobActive = false) {
  const per = selected.map((provider) => summarizeProvider(provider.id));
  const known = per.filter((item) => item.avgMs != null);
  const samples = known.reduce((sum, item) => sum + item.samples, 0);

  const resolveMs = known.length
    ? known.reduce((sum, item) => sum + item.avgMs, 0)
    : FALLBACK_MS * selected.length;
  const jobCost = selected.length ? resolveMs / selected.length : FALLBACK_MS;
  const ahead = Math.max(0, queue.length + activeWorkers - (ownJobActive ? 1 : 0));
  const queueWaitMs = Math.round((ahead / MAX_WORKERS) * jobCost);
  const estimatedMs = Math.round(queueWaitMs + resolveMs);

  return {
    estimatedMs,
    queueWaitMs,
    resolveMs: Math.round(resolveMs),
    confidence: samples >= 20 ? "high" : samples >= 5 ? "medium" : "low",
    samples,
    providers: per,
  };
}

function enqueue(job) {
  queue.push(job);
  queue.sort((a, b) => b.priority - a.priority || a.enqueuedAt - b.enqueuedAt);
  pump();
}

function pump() {
  while (activeWorkers < MAX_WORKERS && queue.length) {
    const job = queue.shift();
    activeWorkers++;
    recordQueueWait(Date.now() - job.enqueuedAt);
    runJob(job)
      .catch(() => {
        job.state = "error";
      })
      .finally(() => {
        activeWorkers--;
        activeByMedia.delete(job.mediaKey);
        const listeners = waiters.get(job.id) ?? [];
        waiters.delete(job.id);
        for (const resolve of listeners) resolve(job);
        pump();
      });
  }
}

function withTimeout(promise, ms, label) {
  let timer;
  const guard = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timeout`)), ms);
  });
  return Promise.race([promise, guard]).finally(() => clearTimeout(timer));
}

async function runJob(job) {
  job.state = "running";
  job.startedAt = Date.now();

  for (const provider of job.providers) {
    const key = cacheKey(provider.id, job.params);
    const started = Date.now();
    try {
      const value = await withTimeout(
        Promise.resolve(provider.resolve(job.params, process.env)),
        PROVIDER_TIMEOUT,
        provider.id,
      );
      cacheSet(key, value, value ? CACHE_TTL : NEGATIVE_TTL);
      recordProvider(provider.id, Date.now() - started, Boolean(value));
    } catch {
      cacheSet(key, null, NEGATIVE_TTL);
      recordProvider(provider.id, Date.now() - started, false);
    }
  }

  stats.jobs++;
  statsDirty = true;
  job.state = "done";
  job.finishedAt = Date.now();
}

function decorate(value, providerId, cacheState) {
  const summary = summarizeProvider(providerId);
  return {
    ...value,
    cache: cacheState,
    avgMs: summary.avgMs,
    successRate: summary.successRate,
  };
}

function collect(params, selected) {
  const list = [];
  for (const provider of selected) {
    const entry = cacheGet(cacheKey(provider.id, params));
    if (entry.hit && entry.value) list.push(decorate(entry.value, provider.id, "HIT"));
    else if (entry.stale && entry.value) list.push(decorate(entry.value, provider.id, "STALE"));
  }
  return list;
}

function startBatch(params, selected, priority) {
  const key = mediaKey(params);
  const existingId = activeByMedia.get(key);
  if (existingId && jobs.get(existingId)?.state !== "done") {
    return jobs.get(existingId);
  }

  const ordered = [...selected].sort((a, b) => {
    if (a.id === params.provider) return -1;
    if (b.id === params.provider) return 1;
    return 0;
  });

  const job = {
    id: crypto.randomUUID(),
    state: "queued",
    priority,
    mediaKey: key,
    params,
    providers: ordered,
    enqueuedAt: Date.now(),
  };
  jobs.set(job.id, job);
  activeByMedia.set(key, job.id);
  enqueue(job);
  return job;
}

function waitForJob(job, ms) {
  if (job.state === "done" || job.state === "error") return Promise.resolve(job);
  return new Promise((resolve) => {
    const list = waiters.get(job.id) ?? [];
    list.push(resolve);
    waiters.set(job.id, list);
    setTimeout(() => {
      const current = waiters.get(job.id) ?? [];
      const next = current.filter((fn) => fn !== resolve);
      if (next.length) waiters.set(job.id, next);
      else waiters.delete(job.id);
      resolve(job);
    }, ms).unref?.();
  });
}

function timingSafeEqualHex(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"));
  } catch {
    return false;
  }
}

function authenticate(req, url) {
  const secret = process.env.RESOLVER_SECRET;
  if (!secret) {
    const ip = req.socket?.remoteAddress ?? "";
    if (/^(::1|127\.|::ffff:127\.)/.test(ip)) return { ok: true, host: "localhost" };
    return { ok: false, code: "AUTH_REQUIRED", status: 503, message: "RESOLVER_SECRET não configurado" };
  }

  const host = req.headers["x-resolver-host"];
  const signature = req.headers["x-resolver-signature"];
  if (!host || !signature) {
    return { ok: false, code: "UNAUTHORIZED", status: 401, message: "X-Resolver-Host e X-Resolver-Signature são obrigatórios" };
  }

  const allowed = (process.env.RESOLVER_ALLOWED_HOSTS ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  if (allowed.length && !allowed.includes(host)) {
    return { ok: false, code: "HOST_NOT_ALLOWED", status: 403, message: "host not allowed" };
  }

  const canonical = `${req.method}\n${url.pathname}\n${url.searchParams.toString()}\n${host}`;
  const expected = crypto.createHmac("sha256", secret).update(canonical).digest("hex");
  if (!timingSafeEqualHex(signature, expected)) {
    return { ok: false, code: "INVALID_SIGNATURE", status: 403, message: "invalid signature" };
  }
  return { ok: true, host };
}

function parseParams(url) {
  const type = url.searchParams.get("type") ?? (url.searchParams.get("episode") ? "tv" : "movie");
  const params = {
    type: ["movie", "tv", "anime"].includes(type) ? type : "movie",
    videoId: url.searchParams.get("video_id"),
    tmdbId: url.searchParams.get("tmdb") ?? url.searchParams.get("tmdb_id") ?? url.searchParams.get("id"),
    imdbId: url.searchParams.get("imdb") ?? url.searchParams.get("imdb_id"),
    anilistId: url.searchParams.get("anilist") ?? url.searchParams.get("anilist_id"),
    season: Number(url.searchParams.get("season") ?? 1),
    episode: Number(url.searchParams.get("episode") ?? 1),
    provider: url.searchParams.get("provider"),
  };
  if (![params.videoId, params.tmdbId, params.imdbId, params.anilistId].some(Boolean)) return null;
  if (params.provider && !getProvider(params.provider)) return null;
  return params;
}

/**
 * Retorna uma Response quando a rota é do resolvedor; null otherwise.
 */
export async function handleResolve(req) {
  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
  if (!url.pathname.startsWith("/api/resolve")) return null;
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS });
  }
  if (req.method !== "GET") return fail("METHOD_NOT_ALLOWED", "use GET", 405);

  const auth = authenticate(req, url);
  if (!auth.ok) return fail(auth.code, auth.message, auth.status);

  if (url.pathname === "/api/resolve/providers") {
    return json({ ok: true, providers: providerIds });
  }

  if (url.pathname === "/api/resolve/stats") {
    return json({
      ok: true,
      uptimeSeconds: Math.round((Date.now() - stats.startedAt) / 1000),
      jobs: stats.jobs,
      queue: {
        pending: queue.length,
        active: activeWorkers,
        avgWaitMs: stats.queue.samples.length
          ? Math.round(stats.queue.samples.reduce((a, b) => a + b, 0) / stats.queue.samples.length)
          : null,
        samples: stats.queue.samples.length,
      },
      cache: { entries: cache.size, ttlMs: CACHE_TTL, staleMs: STALE_TTL },
      providers: providerIds.map(summarizeProvider),
      etaSemFiltro: estimate(providers),
    });
  }

  if (url.pathname === "/api/resolve/status") {
    const job = jobs.get(url.searchParams.get("id") ?? "");
    if (!job) return fail("JOB_NOT_FOUND", "job not found", 404);
    return json({
      ok: true,
      job: job.id,
      status: job.state,
      queuedAt: job.enqueuedAt,
      startedAt: job.startedAt ?? null,
      finishedAt: job.finishedAt ?? null,
      providers: collect(job.params, job.providers),
    });
  }

  if (url.pathname !== "/api/resolve") return fail("NOT_FOUND", "unknown resolve route", 404);

  const params = parseParams(url);
  if (!params) return fail("INVALID_PARAMS", "informe um id e, se usado, um provider válido", 400);

  const selected = params.provider ? [getProvider(params.provider)] : providers;
  const fresh = collect(params, selected).filter((item) => item.cache === "HIT");
  const wantsRefresh = url.searchParams.get("refresh") === "1";
  const allFresh = fresh.length === selected.length && !wantsRefresh;

  let job = null;
  let cacheState = "HIT";
  if (!allFresh) {
    const missing = selected.filter((provider) => !cacheGet(cacheKey(provider.id, params)).hit || wantsRefresh);
    cacheState = fresh.length ? "STALE" : "MISS";
    job = startBatch(params, missing.length ? missing : selected, cacheState === "STALE" ? 1 : 10);
  }

  const wait = url.searchParams.get("wait") === "1";
  if (wait && job) await waitForJob(job, Math.min(MAX_WAIT, JOB_TIMEOUT));

  const list = collect(params, selected);
  const eta = allFresh
    ? { estimatedMs: 0, queueWaitMs: 0, resolveMs: 0, confidence: "exact", samples: 0, providers: [] }
    : estimate(selected, Boolean(job));

  const body = {
    ok: true,
    status: job?.state ?? "done",
    cache: cacheState,
    job: job?.id ?? null,
    retryAfterMs: job && job.state !== "done" ? 1500 : 0,
    eta,
    meta: { attempted: selected.length, resolved: list.length },
    providers: list,
  };
  return json(body, job && job.state !== "done" && !wait ? 202 : 200, {
    "X-Cache": cacheState,
    "X-Resolver-Eta-Ms": String(eta.estimatedMs),
    ...(job ? { "X-Resolver-Job": job.id } : {}),
  });
}
