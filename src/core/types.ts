// Espelho gerado dos tipos Rust por `npm run gen:types` (ts-rs). Nao editar a mao.

export interface Manifest {
  id: string;
  version: string;
  name: string;
  description?: string | null;
  logo?: string | null;
  background?: string | null;
  types: string[];
  resources: ResourceRef[];
  idPrefixes: string[];
  catalogs: CatalogRef[];
  extensions: Record<string, unknown>;
}

export type ResourceRef =
  | string
  | { name: string; types: string[]; idPrefixes: string[] };

export interface CatalogRef {
  type: string;
  id: string;
  name: string;
  extra: ExtraRef[];
}

export interface ExtraRef {
  name: string;
  isRequired: boolean;
  options: string[];
}

export interface Descriptor {
  manifest: Manifest;
  transportUrl: string;
}

export interface MetaPreview {
  id: string;
  type: string;
  name: string;
  poster?: string | null;
  posterShape?: string | null;
  background?: string | null;
  logo?: string | null;
  description?: string | null;
  releaseInfo?: string | null;
  imdbRating?: string | null;
  extensions: Record<string, unknown>;
}

export interface Video {
  id: string;
  title?: string | null;
  season?: number | null;
  episode?: number | null;
  released?: string | null;
  overview?: string | null;
  thumbnail?: string | null;
}

export interface Meta {
  id: string;
  type: string;
  name: string;
  poster?: string | null;
  background?: string | null;
  description?: string | null;
  releaseInfo?: string | null;
  imdbRating?: string | null;
  runtime?: string | null;
  released?: string | null;
  year?: string | null;
  genre: string[];
  director: string[];
  writer: string[];
  cast: string[];
  country?: string | null;
  videos: Video[];
  extensions: Record<string, unknown>;
}

export interface BehaviorHints {
  notWebReady: boolean;
  bingeGroup?: string | null;
  filename?: string | null;
  videoSize?: number | null;
  videoHash?: string | null;
  configurationRequired: boolean;
}

export interface Stream {
  url?: string | null;
  infoHash?: string | null;
  fileIdx?: number | null;
  externalUrl?: string | null;
  ytId?: string | null;
  name?: string | null;
  title?: string | null;
  behaviorHints?: BehaviorHints | null;
  extensions: Record<string, unknown>;
}

export interface Subtitle {
  id: string;
  url: string;
  lang: string;
}

export type StreamKind = "http" | "hls" | "torrent" | "youTube" | "external";

export interface ResolvedStream {
  url: string;
  kind: StreamKind;
  requiresNativePlayer: boolean;
}

export interface SeedStatus {
  allowed: boolean;
  active: boolean;
  remainingSecs: number;
  torrents: number;
}

export interface CacheStatus {
  usedBytes: number;
  limitBytes: number;
  torrents: number;
}

export interface LibraryItem {
  id: string;
  kind: string;
  name: string;
  poster?: string | null;
  favorite: boolean;
  watched: boolean;
  progress: number;
  updatedAt: number;
}

export interface SyncFileMeta {
  path: string;
  entries: number;
  checksum: string;
}

export interface ImportReport {
  applied: number;
  total: number;
  fromDevice: string;
}
