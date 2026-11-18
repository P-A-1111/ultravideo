# ultravideo

Streaming multiplataforma em Tauri v2 (Rust + React/TypeScript). Desktop Windows + Android.

- Identificador do app: `org.palv.ultra.video`
- Namespace de add-ons: `org.palv.ultra.addon.<nome>`
- Deep link: `ultravideo://addon?manifest=<url codificada>`

## Pré-requisitos

- Node 20+ e npm
- Rust **1.90+** (MSRV do Tauri 2.12)
- Para Android: Android SDK + NDK (via `tauri android init`)

## Rodar

```bash
npm install
npm run addon:dev          # terminal 1: add-on de teste na :7000
npm run tauri:dev          # terminal 2: app desktop
```

No app, vá em **Add-ons** e instale `http://localhost:7000/manifest.json`.

Android:

```bash
npm run tauri android:dev
```

Validar tudo:

```bash
npm run check              # build do front + cargo check
npm run lint               # clippy com -D warnings
npm run gen:types          # regera src/core/types.ts a partir do Rust
```

## Arquitetura

```
React (WebView)  --invoke-->  #[tauri::command]  -->  domain / addons / streaming / store
       ^                                                        |
       +---------------------- emit(events) ----------------------+
```

- `src-tauri/src/domain` — tipos do protocolo (manifest, meta, stream). Fonte da verdade.
- `src-tauri/src/addons` — validação de manifesto, transporte HTTP, agregação e filtros.
- `src-tauri/src/streaming` — resolução de streams. `librqbit` entra via `--features torrent`.
- `src-tauri/src/store` — SQLite local (library, playback, fila de sync).
- `src-tauri/src/sync` — exportação/importação de arquivo portátil com checksum e merge LWW.
- `src/` — UI **feita do zero**, CSS puro, tema escuro/violeta, sidebar no desktop e bottom nav no mobile.

## Protocolo de add-on

Compatível com Stremio na fio:

```
GET /manifest.json
GET /catalog/{type}/{id}.json?search=&skip=&genre=
GET /meta/{type}/{id}.json
GET /stream/{type}/{id}.json
GET /subtitles/{type}/{id}.json?lang=
```

Envelopes: `{ metas }`, `{ meta }`, `{ streams }`, `{ subtitles }`.

Campos desconhecidos no manifesto são preservados — nunca use `deny_unknown_fields`.
Extensões próprias devem usar prefixo `uv_`.

Em release, a instalação bloqueia origens privadas (anti-SSRF). Em debug, `localhost:7000` é liberado para o add-on de teste.

## Sincronização

- **Grátis:** tudo no SQLite do aparelho. Em Biblioteca, **Exportar arquivo** gera um JSON com library + progresso; **Importar arquivo** mescla por LWW (`updated_at`, depois `device_id`). O arquivo tem SHA-256 do payload canônico.
- **Pago:** mesmo `sync::merge`, trocando o transporte de arquivo por HTTP+JWT no seu servidor.
- URLs de add-ons **não** entram no arquivo exportado (podem conter tokens de configuração).

## Roadmap

- v0.2: `librqbit` (streaming torrent com seek), circuit breaker por add-on, watched bitfield.
- v1.0: player nativo (mpv / Media3), sync pago, updater, perfis locais, onboarding.
