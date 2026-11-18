# URLs dinâmicas — ultravideo

Hosts:
- **Conteúdo estático:** `https://u-content.palv.org`
- **API:** `https://u-api.palv.org`

## Estático (R2 via Worker)

| Recurso | URL |
|---|---|
| Ad frame (desktop) | `https://u-content.palv.org/ads/frame.html` |
| Envelope de UI assinado | `https://u-content.palv.org/ui/envelope.json` |
| Descriptor de exemplo | `https://u-content.palv.org/ui/sample.json` |
| Catálogo verificado de add-ons | `https://u-content.palv.org/addons/catalog.json` |
| APK | `https://u-content.palv.org/apk/ultravideo-v0.1.0.apk` |
| Manifest de atualização | `https://u-content.palv.org/updates/latest.json` |
| Logo (mark) | `https://u-content.palv.org/assets/logo-mark.png` |
| Pôster placeholder | `https://u-content.palv.org/assets/poster-fallback.webp` |
| Termos | `https://u-content.palv.org/legal/terms.html` |
| Privacidade | `https://u-content.palv.org/legal/privacy.html` |
| DMCA | `https://u-content.palv.org/legal/dmca.html` |

## API ( Worker → VPS )

| Recurso | URL |
|---|---|
| Health | `https://u-api.palv.org/api/ping` |
| Add-ons verificados | `https://u-api.palv.org/api/addons/verified` |
| Catálogo | `https://u-api.palv.org/api/catalog/{type}/{id}.json` |
| Metadados | `https://u-api.palv.org/api/meta/{type}/{id}.json` |
| Streams | `https://u-api.palv.org/api/stream/{type}/{id}.json` |
| Legendas | `https://u-api.palv.org/api/subtitles/{type}/{id}.json?lang=pt` |
| Busca agregada | `https://u-api.palv.org/api/search?q=one+piece` |
| EPG | `https://u-api.palv.org/api/epg/{channelId}` |
| Proxy de imagem | `https://u-api.palv.org/api/image?url=https://image.tmdb.org/t/p/w500/xxx.jpg` |
| Login Discord | `POST https://u-api.palv.org/api/auth/discord` |
| Perfil | `GET/PATCH https://u-api.palv.org/api/profile` |
| Biblioteca | `GET/POST https://u-api.palv.org/api/library` |
| Sync | `POST https://u-api.palv.org/api/sync/push` · `GET /api/sync/pull?since=` |
| Denúncia | `POST https://u-api.palv.org/api/report` |

## Deep link

`ultravideo://addon?manifest=https%3A%2F%2Fexemplo.com%2Fmanifest.json`

## S3 (upload)

Endpoint: `https://<account_id>.r2.cloudflarestorage.com`
Bucket: `ultra-content`

```bash
R2_ACCOUNT_ID=... R2_ACCESS_KEY_ID=... R2_SECRET_ACCESS_KEY=... npm run upload:r2
```
