# ultravideo — Roadmap

Status legend: **Done** · **In progress** · **Planned** · **Under evaluation**

> Versioning follows semantic versioning. The app identifier `org.palv.ultra.video` is permanent and must never change after the first public release.

---

## v0.1.0 — Foundation (Done)

Goal: a working skeleton with the Stremio-compatible add-on protocol and local-first data.

| Area | Delivery |
|---|---|
| Stack | Tauri v2 + Rust 1.90+ + React/TypeScript + Vite |
| Add-ons | `manifest.json` parser, `catalog/meta/stream/subtitles` transport, resource filtering by `types`/`idPrefixes`, aggregation |
| Safety | Anti-SSRF on install (private origins blocked in release), unknown manifest fields preserved |
| Data | SQLite local library, playback progress, favorites, watched |
| Sync | Portable JSON file with SHA-256 checksum and bidirectional LWW merge |
| UI | Dark + violet theme, desktop navbar, mobile bottom navigation, carousels, glossy Bootstrap 2.0-style components |
| Branding | `uvideo` mark (U + play) and wordmark, transparent PNG variants |
| Tooling | CI (fmt/clippy/build), JSON Schema for manifests, local test add-on, typed Rust→TS bridge |

---

## v0.2.0 — Mobile-first & Torrent core (Done)

Goal: feel like a real Android app, not a website. Add the torrent engine with a safe cache policy.

| Area | Delivery |
|---|---|
| UI | Android-first layout: full-bleed hero, bottom nav, safe-area, touch scrolling, no site-like email capture on mobile |
| Language | All screens in English (i18n-ready) |
| Auth screen | "Continue with Discord" design-only screen, OAuth2 flow prepared, no backend yet |
| Remote UI | Signed declarative JSON descriptors (ECDSA P-256), local React renderer only — no remote HTML/JS |
| Torrent | `librqbit` behind `--features torrent`, streaming with seek, piece prioritization |
| Cache policy | Max cache (default 2 GB), free-space guard, LRU eviction, seeding while watching, ratio/time limits |
| Identity | Peer ID `-UVID01-`, user agent `UVIDEOclient/0.1` |
| UX | Cache indicator: used / limit, peers, up/down speed |

---

## v0.3.0 — Community add-on registry (Planned)

Goal: verified catalog so users are protected from illegal or abusive add-ons.

| Area | Delivery |
|---|---|
| Discord bot | `/submit <manifest_url>` → schema validation, domain/hash checks, screenshot, status `PENDING` |
| Moderation | Two-person approval rule, `PUBLISHED / REJECTED / BANNED`, immutable audit log |
| API | Signed catalog endpoint consumed by the app; offline cache |
| Reports | 5 unique reports → auto-hide pending review; takedown pushes blocklist to all apps |
| DMCA | Takedown workflow with a web report form; registered DMCA agent for safe harbor; terms and privacy policy |
| Client | Manual URL installs allowed but clearly marked **Unverified**. Add-ons are JSON manifests + URLs, never executable code (Play Store policy) |

---

## v0.4.0 — Player & privacy (Planned)

| Area | Delivery |
|---|---|
| Player | Native player: mpv on desktop, Media3/ExoPlayer on Android |
| Subtitles | Rendering with libass, subtitle add-ons, language selection |
| Downloads | Offline save with the same cache policy |
| Privacy | No proxy: standard BitTorrent behavior, the user's IP is visible to peers like any regular client |
| Sync | Cloud sync client ready for the paid backend |

---

## v0.5.0 — Live TV / IPTV (Planned)

- `channel` type support in the add-on catalog, EPG rendered from `meta.videos`.
- HLS playback through the existing lazy-loaded `hls.js` player.
- "Live TV" row and a program-guide screen.
- Only verified add-ons with broadcast rights; no bundled channel lists.

### Anime

Anime is a category inside ultravideo, not a separate app: `anime` add-on type, AniList/Kitsu metadata, dedicated Anime tab with season/status/genre filters. A separate app is only justified for manga/comics reading (a different interaction model).

> App-side effort: 1–2 days. The real cost is curation, licensing and DMCA response — this ships after the community registry, never in the MVP.

---

## v1.0.0 — Public release (Planned)

| Area | Delivery |
|---|---|
| Accounts | Discord OAuth2 live (PKCE), tokens in OS keystore / Tauri Stronghold |
| Cloud sync | Paid sync on the ultravideo server, same LWW engine as the file sync |
| Updates | Automatic updater plugin, signed releases |
| Profiles | Multiple local profiles, per-profile library and continue-watching |
| Onboarding | First-run flow with verified add-ons and privacy choices |
| Stores | Windows and Android distribution |

---

## v1.1.0 — Monetization (Under evaluation)

> Only after legal entity, moderation, DMCA process and privacy policy are in place.

- No ads inside the player.
- Rewarded ads grant in-app **ucoins** (credits): 1 ad = 1h of free watching, daily cap enforced.
- Credits are non-transferable and never redeemable for money. Contributor payouts happen outside the app through a separate fund.
- Optional sponsor / "Support the project" flow.
- Evaluate Yodo1 / Appodeal mediation against their content policies (torrent clients + third-party add-ons are a policy risk).

---

## v2.0.0 — Ecosystem (Planned)

- Smart TV targets (Android TV).
- Public add-on SDK and developer portal.
- Plugin API for local plugins written in Rust/WASM.
- Shared watchlists and community lists (opt-in).

---

## Explicitly out of scope

- Bundling any movie, series or torrent content in the app.
- Loading remote HTML/JS into the Tauri WebView (RCE risk). Remote UI is declarative data only.
- Soulseek for video (wrong protocol for this use case).
- Per-user subdomains as an IP-privacy mechanism for BitTorrent peers (technically ineffective) — standard client behavior is intentional.
