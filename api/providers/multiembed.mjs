/**
 * multiembed.mov / streamingnow.mov
 *
 * Cadeia descoberta:
 *   /?video_id=X&tmdb=1  -> 302 streamingnow.mov/?play=<token>
 *   -> Turnstile invisível -> POST -> /response.php -> /playvideo.php
 *   -> /vipstream_vfx.php -> packer custom -> new Playerjs({ file: "<m3u8>" })
 *
 * Requer navegador (Turnstile + JS). Sem navegador, retorna null e é ignorado.
 */
import { extractPlayerFile, result, sniffStreams, timeout, withPage } from "./shared.mjs";

const BASE = "https://multiembed.mov";

export const id = "multiembed";

export function buildUrl({ type, tmdbId, imdbId, season, episode, videoId }) {
  const params = new URLSearchParams();
  // O multiembed usa sempre `video_id`; o flag `tmdb=1` diz que o id é TMDB.
  if (videoId || tmdbId) params.set("video_id", String(videoId ?? tmdbId));
  else if (imdbId) {
    params.set("video_id", String(imdbId));
    params.set("imdb", "1");
  } else return null;
  if (!imdbId) params.set("tmdb", "1");
  if (type === "tv") {
    params.set("season", String(season ?? 1));
    params.set("episode", String(episode ?? 1));
  }
  return `${BASE}/?${params}`;
}

export async function resolve(params, env) {
  const url = buildUrl(params);
  if (!url) return null;
  const started = Date.now();

  return withPage(async (page) => {
    const sniff = sniffStreams(page, 15000);
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });

    // Turnstile invisível costuma responder sozinho em ~8-12s.
    try {
      await page.waitForSelector(".play-button", { timeout: 15000 });
      await page.waitForTimeout(6000);
      await page.evaluate(() => document.querySelector(".play-button")?.click());
    } catch {
      return null;
    }

    // Espera o iframe do player aparecer.
    const until = Date.now() + 20000;
    while (Date.now() < until) {
      if (page.frames().some((frame) => /vipstream_.*\.php/.test(frame.url()))) break;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }

    const playerFrame = page.frames().find((frame) => /vipstream_.*\.php/.test(frame.url()));
    let title = null;

    if (playerFrame) {
      try {
        const html = await playerFrame.content();
        title = html.match(/<title>([^<]+)<\/title>/i)?.[1]?.replace(/\s*-\s*VIP Stream.*$/i, "").trim() ?? null;
        const file = extractPlayerFile(html);
        if (file) {
          return result(id, url, { url: file, m3u8: /\.m3u8/i.test(file) ? file : null }, {
            title,
            isEmbed: false,
            latencyMs: Date.now() - started,
          });
        }
      } catch {
        // cai pro sniff de rede
      }
    }

    const stream = await sniff.wait();
    return result(id, url, stream, {
      title,
      isEmbed: false,
      latencyMs: Date.now() - started,
    });
  }, env).catch(() => null);
}
