/**
 * Utilitários compartilhados pelos resolvers de embed.
 *
 * O navegador é opcional: se `RESOLVER_CDP_URL` estiver definido, conecta num
 * Chromium remoto; senão tenta importar `playwright` local. Sem navegador, os
 * providers que dependem de JS retornam null e simplesmente não aparecem.
 */

const AD_PATTERNS = [
  "**/rapidadexchange.com/**",
  "**/adsco.re/**",
  "**/cdn4ads.com/**",
  "**/histats.com/**",
  "**/llvpn.com/**",
  "**/rtmark.net/**",
  "**/usrpubtrck.com/**",
  "**/5gvci.com/**",
  "**/sandbox.php**",
  "**/embedblocked**",
  "**/dd.js",
];

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/157.0.0.0 Safari/537.36";

let browserPromise = null;

export async function getBrowser() {
  if (browserPromise) return browserPromise;
  browserPromise = (async () => {
    const cdp = process.env.RESOLVER_CDP_URL;
    if (cdp) {
      const { chromium } = await import("playwright-core");
      return chromium.connectOverCDP(cdp);
    }
    const executablePath = process.env.RESOLVER_CHROME_PATH;
    if (executablePath) {
      const { chromium } = await import("playwright-core");
      return chromium.launch({
        executablePath,
        headless: true,
        args: ["--no-sandbox", "--disable-dev-shm-usage"],
      });
    }
    const { chromium } = await import("playwright");
    return chromium.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  })().catch((error) => {
    browserPromise = null;
    throw error;
  });
  return browserPromise;
}

export async function withPage(fn, options = {}) {
  for (let attempt = 0; attempt < 2; attempt++) {
    let context = null;
    try {
      const browser = await getBrowser();
      context = await browser.newContext({
        userAgent: UA,
        viewport: { width: 1280, height: 720 },
        locale: "pt-BR",
      });
      await context.route("**/*", (route) => {
        const url = route.request().url();
        if (AD_PATTERNS.some((pattern) => matchesGlob(url, pattern))) return route.abort();
        return route.continue();
      });
      return await fn(await context.newPage(), context);
    } catch (error) {
      // Browser morreu/crashou: descarta a instância em cache e tenta uma vez.
      if (attempt === 0 && /closed|crash|target|browser has been|disconnected/i.test(String(error))) {
        browserPromise = null;
        continue;
      }
      throw error;
    } finally {
      await context?.close().catch(() => {});
    }
  }
  return null;
}

function matchesGlob(url, pattern) {
  const re = new RegExp(
    "^" + pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*\*/g, ".*").replace(/\*/g, "[^/]*") + "$",
    "i",
  );
  return re.test(url);
}

/** Observa a rede e devolve o primeiro m3u8/mp4 que aparecer. */
export function sniffStreams(page, timeoutMs = 12000) {
  const found = [];
  page.on("response", (response) => {
    const url = response.url();
    if (/\.m3u8?(\?|#|$)/i.test(url) || /\.mp4(\?|#|$)/i.test(url) || /\.mpd(\?|#|$)/i.test(url)) {
      found.push({ url, contentType: response.headers()["content-type"] ?? null });
    }
  });
  return {
    found,
    async wait() {
      const until = Date.now() + timeoutMs;
      while (Date.now() < until && found.length === 0) {
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
      return pickBest(found);
    },
  };
}

export function pickBest(urls) {
  const list = urls.filter((item) => item?.url);
  const hls = list.find((item) => /\.m3u8/i.test(item.url));
  const m3u = list.find((item) => /\.m3u(?!8)(\?|#|$)/i.test(item.url));
  const mp4 = list.find((item) => /\.mp4/i.test(item.url));
  const best = hls ?? m3u ?? mp4 ?? list[0];
  if (!best) return null;
  return {
    url: best.url.replace(/&amp;/g, "&"),
    m3u8: hls ? hls.url.replace(/&amp;/g, "&") : null,
    m3u: m3u ? m3u.url.replace(/&amp;/g, "&") : null,
    mp4: mp4 ? mp4.url.replace(/&amp;/g, "&") : null,
    contentType: best.contentType ?? null,
  };
}

/** Decodifica o packer custom usado por vários players (base-N + separador). */
export function decodeCustomPacker(html) {
  const start = html.indexOf("function(h,u,n,t,e,r)");
  if (start < 0) return null;
  const callEnd = html.indexOf("10))", start);
  if (callEnd < 0) return null;
  const source = html.slice(start, callEnd + 3);
  const args = source.match(/\(['"]((?:[^'"\\]|\\.)*)['"],\d+,['"]([^'"]+)['"],(\d+),(\d+),(\d+)\)$/);
  if (!args) return null;

  const payload = args[1].replace(/\\'/g, "'").replace(/\\"/g, '"').replace(/\\\\/g, "\\");
  const alphabet = args[2];
  const shift = Number(args[3]);
  const base = Number(args[4]);
  const target = Number(args[5]);
  const separator = alphabet[base];

  let out = "";
  let pos = 0;
  while (pos < payload.length) {
    let chunk = "";
    while (pos < payload.length && payload[pos] !== separator) chunk += payload[pos++];
    for (let i = 0; i < alphabet.length; i++) chunk = chunk.split(alphabet[i]).join(String(i));
    if (chunk) out += String.fromCharCode(baseNDecode(chunk, base, target) - shift);
    pos++;
  }
  try {
    out = decodeURIComponent(escape(out));
  } catch {
    // texto já é ASCII
  }
  return out;
}

function baseNDecode(value, base, target) {
  const digits = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ+/";
  const source = digits.slice(0, base);
  const outAlphabet = digits.slice(0, target);
  let number = 0;
  value
    .split("")
    .reverse()
    .forEach((char, index) => {
      if (source.includes(char)) number += source.indexOf(char) * Math.pow(base, index);
    });
  let result = "";
  while (number > 0) {
    result = outAlphabet[number % target] + result;
    number = (number - (number % target)) / target;
  }
  return result || "0";
}

export function extractPlayerFile(html) {
  const decoded = decodeCustomPacker(html);
  const file = decoded?.match(/file\s*:\s*"([^"]+)"/)?.[1];
  return file ? file.replace(/&amp;/g, "&") : null;
}

export function xorDecode(data, keyHex) {
  const key = Buffer.from(keyHex, "hex");
  const out = Buffer.alloc(data.length);
  for (let i = 0; i < data.length; i++) out[i] = data[i] ^ key[i % key.length];
  return out;
}

/** Não devolve nada quando o provider não consegue um link de mídia. */
export function result(id, url, stream, extra = {}) {
  if (!stream?.url) return null;
  return {
    id,
    url,
    title: extra.title ?? null,
    m3u8: stream.m3u8 ?? (/\.m3u8/i.test(stream.url) ? stream.url : null),
    m3u: stream.m3u ?? (/\.m3u(?!8)(\?|#|$)/i.test(stream.url) ? stream.url : null),
    mp4: stream.mp4 ?? (/\.mp4/i.test(stream.url) ? stream.url : null),
    contentType: stream.contentType ?? null,
    isEmbed: Boolean(extra.isEmbed),
    latencyMs: extra.latencyMs ?? null,
    fetchedAt: new Date().toISOString(),
  };
}

export function timeout(ms) {
  return new Promise((_, reject) => setTimeout(() => reject(new Error(`timeout ${ms}ms`)), ms));
}
