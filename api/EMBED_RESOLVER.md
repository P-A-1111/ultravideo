# Embed Resolver — u-api

Resolvedor de streams de embeds com **fila priorizada**, **cache** e **autenticação por host**.

## Contrato

```
GET  /api/resolve?type=movie&tmdb=522931&provider=multiembed
GET  /api/resolve?type=tv&tmdb=1396&season=1&episode=1&wait=1
GET  /api/resolve/status?id=<jobId>
GET  /api/resolve/stats
GET  /api/resolve/providers
```

Parâmetros:

| Param | Descrição |
|---|---|
| `type` | `movie`, `tv` ou `anime` |
| `video_id` / `tmdb` / `imdb` / `anilist` | identificador do título (aceita `*_id`) |
| `season`, `episode` | padrão `1` |
| `provider` | restringe a um provider; sem ele, todos são resolvidos |
| `wait=1` | espera até `RESOLVER_MAX_WAIT_MS` pelo job (padrão 10s) |
| `refresh=1` | força reprocessamento mesmo com cache fresco |

Resposta:

```json
{
  "ok": true,
  "status": "done",
  "cache": "HIT",
  "job": null,
  "retryAfterMs": 0,
  "eta": {
    "estimatedMs": 0,
    "queueWaitMs": 0,
    "resolveMs": 0,
    "confidence": "exact",
    "samples": 0,
    "providers": []
  },
  "meta": { "attempted": 5, "resolved": 2 },
  "providers": [
    {
      "id": "multiembed",
      "url": "https://multiembed.mov/?video_id=522931&tmdb=1",
      "title": "Hitman's Wife's Bodyguard",
      "m3u8": "https://.../master.m3u8?r=...",
      "m3u": null,
      "mp4": null,
      "cache": "HIT",
      "avgMs": 18420,
      "successRate": 0.83,
      "isEmbed": false,
      "latencyMs": 18420,
      "fetchedAt": "2026-11-19T23:50:00.000Z"
    }
  ]
}
```

**Provider que não devolve mídia não entra no array** — é simplesmente ignorado, sem erro e sem placeholder.

## Comportamento

- `cache=HIT` → `200` imediato, sem tocar em nenhum provider.
- `cache=STALE` → `200` com o último resultado válido, enquanto um job de refresh roda em background com prioridade **1**.
- `cache=MISS` → enfileira um job com prioridade **10** para o provider pedido (ele é resolvido primeiro); os demais vêm na mesma leva. Responde `202` com `jobId` + `retryAfterMs`. Com `wait=1`, espera no máximo 10s e responde `200`.
- O worker roda os providers sequencialmente, cada um com timeout de `RESOLVER_PROVIDER_TIMEOUT_MS`. Falha vira cache negativo curto (`RESOLVER_NEGATIVE_MS`) para não martelar o site.
- TTL padrão: 45 min; stale por mais 6 h. Links com `?r=`, `?e=` e `?_t=` expiram — o refresh renova.

## Estimativa de tempo (ETA)

Toda resposta de `/api/resolve` traz `eta` e o header `X-Resolver-Eta-Ms`:

| Campo | Significado |
|---|---|
| `queueWaitMs` | espera estimada na fila (jobs à frente / workers) |
| `resolveMs` | soma do tempo médio histórico dos providers selecionados |
| `estimatedMs` | `queueWaitMs + resolveMs` |
| `confidence` | `low` (<5 amostras), `medium` (5–19), `high` (≥20), `exact` (cache HIT) |
| `samples` | quantas medições reais sustentam a estimativa |
| `providers[]` | `avgMs`, `p50Ms`, `p95Ms`, `successRate`, `ok`, `fail` por provider |

Cada provider registrado mede latência e sucesso por execução; a janela é das últimas 60 medições. `GET /api/resolve/stats` devolve o estado da fila, do cache e o histórico completo, além de `etaSemFiltro` (estimativa para todos os providers). Defina `RESOLVER_STATS_FILE` para persistir o histórico entre restarts.

Enquanto não há amostras suficientes, `FALLBACK_MS` (padrão 18s por provider) é usado — por isso `confidence: "low"` no início. O app deve tratar `eta` como estimativa, não promessa: Turnstile e anti-bot podem variar bastante.

## Validação dos links (teste real, 20/11/2026)

| Link | Resultado |
|---|---|
| m3u8 multiembed (`9199c425.…workers.dev`) | `200`, `application/vnd.apple.mpegurl`, master 480p/720p/1080p; variante e segmento `206` com bytes `moof/mfhd/traf` (fMP4 válido) |
| m3u8 vidy (`moon.goldenkite.top/…index-…m3u8?s=…`) | `200` e segmento `206` com `moof` **quando buscado com o Referer do embed**; sem Referer responde `403 openresty` |
| mp4 vidy (`…/init-s1080p-v1-a1.mp4`) | É o **init segment** do HLS fMP4, não o filme inteiro — o campo `mp4` pode ser um fragmento |
| mp4 mixdrop (`h5y4th9xb2.mxcontent.net/...mp4?s=&e=&_t=`) | Link existe no config do player, mas deu `403` inclusive com navegador, cookies e Referer corretos (bloqueio por IP/hotlink) |

