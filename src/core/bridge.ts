import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrent, onOpenUrl } from "@tauri-apps/plugin-deep-link";
import type {
  Descriptor,
  ImportReport,
  LibraryItem,
  Meta,
  MetaPreview,
  CacheStatus,
  ResolvedStream,
  SeedStatus,
  Stream,
  Subtitle,
  SyncFileMeta,
} from "./types";

export const api = {
  listAddons: () => invoke<Descriptor[]>("list_addons"),
  installAddon: (url: string) =>
    invoke<Descriptor>("install_addon", { url }),
  uninstallAddon: (id: string) =>
    invoke<void>("uninstall_addon", { id }),

  getCatalog: (kind: string, catalog: string, extra: Record<string, string> = {}) =>
    invoke<MetaPreview[]>("get_catalog", { kind, catalog, extra }),
  getMeta: (kind: string, id: string) =>
    invoke<Meta | null>("get_meta", { kind, id }),
  getStreams: (kind: string, id: string) =>
    invoke<Stream[]>("get_streams", { kind, id }),
  getSubtitles: (kind: string, id: string, lang?: string) =>
    invoke<Subtitle[]>("get_subtitles", { kind, id, lang }),
  resolveStream: (stream: Stream) =>
    invoke<ResolvedStream>("resolve_stream", { stream }),
  addTorrent: (url: string, fileIdx?: number) =>
    invoke<ResolvedStream>("add_torrent", { url, fileIdx }),
  getCacheStatus: () => invoke<CacheStatus>("get_cache_status"),
  setSeedingAllowed: (allowed: boolean) => invoke<SeedStatus>("set_seeding_allowed", { allowed }),
  getSeedStatus: () => invoke<SeedStatus>("get_seed_status"),

  getLibrary: () => invoke<LibraryItem[]>("get_library"),
  toggleFavorite: (input: {
    id: string;
    kind: string;
    name: string;
    poster?: string | null;
  }) => invoke<LibraryItem>("toggle_favorite", input),
  markWatched: (input: {
    id: string;
    kind: string;
    name: string;
    poster?: string | null;
    watched: boolean;
  }) => invoke<LibraryItem>("mark_watched", input),
  saveProgress: (input: {
    id: string;
    kind: string;
    name: string;
    poster?: string | null;
    position: number;
    duration: number;
  }) => invoke<void>("save_progress", input),

  exportSyncFile: (path?: string) =>
    invoke<SyncFileMeta>("export_sync_file", { path }),
  importSyncFile: (path: string) =>
    invoke<ImportReport>("import_sync_file", { path }),
};

export const events = {
  onAddonsChanged: (callback: () => void) =>
    listen("uv://addons-changed", callback),
  onLibraryChanged: (callback: () => void) =>
    listen("uv://library-changed", callback),
  onPlaybackChanged: (callback: () => void) =>
    listen("uv://playback-changed", callback),
  onSyncChanged: (callback: () => void) =>
    listen("uv://sync-changed", callback),
  onDeepLink: (callback: (manifestUrl: string) => void) => {
    const handle = (urls: string[]) => {
      for (const url of urls) {
        const parsed = new URL(url);
        const manifest = parsed.searchParams.get("manifest");
        if (parsed.protocol === "ultravideo:" && manifest) {
          callback(manifest);
        }
      }
    };
    return Promise.all([
      onOpenUrl(handle),
      getCurrent().then((urls) => { if (urls) handle(urls); }),
    ]).then(([unlisten]) => unlisten);
  },
};
