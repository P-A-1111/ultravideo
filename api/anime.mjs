/**
 * Providers de anime do u-api.palv.org (rodando na VPS).
 *
 * Jikan, Shikimori, TMDB, AniList, Kitsu e MAL sao fundidos em um unico meta.
 * Zenshin completa com IDs cruzados e episodios. /bundle devolve tudo em uma
 * resposta so: meta fundido + relacionados + personagens + onde assistir.
 */

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "*",
};

const UA = "ultra-video/0.1 (+https://palv.org; u-api.palv.org)";
const JIKAN = "https://api.jikan.moe/v4";
const TENRAI = "https://api.tenrai.org/v1";
const SHIKIMORI = "https://shikimori.one/api";
const TMDB = "https://api.themoviedb.org/3";
const TMDB_IMG = "https://image.tmdb.org/t/p";
const ANILIST = "https://graphql.anilist.co";
const KITSU = "https://kitsu.app/api/edge";
const KITSU_HEADERS = { Accept: "application/vnd.api+json" };
const MAL = "https://api.myanimelist.net/v2";
const ZENSHIN_BASES = [
  "https://zenshin-supabase-api.onrender.com",
  "https://zenshin-supabase-api-myig.onrender.com",
];
const FILLERLISTS = "https://fillerlists.com/data";
const FILLER_CREDIT =
  "Anime filler data from FillerLists (https://fillerlists.com/data) under CC BY-SA 4.0";

const PROVIDER_NAMES = ["jikan", "tenrai", "shikimori", "tmdb", "anilist", "kitsu", "mal"];

const TTL_SEARCH = 60 * 60;
const TTL_META = 6 * 60 * 60;
const TTL_MAPPINGS = 24 * 60 * 60;

const MAL_FIELDS = [
  "id", "title", "main_picture", "alternative_titles", "synopsis", "mean", "rank",
  "genres", "start_date", "num_episodes", "status", "media_type", "studio",
  "streaming_links", "related_anime",
].join(",");

const ANILIST_FIELDS = `
  id idMal title { romaji english native } synonyms description
  coverImage { extraLarge large } bannerImage
  averageScore genres episodes duration season seasonYear format countryOfOrigin
  trailer { id site }
  externalLinks { site url }
  relations { edges { relationType node { id idMal title { romaji english } format } } }
  characters(sort: [ROLE, RELEVANCE], perPage: 5) { edges { role node { name { full } } } }
  streamingEpisodes { title thumbnail url site }
`;

const TMDB_GENRES = {
  16: "Animação", 10762: "Kids", 12: "Aventura", 14: "Fantasia", 18: "Drama",
  35: "Comédia", 28: "Ação", 10751: "Família", 9648: "Mistério",
  10765: "Ficção científica", 10759: "Ação e Aventura", 10763: "Notícias",
  10764: "Reality", 10766: "Soap", 10767: "Talk Show", 10768: "Guerra e Política",
  10756: "Minissérie", 10757: "Telefilme",
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, "Content-Type": "application/json; charset=utf-8" },
  });
}

function fail(code, message, status = 502) {
  return json({ error: { code, message } }, status);
}

async function request(url, options, timeout = 12000) {
  let res = await fetch(url, { ...options, signal: AbortSignal.timeout(timeout) });
  if (res.status === 429) {
    await new Promise((resolve) => setTimeout(resolve, 1200));
    res = await fetch(url, { ...options, signal: AbortSignal.timeout(timeout) });
  }
  if (!res.ok) throw new Error(`upstream ${res.status}`);
  return res.json();
}

function getJson(url, headers = {}, timeout = 12000) {
  return request(url, { headers: { "User-Agent": UA, Accept: "application/json", ...headers } }, timeout);
}

function postJson(url, body, headers = {}, timeout = 12000) {
  return request(
    url,
    {
      method: "POST",
      headers: { "User-Agent": UA, "Content-Type": "application/json", Accept: "application/json", ...headers },
      body: JSON.stringify(body),
    },
    timeout,
  );
}

async function tryFetch(fn) {
  try {
    return await fn();
  } catch {
    return null;
  }
}

/** Indice estatico do FillerLists (13 shows, sem limite de requisicoes). */
let fillerIndexCache = null;
let fillerIndexAt = 0;

async function fillerIndex() {
  if (fillerIndexCache && Date.now() - fillerIndexAt < TTL_MAPPINGS * 1000) return fillerIndexCache;
  const data = await getJson(`${FILLERLISTS}/shows.json`, {}, 10000);
  fillerIndexCache = data.shows ?? [];
  fillerIndexAt = Date.now();
  return fillerIndexCache;
}

function matchFillerShow(ids) {
  const shows = fillerIndexCache ?? [];
  return (
    shows.find((show) => ids.tmdb_id != null && String(show.ids?.tmdb) === String(ids.tmdb_id)) ??
    shows.find((show) => ids.tvdb_id != null && String(show.ids?.tvdb) === String(ids.tvdb_id)) ??
    shows.find((show) => ids.imdb_id != null && String(show.ids?.imdb) === String(ids.imdb_id)) ??
    null
  );
}

async function fillerDetail(show) {
  const data = await getJson(show.json, {}, 10000);
  return (data.episodes ?? []).map((ep) => ({
    id: `filler:${show.show}:${ep.n}`,
    title: ep.title,
    season: 1,
    episode: ep.n,
    released: ep.airdate,
    overview: ep.arc,
    fillerType: ep.type,
  }));
}

/** Kitsu expoe IDs cruzados em /mappings sem limite publicado. */
function kitsuCrossIds(data) {
  const ids = {};
  for (const item of data.data ?? []) {
    const site = item.attributes?.externalSite ?? "";
    const value = item.attributes?.externalId;
    if (value == null) continue;
    if (site === "anilist/anime") ids.anilist_id = Number(value) || value;
    else if (site === "myanimelist/anime") ids.mal_id = Number(value) || value;
    else if (site === "anidb/anime") ids.anidb_id = Number(value) || value;
    else if (site === "thetvdb/anime" || site === "thetvdb/series") ids.tvdb_id = Number(value) || value;
    else if (site === "imdb/anime") ids.imdb_id = value;
  }
  return ids;
}

