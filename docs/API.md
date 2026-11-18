# u-api.palv.org — API scope (Stremio-compatible)

Base URL: `https://u-api.palv.org`
Gateway: `worker/api.mjs` (Cloudflare) → VPS (`METADATA_ORIGIN`)

The resource contract is identical to Stremio's add-on protocol, so any add-on
response can be consumed by the Rust core without translation.

## Envelopes

| Resource | Response |
|---|---|
| catalog | `{ "metas": MetaPreview[] }` |
| meta | `{ "meta": Meta }` |
| stream | `{ "streams": Stream[] }` |
| subtitles | `{ "subtitles": Subtitle[] }` |

Error format:
```json
{ "error": { "code": "UNKNOWN_ADDON", "message": "..." } }
```

## Public endpoints (edge-cached 24h)

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/ping` | Health |
| GET | `/api/addons/verified` | Signed catalog of verified add-ons |
| GET | `/api/catalog/{type}/{id}.json?extra=...` | Aggregated catalog |
| GET | `/api/meta/{type}/{id}.json` | Metadata |
| GET | `/api/stream/{type}/{id}.json` | Streams (URLs only, never bytes) |
| GET | `/api/subtitles/{type}/{id}.json?lang=` | Subtitle index |
| GET | `/api/search?q=` | Aggregated discovery search |
| GET | `/api/epg/{channelId}` | Live TV schedule (cached 1h) |
| GET | `/api/image?url=` | Image proxy, allowlist (wsrv.nl-style) |

## User endpoints (Bearer JWT, `private, no-store`)

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/auth/discord` | Exchange Discord OAuth2 code → session JWT |
| GET | `/api/profile` | Profile, preferences, entitlements |
| PATCH | `/api/profile` | Update preferences |
| GET | `/api/library` | Library items |
| POST | `/api/library` | Upsert items (LWW) |
| POST | `/api/sync/push` | Push operations |
| GET | `/api/sync/pull?since=` | Pull operations since timestamp |
| POST | `/api/report` | DMCA / abuse report (no edge cache) |

## Moderation (future)

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/addons/submit` | Community submission → `PENDING` |
| GET | `/api/moderation/queue` | Review queue (moderator role) |
| POST | `/api/moderation/decision` | Approve / reject / ban |

## Caching rules

- Public GET → `Cache-Control: public, max-age=86400` (Cloudflare `caches.default`).
- EPG → 1h.
- Image proxy → 24h, allowlist only.
- Auth/user/sync/report → `private, no-store`, **never** in `caches.default`.
- Video bytes → never served by this API (device-only via `librqbit`).

## Auth

Discord OAuth2 with PKCE. Session JWT contains `sub` (discord id), `iat`, `exp`,
`plan` (`free` | `pro`). Tokens validated at the VPS; gateway only forwards
`Authorization`.

## Sync semantics

Last-write-wins on `(updated_at, device_id)`, identical to the app's file sync:
```json
{
  "id": "tt0111161",
  "favorite": true,
  "watched": false,
  "progress": 0.42,
  "updatedAt": 1763000000,
  "deviceId": "a1b2c3"
}
```