Consequência prática: **o m3u8 é o resultado confiável**. O `mp4` deve ser tratado como "link encontrado", não garantia de reprodução. Alguns hosts só servem o manifest/segmentos com o `Referer` do domínio do embed — se o player do app não conseguir tocar, será preciso um proxy de mídia (fora do escopo deste módulo). Os tokens (`?r=`, `?s=`, `?e=`, `?_t=`) expiram; o refresh renova.

## Providers

| id | Base | Observação |
|---|---|---|
| `multiembed` | multiembed.mov | Cadeia completa: Turnstile → `/response.php` → `/playvideo.php` → `/vipstream_vfx.php` → packer custom → m3u8 |
| `ustream` | u-stream-mirror.palv.org | Host fora do ar no teste; configurável via `USTREAM_BASE`. Retorna null e é ignorado |
| `vidy` | vidy.st | Rotas da doc oficial (`/movie`, `/tv`, `/anime`) |
| `autoembed` | watch-v2.autoembed.app | `/movie/{id}/watch` e `/tv/{id}/watch` confirmados (200); sem rota de anime |
| `embedmaster` | embedmaster.link | Rotas da doc oficial |

Cada provider é um módulo em `api/providers/` que exporta `id`, `buildUrl(params)` e `resolve(params, env)`. Para adicionar outro, crie o arquivo e registre em `api/providers/index.mjs`.

## Navegador

Resolvers que dependem de JS precisam de Chromium. Duas opções:

1. **Remoto (recomendado na VPS):**
   ```bash
   export RESOLVER_CDP_URL=http://127.0.0.1:9222
   # use playwright-core (já é dependência opcional)
   ```
2. **Local:**
   ```bash
   npm install
   npx playwright install chromium
   ```

Sem navegador disponível, `getBrowser()` lança erro, o job marca o provider como vazio e ele **não aparece no JSON** — o restante da API continua funcionando.

## Autenticação por host

Configure:

```bash
export RESOLVER_SECRET='sua-chave'
export RESOLVER_ALLOWED_HOSTS='u-api.palv.org,ultra.palv.org'
```

O cliente assina a requisição:

```
X-Resolver-Host: u-api.palv.org
X-Resolver-Signature: <hmac sha256 em hex>
```

O conteúdo assinado é:

```
GET\n/api/resolve\n<querystring ordenada>\n<u-resolver-host>
```

Exemplo (Node):

```js
import { createHmac } from "node:crypto";

const path = "/api/resolve";
const query = new URLSearchParams({ type: "movie", tmdb: "522931", provider: "multiembed" }).toString();
const host = "u-api.palv.org";
const canonical = `GET\n${path}\n${query}\n${host}`;
const sig = createHmac("sha256", process.env.RESOLVER_SECRET).update(canonical).digest("hex");

await fetch(`https://u-api.palv.org${path}?${query}`, {
  headers: { "X-Resolver-Host": host, "X-Resolver-Signature": sig },
});
```

Sem `RESOLVER_SECRET`, só loopback é aceito (desenvolvimento). A comparação usa `timingSafeEqual`.

Erros seguem o padrão do u-api:

```json
{ "ok": false, "error": { "code": "HOST_NOT_ALLOWED", "message": "host not allowed" } }
```

Códigos: `AUTH_REQUIRED` (503), `UNAUTHORIZED` (401), `HOST_NOT_ALLOWED` (403), `INVALID_SIGNATURE` (403), `INVALID_PARAMS` (400), `JOB_NOT_FOUND` (404).

## Variáveis de ambiente

| Variável | Padrão | Descrição |
|---|---|---|
| `RESOLVER_SECRET` | — | segredo HMAC; sem ele, só loopback |
| `RESOLVER_ALLOWED_HOSTS` | — | lista de hosts autorizados (CSV) |
| `RESOLVER_CDP_URL` | — | endpoint CDP do Chromium remoto |
| `RESOLVER_WORKERS` | `2` | workers da fila |
| `RESOLVER_TTL_MS` | `2700000` | TTL do cache (45 min) |
| `RESOLVER_STALE_MS` | `21600000` | janela stale (6 h) |
| `RESOLVER_NEGATIVE_MS` | `60000` | cache de falha |
| `RESOLVER_PROVIDER_TIMEOUT_MS` | `35000` | timeout por provider |
| `RESOLVER_JOB_TIMEOUT_MS` | `75000` | timeout do job |
| `RESOLVER_MAX_WAIT_MS` | `10000` | espera máxima com `wait=1` |
| `RESOLVER_STATS_FILE` | — | arquivo JSON para persistir histórico de latência/ETA |
| `RESOLVER_FALLBACK_MS` | `18000` | latência assumida por provider antes de haver amostras |
| `USTREAM_BASE` | `https://u-stream-mirror.palv.org` | base do mirror |