async function kitsuCrossIdsFor(id) {
  const data = await getJson(`${KITSU}/anime/${encodeURIComponent(id)}/mappings`, KITSU_HEADERS);
  return kitsuCrossIds(data);
}

async function cached(request_, path, ttl, producer) {
  const key = new Request(new URL(path, request_.url).toString(), { method: "GET" });
  const hit = await caches.default.match(key);
  if (hit) return hit;

  const source = await producer();
  if (!source.ok) return source;

  const response = new Response(source.body, {
    status: source.status,
    headers: {
      ...CORS,
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": `public, max-age=${ttl}`,
    },
  });
  await caches.default.put(key, response.clone());
  return response;
}

function stripHtml(value) {
  if (!value) return undefined;
  return value
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function shikimoriImage(value) {
  if (!value) return undefined;
  try {
    return new URL(value, "https://shikimori.one").toString();
  } catch {
    return undefined;
  }
}

function firstId(value) {
  if (value == null) return value;
  if (Array.isArray(value)) return firstId(value[0]);
  if (typeof value === "object") return firstId(value.tv ?? value.movie ?? Object.values(value)[0]);
  return value;
}

function mappingIds(mapping) {
  const m = mapping?.mappings ?? {};
  return {
    mal_id: firstId(m.mal_id),
    shikimori_id: firstId(m.shikimori_id),
    anilist_id: firstId(m.anilist_id),
    anidb_id: firstId(m.anidb_id),
    tmdb_id: firstId(m.themoviedb_id),
    imdb_id: firstId(m.imdb_id),
    kitsu_id: firstId(m.kitsu_id),
    tvdb_id: firstId(m.tvdb_id ?? m.thetvdb_id),
  };
}

function mappingTitles(mapping) {
  const titles = {};
  for (const [lang, value] of Object.entries(mapping?.title ?? {})) {
    if (typeof value === "string" && value.trim()) titles[lang] = value;
  }
  return titles;
}

function normalizeTitle(value) {
  return (value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function jikanMeta(a) {
  const images = a.images?.webp ?? a.images?.jpg ?? {};
  return {
    id: `jikan:${a.mal_id}`,
    type: "anime",
    name: a.title_english || a.title || a.title_japanese,
    poster: images.large_image_url ?? images.image_url,
    background: a.images?.jpg?.background_image_url ?? a.background,
    description: a.synopsis,
    releaseInfo: String(a.year ?? a.aired?.from?.slice(0, 4) ?? ""),
    imdbRating: a.score != null ? String(a.score) : undefined,
    runtime: a.duration,
    genre: (a.genres ?? []).map((g) => g.name),
    director: [], writer: [], cast: [], country: a.origin_country?.[0],
    videos: [],
    extensions: { ids: { mal_id: a.mal_id }, source: "jikan", url: a.url },
  };
}

/** Tenrai usa o mesmo schema do Jikan v4, entao so troca a origem. */
function tenraiMeta(a) {
  const meta = jikanMeta(a);
  return {
    ...meta,
    id: `tenrai:${a.mal_id}`,
    extensions: {
      ...meta.extensions,
      source: "tenrai",
      ids: { ...meta.extensions.ids, tenrai_id: a.mal_id },
      trailer: a.trailer?.url,
    },
  };
}

function shikimoriMeta(a) {
  const image = a.image?.original;
  const isPlaceholder = !image || image.includes("missing_");
  return {
    id: `shikimori:${a.id}`,
    type: "anime",
    name: a.english || a.name || a.russian,
    poster: isPlaceholder ? undefined : shikimoriImage(image ?? a.image?.preview),
    description: stripHtml(a.description_html ?? a.description),
    releaseInfo: a.aired_date?.slice(0, 4),
    imdbRating: a.score != null && Number(a.score) > 0 ? String(a.score) : undefined,
    runtime: a.duration_minutes ? `${a.duration_minutes} min` : undefined,
    genre: (a.genres ?? []).map((g) => g.russian || g.name),
    director: [], writer: [], cast: [],
    videos: [],
    extensions: {
      ids: { shikimori_id: a.id, mal_id: a.mal_id, anidb_id: a.anidb_id },
      source: "shikimori",
    },
  };
}

function tmdbVideos(title) {
  const episodes = title["season/1"]?.episodes ?? [];
  return episodes.map((ep) => ({
    id: `tmdb:${title.id}:1:${ep.episode_number}`,
    title: ep.name || `Episódio ${ep.episode_number}`,
    season: 1,
    episode: ep.episode_number,
    released: ep.air_date,
    overview: ep.overview,
    thumbnail: ep.still_path ? `${TMDB_IMG}/w300${ep.still_path}` : undefined,
  }));
}

function tmdbWatchProviders(title) {
  const regions = title.watch_providers?.results ?? {};
  const region = regions.BR ?? regions.US ?? {};
  const seen = new Set();
  const out = [];
  for (const kind of ["flatrate", "free", "buy", "rent"]) {
    for (const provider of region[kind] ?? []) {
      if (!provider.provider_name || seen.has(provider.provider_name)) continue;
      seen.add(provider.provider_name);
      out.push({
        name: provider.provider_name,
        type: kind,
        logo: provider.logo_path ? `${TMDB_IMG}/w92${provider.logo_path}` : undefined,
        url: region.link,
      });
    }
  }
  if (!out.length && region.link) out.push({ name: "Ver opções", type: "link", url: region.link });
  return out;
}

function tmdbTrailer(title) {
  const video = (title.videos?.results ?? []).find(
    (v) => v.site === "YouTube" && (v.type === "Trailer" || v.type === "Teaser"),
  );
  return video ? `https://www.youtube.com/watch?v=${video.key}` : undefined;
}

function tmdbMeta(t) {
  return {
    id: `tmdb:${t.id}`,
    type: "anime",
    name: t.name,
    poster: t.poster_path ? `${TMDB_IMG}/w500${t.poster_path}` : undefined,
    background: t.backdrop_path ? `${TMDB_IMG}/w1280${t.backdrop_path}` : undefined,
    description: t.overview,
    releaseInfo: t.first_air_date?.slice(0, 4),
    imdbRating: t.vote_average ? t.vote_average.toFixed(1) : undefined,
    genre: (t.genre_ids ?? t.genres ?? [])
      .map((g) => (typeof g === "number" ? TMDB_GENRES[g] : TMDB_GENRES[g.id] ?? g.name ?? g))
      .filter((g) => typeof g === "string"),
    director: [], writer: [], cast: [],
    videos: tmdbVideos(t),
    extensions: { ids: { tmdb_id: t.id }, source: "tmdb" },
  };
}

function anilistMeta(a) {
  const titles = {};
  if (a.title?.english) titles.en = a.title.english;
  if (a.title?.native) titles.ja = a.title.native;
  if (a.title?.romaji) titles.romaji = a.title.romaji;
  (a.synonyms ?? []).forEach((value, i) => { titles[`alt${i + 1}`] = value; });

  const relations = (a.relations?.edges ?? []).map((edge) => ({
    relation: edge.relationType,
    id: edge.node?.idMal ? `jikan:${edge.node.idMal}` : edge.node?.id ? `anilist:${edge.node.id}` : undefined,
    title: edge.node?.title?.english ?? edge.node?.title?.romaji,
    format: edge.node?.format,
  })).filter((item) => item.title);

  const characters = (a.characters?.edges ?? [])
    .map((edge) => ({ name: edge.node?.name?.full, role: edge.role }))
    .filter((item) => item.name);

  const trailer = a.trailer?.site === "youtube" && a.trailer?.id
    ? `https://www.youtube.com/watch?v=${a.trailer.id}`
    : undefined;

  return {
    id: `anilist:${a.id}`,
    type: "anime",
    name: a.title?.english ?? a.title?.romaji ?? a.title?.native,
    poster: a.coverImage?.extraLarge ?? a.coverImage?.large,
    background: a.bannerImage,
    description: stripHtml(a.description),
    releaseInfo: String(a.seasonYear ?? a.startDate?.year ?? ""),
    imdbRating: a.averageScore ? (a.averageScore / 10).toFixed(1) : undefined,
    runtime: a.duration ? `${a.duration} min` : undefined,
    genre: a.genres ?? [],
    director: [],
    writer: [],
    cast: characters.map((item) => item.name),
    country: a.countryOfOrigin,
    videos: (a.streamingEpisodes ?? []).map((ep, i) => ({
      id: `anilist:${a.id}:ep:${i + 1}`,
      title: ep.title,
      season: 1,
      episode: i + 1,
      thumbnail: ep.thumbnail,
      url: ep.url,
    })),
    extensions: {
      ids: { anilist_id: a.id, mal_id: a.idMal },
      source: "anilist",
      titles,
      relations,
      characters,
      trailer,
      externalLinks: a.externalLinks ?? [],
      format: a.format,
      status: a.status,
    },
  };
}

function kitsuMeta(a, categories = new Map()) {
  const attrs = a.attributes ?? {};
  const titles = {};
  for (const [key, value] of Object.entries(attrs.titles ?? {})) {
    if (typeof value === "string" && value.trim()) titles[key] = value;
  }
  const genres = (a.relationships?.categories?.data ?? [])
    .map((item) => categories.get(item.id))
    .filter(Boolean);

  return {
    id: `kitsu:${a.id}`,
    type: "anime",
    name: titles.en ?? attrs.canonicalTitle ?? Object.values(titles)[0],
    poster: attrs.posterImage?.large ?? attrs.posterImage?.medium,
    background: attrs.coverImage?.large,
    description: attrs.synopsis,
    releaseInfo: String(attrs.startDate?.slice(0, 4) ?? ""),
    imdbRating: attrs.averageRating && Number(attrs.averageRating) > 0 ? Number(attrs.averageRating).toFixed(1) : undefined,
    runtime: null,
    genre: genres,
    director: [], writer: [], cast: [],
    videos: [],
    extensions: {
      ids: { kitsu_id: a.id },
      source: "kitsu",
      titles,
      format: attrs.subtype,
      status: attrs.status,
      episodeCount: attrs.episodeCount,
    },
  };
}

function malMeta(node) {
  const alt = node.alternative_titles ?? {};
  const titles = {};
  if (alt.en) titles.en = alt.en;
  if (alt.ja) titles.ja = alt.ja;
  (alt.synonyms ?? []).forEach((value, i) => { titles[`alt${i + 1}`] = value; });

  const relations = (node.related_anime ?? []).map((item) => ({
    relation: item.relation_type,
    id: `jikan:${item.node?.id}`,
    title: item.node?.title,
  })).filter((item) => item.title);

  return {
    id: `jikan:${node.id}`,
    type: "anime",
    name: alt.en ?? node.title,
    poster: node.main_picture?.large ?? node.main_picture?.medium,
    description: node.synopsis,
    releaseInfo: String(node.start_date?.slice(0, 4) ?? ""),
    imdbRating: node.mean ? Number(node.mean).toFixed(1) : undefined,
    runtime: null,
    genre: (node.genres ?? []).map((g) => g.name),
    director: [], writer: [],
    cast: (node.studio ?? []).map((s) => s.name),
    country: null,
    videos: [],
    extensions: {
      ids: { mal_id: node.id },
      source: "mal",
      titles,
      relations,
      rank: node.rank,
      status: node.status,
      watchProviders: (node.streaming_links ?? []).map((link) => ({ name: link.name, type: "stream", url: link.url })),
    },
  };
}

function mergeVideos(...lists) {
  const byEpisode = new Map();
  for (const list of lists) {
    for (const video of list ?? []) {
      const ep = Number(video.episode);
      if (!Number.isFinite(ep)) continue;
      const prev = byEpisode.get(ep);
      byEpisode.set(
        ep,
        prev
          ? {
              ...prev,
              title: prev.title || video.title,
              released: prev.released || video.released,
              overview: prev.overview || video.overview,
              thumbnail: video.thumbnail || prev.thumbnail,
              url: prev.url || video.url,
              fillerType: prev.fillerType || video.fillerType,
              arc: prev.arc || video.arc,
            }
          : video,
      );
    }
  }
  return [...byEpisode.values()].sort(
    (a, b) => (a.season ?? 1) - (b.season ?? 1) || a.episode - b.episode,
  );
}

function fuseMetas(metas, mapping) {
  const seen = new Set();
  const list = metas.filter((meta) => {
    if (!meta || seen.has(meta.id)) return false;
    seen.add(meta.id);
    return true;
  });
  if (!list.length) return null;

  const ids = mapping ? mappingIds(mapping) : {};
  for (const meta of list) {
    for (const [key, value] of Object.entries(meta.extensions?.ids ?? {})) {
      if (value != null && ids[key] == null) ids[key] = value;
    }
  }

  const first = (key) => list.map((m) => m[key]).find((v) => v != null && v !== "");
  const firstExt = (key) => list.map((m) => m.extensions?.[key]).find((v) => v != null && v !== "");
  const longest = (key) =>
    list.map((m) => m[key]).filter((v) => typeof v === "string" && v.trim())
      .sort((a, b) => b.length - a.length)[0];
  const union = (key) => [...new Set(list.flatMap((m) => m[key] ?? []))];
  const flat = (key) => {
    const seenItems = new Set();
    return list.flatMap((m) => m.extensions?.[key] ?? []).filter((item) => {
      const keyValue = JSON.stringify(item);
      if (seenItems.has(keyValue)) return false;
      seenItems.add(keyValue);
      return true;
    });
  };

  const titles = mappingTitles(mapping);
  for (const meta of list) Object.assign(titles, meta.extensions?.titles ?? {});
  const dates = mapping?.date ?? {};
  const year = dates.startDate?.slice(0, 4) ?? first("year") ?? first("releaseInfo");
  const canonicalId = ids.mal_id
    ? `jikan:${ids.mal_id}`
    : ids.tmdb_id
      ? `tmdb:${ids.tmdb_id}`
      : list[0].id;

  return {
    id: canonicalId,
    type: list[0].type ?? "anime",
    name: titles["pt-BR"] ?? first("name") ?? titles.en ?? list[0].name,
    poster: first("poster"),
    background: first("background"),
    description: longest("description"),
    releaseInfo: year,
    year,
    released: dates.startDate ?? first("released"),
    imdbRating: list.map((m) => m.imdbRating).find((v) => v != null && Number(v) > 0) ?? first("imdbRating"),
    runtime: first("runtime"),
    genre: union("genre"),
    director: union("director"),
    writer: union("writer"),
    cast: union("cast"),
    country: first("country"),
    videos: mergeVideos(...list.map((m) => m.videos)),
    links: union("links"),
    extensions: {
      ids,
      sources: [...new Set(list.map((m) => m.extensions?.source).filter(Boolean))],
      titles,
      relations: flat("relations"),
      characters: flat("characters"),
      watchProviders: flat("watchProviders"),
      externalLinks: flat("externalLinks"),
      trailer: firstExt("trailer"),
      format: firstExt("format"),
      status: firstExt("status"),
      filler: firstExt("filler"),
      zenshin: Boolean(mapping),
      ...(mapping?.mappings ? { mapping: mapping.mappings } : {}),
    },
  };
}

function groupMetas(metas) {
  const parent = metas.map((_, i) => i);
  const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const union = (a, b) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[rb] = ra;
  };
  const keys = new Map();

  metas.forEach((meta, i) => {
    const ids = meta.extensions?.ids ?? {};
    const candidates = [
      ids.mal_id != null ? `mal:${ids.mal_id}` : null,
      ids.tmdb_id != null ? `tmdb:${ids.tmdb_id}` : null,
      ids.anilist_id != null ? `anilist:${ids.anilist_id}` : null,
      `name:${normalizeTitle(meta.name)}`,
    ];
    for (const key of ["en", "ja", "romaji"]) {
      const value = meta.extensions?.titles?.[key];
      if (typeof value === "string" && value.trim()) candidates.push(`name:${normalizeTitle(value)}`);
    }
    const keysToUse = candidates.filter(Boolean);
    for (const key of keysToUse) {
      if (keys.has(key)) union(i, keys.get(key));
      else keys.set(key, i);
    }
  });

  const groups = new Map();
  metas.forEach((meta, i) => {
    const root = find(i);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root).push(meta);
  });
  return [...groups.values()];
}

async function jikanSearch(query, limit) {
  const data = await getJson(`${JIKAN}/anime?q=${encodeURIComponent(query)}&limit=${limit}&sfw`, {}, 6000);
  return (data.data ?? []).map(jikanMeta);
}

async function tenraiSearch(query, limit) {
  const data = await getJson(`${TENRAI}/anime?q=${encodeURIComponent(query)}&limit=${limit}&sfw`);
  return (data.data ?? []).map(tenraiMeta);
}

async function tenraiDetail(id) {
  const data = await getJson(`${TENRAI}/anime/${encodeURIComponent(id)}/full`);
  return data.data ? tenraiMeta(data.data) : null;
}

async function shikimoriSearch(query, limit) {
  const data = await getJson(`${SHIKIMORI}/animes?search=${encodeURIComponent(query)}&limit=${limit}`);
  return (Array.isArray(data) ? data : []).map(shikimoriMeta);
}

async function tmdbSearch(query, env, limit) {
  if (!env.TMDB_API_KEY) return [];
  const data = await getJson(
    `${TMDB}/search/tv?api_key=${encodeURIComponent(env.TMDB_API_KEY)}&query=${encodeURIComponent(query)}`,
  );
  return (data.results ?? [])
    .filter((t) => !t.genre_ids?.length || t.genre_ids.includes(16))
    .slice(0, limit)
    .map(tmdbMeta);
}

async function anilistSearch(query, limit) {
  const data = await postJson(ANILIST, {
    query: `query ($search: String!, $perPage: Int) { Page(page: 1, perPage: $perPage) { media(type: ANIME, search: $search, sort: POPULARITY_DESC) { ${ANILIST_FIELDS} } } }`,
    variables: { search: query, perPage: Math.min(limit, 20) },
  });
  return (data.data?.Page?.media ?? []).filter(Boolean).map(anilistMeta);
}

async function anilistDetail(id) {
  const data = await postJson(ANILIST, {
    query: `query ($id: Int) { Media(id: $id, type: ANIME) { ${ANILIST_FIELDS} } }`,
    variables: { id: Number(id) },
  });
  return data.data?.Media ? anilistMeta(data.data.Media) : null;
}

function kitsuCategories(data) {
  return new Map(
    (data.included ?? []).filter((item) => item.type === "categories")
      .map((item) => [item.id, item.attributes?.title]),
  );
}

async function kitsuSearch(query, limit) {
  const data = await getJson(
    `${KITSU}/anime?filter%5Btext%5D=${encodeURIComponent(query)}&page%5Blimit%5D=${limit}&include=categories`,
    { Accept: "application/vnd.api+json" },
  );
  const categories = kitsuCategories(data);
  return (data.data ?? []).map((item) => kitsuMeta(item, categories));
}

async function kitsuDetail(id) {
  const data = await getJson(
    `${KITSU}/anime/${encodeURIComponent(id)}?include=categories`,
    { Accept: "application/vnd.api+json" },
  );
  return data.data ? kitsuMeta(data.data, kitsuCategories(data)) : null;
}

async function malSearch(query, env, limit) {
  if (!env.MAL_CLIENT_ID) return [];
  const data = await getJson(
    `${MAL}/anime?q=${encodeURIComponent(query)}&limit=${limit}&fields=${encodeURIComponent(MAL_FIELDS)}`,
    { "X-MAL-CLIENT-ID": env.MAL_CLIENT_ID },
  );
  return (data.data ?? []).map((item) => malMeta(item.node));
}

async function malDetail(id, env) {
  if (!env.MAL_CLIENT_ID) return null;
  const data = await getJson(
    `${MAL}/anime/${encodeURIComponent(id)}?fields=${encodeURIComponent(MAL_FIELDS)}`,
    { "X-MAL-CLIENT-ID": env.MAL_CLIENT_ID },
  );
  return data?.id ? malMeta(data) : null;
}

async function providerResults(query, env, limit) {
  return Promise.allSettled([
    jikanSearch(query, limit),
    tenraiSearch(query, limit),
    shikimoriSearch(query, limit),
    tmdbSearch(query, env, limit),
    anilistSearch(query, limit),
    kitsuSearch(query, limit),
    malSearch(query, env, limit),
  ]);
}

async function providerReport(results, started, env = {}) {
  return {
    providers: results.map((result, i) => {
      const name = PROVIDER_NAMES[i];
      const ok = result.status === "fulfilled" && !(name === "mal" && !env.MAL_CLIENT_ID);
      return name === "mal" && !env.MAL_CLIENT_ID
        ? { name, ok, reason: "MAL_CLIENT_ID nao configurado" }
        : { name, ok };
    }),
    elapsedMs: Date.now() - started,
  };
}

async function fusedGroups(results, env, lookups = 8) {
  const groups = groupMetas(results.flatMap((r) => (r.status === "fulfilled" ? r.value : [])));
  const mappings = new Map();
  let done = 0;
  for (let i = 0; i < groups.length && done < lookups; i++) {
    const malId = groups[i].find((m) => m.extensions?.ids?.mal_id)?.extensions.ids.mal_id;
    if (malId == null) continue;
    const mapping = await tryFetch(() => zenshinMappings({ mal_id: malId }));
    if (mapping) {
      mappings.set(i, mapping);
      done++;
    }
  }
  await tryFetch(() => fillerIndex());
  return groups
    .map((group, i) => {
      const meta = fuseMetas(group, mappings.get(i));
      if (!meta) return null;
      const show = matchFillerShow(meta.extensions.ids);
      if (show) {
        meta.extensions.filler = {
          show: show.show,
          pct: show.fillerPct,
          counts: show.counts,
          credit: FILLER_CREDIT,
          url: show.url,
        };
        if (show.ids?.wikidata && !meta.extensions.ids.wikidata_id) {
          meta.extensions.ids.wikidata_id = show.ids.wikidata;
        }
      }
      return meta;
    })
    .filter(Boolean);
}

async function searchAll(query, env, limit = 20) {
  const started = Date.now();
  const results = await providerResults(query, env, limit);
  return {
    metas: await fusedGroups(results, env),
    ...(await providerReport(results, started, env)),
    fused: true,
  };
}

async function bundleSearch(query, env, limit = 5) {
  const started = Date.now();
  const results = await providerResults(query, env, limit);
  const groups = groupMetas(results.flatMap((r) => (r.status === "fulfilled" ? r.value : []))).slice(0, 3);

  const enriched = await Promise.all(
    groups.map(async (group) => {
      const tmdbId = group.find((m) => m.extensions?.ids?.tmdb_id)?.extensions.ids.tmdb_id;
      const detail = tmdbId && env.TMDB_API_KEY ? await tryFetch(() => tmdbDetail(tmdbId, env)) : null;
      const malId = group.find((m) => m.extensions?.ids?.mal_id)?.extensions.ids.mal_id;
      const mapping = malId != null ? await tryFetch(() => zenshinMappings({ mal_id: malId })) : null;
      return fuseMetas(detail ? [...group, detail] : group, mapping);
    }),
  );

  return {
    query,
    generatedAt: Date.now(),
    ...(await providerReport(results, started, env)),
    count: enriched.length,
    results: enriched.filter(Boolean),
  };
}

async function jikanCatalog(path, offset, fallbackPath) {
  try {
    const data = await getJson(`${JIKAN}${path}&limit=20&offset=${offset}`, {}, 6000);
    return (data.data ?? []).map(jikanMeta);
  } catch {
    const data = await getJson(`${SHIKIMORI}${fallbackPath}&limit=20&offset=${offset}`);
    return (Array.isArray(data) ? data : []).map(shikimoriMeta);
  }
}

async function catalogMetas(id, env, skip) {
  const limit = 20;
  const offset = Math.max(0, Number(skip) || 0);

  if (id === "jikan.top") return jikanCatalog("/top/anime?filter=bypopularity", offset, "/animes?order=popularity");
  if (id === "jikan.airing") return jikanCatalog("/seasons/now", offset, "/animes?status=ongoing&order=popularity");
  if (id === "jikan.upcoming") return jikanCatalog("/seasons/upcoming", offset, "/animes?status=anons&order=popularity");
  if (id === "tenrai.top") {
    const data = await getJson(`${TENRAI}/top/anime?filter=bypopularity&limit=${limit}&offset=${offset}`);
    return (data.data ?? []).map(tenraiMeta);
  }
  if (id === "tenrai.airing") {
    const data = await getJson(`${TENRAI}/seasons/now?limit=${limit}&offset=${offset}`);
    return (data.data ?? []).map(tenraiMeta);
  }
  if (id === "shikimori.popular") {
    const data = await getJson(`${SHIKIMORI}/animes?order=popularity&limit=${limit}&offset=${offset}`);
    return (Array.isArray(data) ? data : []).map(shikimoriMeta);
  }
  if (id === "shikimori.ongoing") {
    const data = await getJson(`${SHIKIMORI}/animes?status=ongoing&order=popularity&limit=${limit}&offset=${offset}`);
    return (Array.isArray(data) ? data : []).map(shikimoriMeta);
  }
  if (id === "anilist.trending") {
    const data = await postJson(ANILIST, {
      query: `query ($page: Int) { Page(page: $page, perPage: 20) { media(type: ANIME, sort: TRENDING_DESC) { ${ANILIST_FIELDS} } } }`,
      variables: { page: Math.floor(offset / limit) + 1 },
    });
    return (data.data?.Page?.media ?? []).filter(Boolean).map(anilistMeta);
  }
  if (id === "tmdb.trending" && env.TMDB_API_KEY) {
    const data = await getJson(`${TMDB}/trending/tv/week?api_key=${encodeURIComponent(env.TMDB_API_KEY)}`);
    return (data.results ?? [])
      .filter((t) => !t.genre_ids?.length || t.genre_ids.includes(16))
      .slice(offset, offset + limit)
      .map(tmdbMeta);
  }
  if (id === "tmdb.anime" && env.TMDB_API_KEY) {
    const page = Math.floor(offset / limit) + 1;
    const data = await getJson(
      `${TMDB}/discover/tv?api_key=${encodeURIComponent(env.TMDB_API_KEY)}&with_genres=16&sort_by=popularity.desc&page=${page}`,
    );
    return (data.results ?? []).slice(0, limit).map(tmdbMeta);
  }
  return [];
}

async function zenshinMappings(params) {
  const query = new URLSearchParams(params).toString();
  for (const base of ZENSHIN_BASES) {
    try {
      const data = await getJson(`${base}/mappings?${query}`);
      if (data?.mappings || data?.episodes) return data;
    } catch {
      // proxima base
    }
  }
  return null;
}

function zenshinVideos(mapping) {
  const malId = mappingIds(mapping).mal_id;
  return Object.entries(mapping.episodes ?? {})
    .filter(([key]) => /^\d+$/.test(key))
    .map(([key, ep]) => ({
      id: `mal:${malId}:${key}`,
      title: ep.title?.en ?? ep.nameTvdb ?? `Episódio ${key}`,
      season: ep.seasonNumber ?? 1,
      episode: ep.episodeNumber ?? Number(key),
      released: ep.airDate ?? ep.airdate,
      overview: ep.overview,
      thumbnail: ep.image,
    }))
    .sort((a, b) => a.episode - b.episode);
}

function paramsFromIds(ids) {
  const params = {};
  for (const key of ["mal_id", "anilist_id", "thetvdb_id", "tvdb_id", "anidb_id"]) {
    const value = ids[key];
    if (value != null && !params.mal_id) params[key] = value;
  }
  if (params.mal_id) delete params.tvdb_id;
  return params;
}

async function jikanDetail(id) {
  const data = await getJson(`${JIKAN}/anime/${encodeURIComponent(id)}/full`, {}, 6000);
  return data.data ? jikanMeta(data.data) : null;
}

async function shikimoriDetail(id) {
  const data = await getJson(`${SHIKIMORI}/animes/${encodeURIComponent(id)}`);
  return data?.id ? shikimoriMeta(data) : null;
}

async function tmdbDetail(id, env) {
  const data = await getJson(
    `${TMDB}/tv/${encodeURIComponent(id)}?api_key=${encodeURIComponent(env.TMDB_API_KEY)}` +
      `&append_to_response=season/1,watch_providers,external_ids,videos`,
  );
  if (!data?.id) return null;

  const meta = tmdbMeta(data);
  const ids = meta.extensions.ids;
  if (data.external_ids?.tvdb_id) ids.thetvdb_id = data.external_ids.tvdb_id;
  if (data.external_ids?.imdb_id) ids.imdb_id = data.external_ids.imdb_id;

  const watchProviders = tmdbWatchProviders(data);
  if (watchProviders.length) meta.extensions.watchProviders = watchProviders;
  const trailer = tmdbTrailer(data);
  if (trailer) meta.extensions.trailer = trailer;

  return meta;
}

async function metaDetail(rawId, env) {
  const separator = rawId.indexOf(":");
  const source = separator === -1 ? "jikan" : rawId.slice(0, separator);
  const id = separator === -1 ? rawId : rawId.slice(separator + 1);

  let seed = null;
  if (source === "jikan") seed = await tryFetch(() => jikanDetail(id));
  else if (source === "tenrai") seed = await tryFetch(() => tenraiDetail(id));
  else if (source === "shikimori") seed = await tryFetch(() => shikimoriDetail(id));
  else if (source === "tmdb" && env.TMDB_API_KEY) seed = await tryFetch(() => tmdbDetail(id, env));
  else if (source === "anilist") seed = await tryFetch(() => anilistDetail(id));
  else if (source === "kitsu") seed = await tryFetch(() => kitsuDetail(id));
  else if (source === "mal") seed = await tryFetch(() => malDetail(id, env));

  if (!seed) {
    const fallbackIds = {};
    if (source === "jikan" || source === "mal" || source === "tenrai") fallbackIds.mal_id = id;
    else if (source === "shikimori") fallbackIds.shikimori_id = id;
    else if (source === "tmdb") fallbackIds.tmdb_id = id;
    else if (source === "anilist") fallbackIds.anilist_id = id;
    else if (source === "kitsu") fallbackIds.kitsu_id = id;
    else return null;
    seed = { id: rawId, extensions: { ids: fallbackIds, source } };
  }

  let mapping = await tryFetch(() => zenshinMappings(paramsFromIds(seed.extensions?.ids ?? {})));

  // A Zenshin nao aceita tmdb_id/imdb_id. Quando a origem e a TMDB, resolve
  // o MAL/AniList pelo titulo antes de tentar de novo.
  let resolved = null;
  if (!mapping && seed.name) {
    const candidates = await tryFetch(() => anilistSearch(seed.name, 5));
    resolved =
      candidates?.find((item) => normalizeTitle(item.name) === normalizeTitle(seed.name)) ??
      candidates?.[0] ??
      null;
    if (resolved) {
      mapping = await tryFetch(() => zenshinMappings(paramsFromIds(resolved.extensions?.ids ?? {})));
    }
  }

  const allIds = {
    ...(mapping ? mappingIds(mapping) : {}),
    ...(resolved?.extensions?.ids ?? {}),
    ...seed.extensions?.ids,
  };

  // Kitsu /mappings é gratuito e devolve MAL/AniList/AniDB/TVDB sem limite publicado.
  if (allIds.kitsu_id) {
    const cross = await tryFetch(() => kitsuCrossIdsFor(allIds.kitsu_id));
    for (const [key, value] of Object.entries(cross ?? {})) {
      if (value != null && allIds[key] == null) allIds[key] = value;
    }
  }

  const fetched = await Promise.all([
    allIds.mal_id ? tryFetch(() => tenraiDetail(allIds.mal_id)) : Promise.resolve(null),
    allIds.mal_id ? tryFetch(() => jikanDetail(allIds.mal_id)) : Promise.resolve(null),
    allIds.tmdb_id && env.TMDB_API_KEY ? tryFetch(() => tmdbDetail(allIds.tmdb_id, env)) : Promise.resolve(null),
    allIds.shikimori_id ? tryFetch(() => shikimoriDetail(allIds.shikimori_id)) : Promise.resolve(null),
    allIds.anilist_id ? tryFetch(() => anilistDetail(allIds.anilist_id)) : Promise.resolve(null),
    allIds.kitsu_id ? tryFetch(() => kitsuDetail(allIds.kitsu_id)) : Promise.resolve(null),
    allIds.mal_id && env.MAL_CLIENT_ID ? tryFetch(() => malDetail(allIds.mal_id, env)) : Promise.resolve(null),
  ]);

  const metas = [];
  if (mapping) {
    metas.push({
      id: `zenshin:${allIds.mal_id ?? allIds.anilist_id}`,
      videos: zenshinVideos(mapping),
      extensions: { source: "zenshin", ids: allIds },
    });
  }
  await tryFetch(() => fillerIndex());
  const fillerShow = matchFillerShow(allIds);
  if (fillerShow) {
    const videos = await tryFetch(() => fillerDetail(fillerShow));
    if (videos) {
      metas.push({
        id: `filler:${fillerShow.show}`,
        videos,
        extensions: {
          source: "fillerlists",
          ids: { wikidata_id: fillerShow.ids?.wikidata },
          filler: {
            show: fillerShow.show,
            pct: fillerShow.fillerPct,
            counts: fillerShow.counts,
            credit: FILLER_CREDIT,
            url: fillerShow.url,
          },
        },
      });
    }
  }

  metas.push(...fetched, seed);
  if (resolved) metas.push(resolved);
  const result = fuseMetas(metas, mapping);
  if (result && fillerShow?.ids?.wikidata && !result.extensions.ids.wikidata_id) {
    result.extensions.ids.wikidata_id = fillerShow.ids.wikidata;
  }
  return result;
}

function manifest() {
  const extra = [
    { name: "search", isRequired: false, options: [] },
    { name: "skip", isRequired: false, options: [] },
  ];
  const catalogs = [
    ["jikan.top", "Animes - populares"],
    ["jikan.airing", "Animes - em exibição"],
    ["jikan.upcoming", "Animes - próximos"],
    ["tenrai.top", "Tenrai - populares (MAL)"],
    ["tenrai.airing", "Tenrai - em exibição"],
    ["shikimori.popular", "Shikimori - populares"],
    ["shikimori.ongoing", "Shikimori - em andamento"],
    ["anilist.trending", "AniList - em alta"],
    ["tmdb.trending", "TMDB - tendências"],
    ["tmdb.anime", "TMDB - animes"],
  ].map(([id, name]) => ({ type: "anime", id, name, extra }));

  return {
    id: "org.palv.ultra.anime",
    version: "0.4.0",
    name: "Ultra Anime",
    description: "Metadados fundidos de Jikan, Tenrai, Shikimori, TMDB, AniList, Kitsu, MAL, Zenshin e FillerLists",
    types: ["anime"],
    resources: [
      { name: "catalog", types: ["anime"], idPrefixes: [] },
      { name: "meta", types: ["anime"], idPrefixes: ["jikan:", "tenrai:", "shikimori:", "tmdb:", "anilist:", "kitsu:", "mal:"] },
    ],
    idPrefixes: ["jikan:", "tenrai:", "shikimori:", "tmdb:", "anilist:", "kitsu:", "mal:"],
    catalogs,
  };
}

/**
 * Retorna uma Response para rotas /api/anime/*, ou null se nao for daqui.
 */
export async function handleAnime(request, env) {
  const url = new URL(request.url);
  const path = url.pathname;
  if (!path.startsWith("/api/anime/")) return null;
  if (request.method !== "GET") return fail("METHOD_NOT_ALLOWED", "use GET", 405);

  if (path === "/api/anime/manifest.json") return json(manifest());

  const bundleId = path.match(/^\/api\/anime\/bundle\/id\/([^/]+?)(?:\.json)?$/);
  if (bundleId) {
    const started = Date.now();
    const id = decodeURIComponent(bundleId[1]);
    const key = `/api/anime/bundle/id/${id}.json`;
    return cached(request, key, TTL_META, async () => {
      try {
        const meta = await metaDetail(id, env);
        if (!meta) return json({ error: { code: "NOT_FOUND", message: "meta not found" } }, 404);
        return json({
          query: id,
          generatedAt: Date.now(),
          elapsedMs: Date.now() - started,
          count: 1,
          results: [meta],
        });
      } catch (error) {
        return fail("BUNDLE", error.message);
      }
    });
  }

  const bundle = path.match(/^\/api\/anime\/bundle(?:\.json)?$/);
  if (bundle) {
    const query = (url.searchParams.get("q") ?? url.searchParams.get("search") ?? "").trim();
    if (!query) return json({ error: { code: "MISSING_QUERY", message: "informe q=" } }, 400);
    const key = `/api/anime/bundle.json?q=${encodeURIComponent(query)}`;
    return cached(request, key, TTL_SEARCH, async () => {
      try {
        return json(await bundleSearch(query, env));
      } catch (error) {
        return fail("BUNDLE", error.message);
      }
    });
  }

  const search = path.match(/^\/api\/anime\/search(?:\.json)?$/);
  if (search) {
    const query = (url.searchParams.get("q") ?? url.searchParams.get("search") ?? "").trim();
    if (!query) return json({ metas: [], providers: [] });
    const key = `/api/anime/search.json?q=${encodeURIComponent(query)}`;
    return cached(request, key, TTL_SEARCH, async () => {
      try {
        return json(await searchAll(query, env));
      } catch (error) {
        return fail("SEARCH", error.message);
      }
    });
  }

  const catalog = path.match(/^\/api\/anime\/catalog\/([^/]+)\/([^/]+?)(?:\.json)?$/);
  if (catalog) {
    const [, type, rawId] = catalog;
    const id = decodeURIComponent(rawId);
    const skip = url.searchParams.get("skip") ?? "0";
    const key = `/api/anime/catalog/${type}/${encodeURIComponent(id)}.json?skip=${skip}`;
    return cached(request, key, TTL_SEARCH, async () => {
      try {
        const metas = await catalogMetas(id, env, skip);
        return json({ metas: metas.map((meta) => ({ ...meta, type })) });
      } catch (error) {
        return fail("CATALOG", error.message);
      }
    });
  }

  const meta = path.match(/^\/api\/anime\/meta\/([^/]+)\/([^/]+?)(?:\.json)?$/);
  if (meta) {
    const [, type, rawId] = meta;
    const key = `/api/anime/meta/${type}/${rawId}.json`;
    return cached(request, key, TTL_META, async () => {
      try {
        const item = await metaDetail(decodeURIComponent(rawId), env);
        if (!item) return json({ error: { code: "NOT_FOUND", message: "meta not found" } }, 404);
        return json({ meta: { ...item, type } });
      } catch (error) {
        return fail("META", error.message);
      }
    });
  }

  const mappings = path.match(/^\/api\/anime\/mappings(?:\.json)?$/);
  if (mappings) {
    const params = {};
    for (const key of ["mal_id", "anilist_id", "thetvdb_id", "anidb_id"]) {
      const value = url.searchParams.get(key);
      if (value) params[key] = value;
    }
    if (!Object.keys(params).length) {
      return fail("MISSING_ID", "informe mal_id, anilist_id, thetvdb_id ou anidb_id", 400);
    }
    const query = new URLSearchParams(params).toString();
    return cached(request, `/api/anime/mappings.json?${query}`, TTL_MAPPINGS, async () => {
      const data = await zenshinMappings(params);
      if (!data) return fail("ZENSHIN_UNAVAILABLE", "nenhuma base Zenshin respondeu", 503);
      return json(data);
    });
  }

  return fail("NOT_FOUND", "unknown anime route", 404);
}
