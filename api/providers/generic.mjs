/**
 * Resolver genérico para embeds que só precisam de navegador + observar a rede.
 * Cada provider exporta apenas a configuração; este módulo faz o resto.
 */
import { result, sniffStreams, withPage } from "./shared.mjs";

export function createSniffProvider({ id, base, routes }) {
  function buildUrl({ type, tmdbId, imdbId, anilistId, season, episode }) {
    const template =
      type === "anime" ? routes.anime : type === "tv" ? routes.tv : routes.movie;
    if (!template) return null;
    const rawId = anilistId ?? tmdbId ?? imdbId;
    if (!rawId) return null;
    const url = template
      .replace("{id}", encodeURIComponent(String(rawId)))
      .replace("{season}", String(season ?? 1))
      .replace("{episode}", String(episode ?? 1));
    return `${base.replace(/\/$/, "")}${url}`;
  }

  async function resolve(params) {
    const url = buildUrl(params);
    if (!url) return null;
    const started = Date.now();

    return withPage(async (page) => {
      const sniff = sniffStreams(page, 15000);
      const response = await page.goto(url, {
        waitUntil: "domcontentloaded",
        timeout: 30000,
      });
      if (response && response.status() >= 400) return null;

      let title = await page.title().catch(() => null);
      if (!title || /streaming|loading/i.test(title)) {
        title = await page
          .locator("h1")
          .first()
          .textContent({ timeout: 1500 })
          .catch(() => null);
      }

      // A maioria só carrega o stream após um gesto do usuário.
      for (const selector of [
        ".play-button",
        '[class*="play"]',
        'button[aria-label*="play" i]',
        "#play",
      ]) {
        try {
          await page.locator(selector).first().click({ timeout: 900 });
          break;
        } catch {
          // tenta o próximo seletor
        }
      }

      const stream = await sniff.wait();
      return result(id, url, stream, {
        title: title?.trim() || null,
        isEmbed: true,
        latencyMs: Date.now() - started,
      });
    }).catch(() => null);
  }

  return { id, buildUrl, resolve };
}
