/** Static assets served from Cloudflare R2 via u-content.palv.org. */
export const CDN = "https://u-content.palv.org";

export const r2 = {
  logoMark: `${CDN}/assets/logo-mark.png`,
  adsFrame: `${CDN}/ads/frame.html`,
  uiEnvelope: `${CDN}/ui/envelope.json`,
  addonCatalog: `${CDN}/addons/catalog.json`,
  apk: `${CDN}/apk/ultravideo-v0.1.0.apk`,
  terms: `${CDN}/legal/terms.html`,
  privacy: `${CDN}/legal/privacy.html`,
  dmca: `${CDN}/legal/dmca.html`,
} as const;
