/**
 * Server-driven UI, the safe way.
 *
 * The server sends a SIGNED JSON descriptor. It never sends HTML, CSS or JS.
 * Every value is rendered by local React components as plain text or validated
 * CSS color tokens, so a compromised server cannot execute code in the WebView.
 */

export interface RemoteUIConfig {
  version: number;
  updatedAt?: string;
  theme?: { accent?: string; accentHi?: string; accentDark?: string };
  copy?: Record<string, string>;
  sections?: Record<string, { title?: string; enabled?: boolean }>;
}

interface Envelope {
  algorithm: "ECDSA-P256-SHA256";
  payload: string;
  signature: string;
}

const URL_KEY = "uv.remoteUiUrl";
const KEY_KEY = "uv.remoteUiPublicKey";
const CACHE_KEY = "uv.remoteUiCache";

const HEX = /^#[0-9a-fA-F]{6}$/;

let active: RemoteUIConfig | null = null;

export function getRemoteUiUrl(): string {
  return (
    localStorage.getItem(URL_KEY) ??
    import.meta.env.VITE_REMOTE_UI_URL ??
    "https://u-content.palv.org/ui/envelope.json"
  );
}

export function setRemoteUiUrl(url: string): void {
  localStorage.setItem(URL_KEY, url.trim());
}

const DEFAULT_PUBLIC_KEY =
  "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEvs2ENHYdMOZH3f9BrB+FgXh80getqZlpqsyohzBZdLYX3PBuvu8aTuzcOzRfdshYwRrgKn+5rQS8MIRCMQTpVw==";

export function getPublicKey(): string {
  return localStorage.getItem(KEY_KEY) ?? import.meta.env.VITE_UI_PUBLIC_KEY ?? DEFAULT_PUBLIC_KEY;
}

export function setPublicKey(key: string): void {
  localStorage.setItem(KEY_KEY, key.trim());
}

export function getActiveConfig(): RemoteUIConfig | null {
  return active;
}

/** Translated string override. Always rendered as text, never as HTML. */
export function t(key: string, fallback: string): string {
  return active?.copy?.[key] ?? fallback;
}

export function loadCached(): RemoteUIConfig | null {
  const raw = localStorage.getItem(CACHE_KEY);
  if (!raw) return null;
  try {
    active = validate(JSON.parse(raw));
    applyTheme(active);
    return active;
  } catch {
    localStorage.removeItem(CACHE_KEY);
    return null;
  }
}

export function disable(): void {
  active = null;
  localStorage.removeItem(CACHE_KEY);
  document.documentElement.style.removeProperty("--accent");
  document.documentElement.style.removeProperty("--accent-hi");
  document.documentElement.style.removeProperty("--accent-dark");
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64ToBytes(input: string): Uint8Array {
  const normalized = input.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function validate(input: unknown): RemoteUIConfig {
  if (typeof input !== "object" || input === null) throw new Error("Invalid descriptor");
  const raw = input as Record<string, unknown>;
  if (typeof raw.version !== "number" || raw.version < 1) throw new Error("Unsupported descriptor version");

  const result: RemoteUIConfig = { version: raw.version };

  if (typeof raw.updatedAt === "string") result.updatedAt = raw.updatedAt.slice(0, 40);

  if (raw.theme && typeof raw.theme === "object") {
    const theme = raw.theme as Record<string, unknown>;
    const color = (value: unknown) => (typeof value === "string" && HEX.test(value) ? value : undefined);
    result.theme = {
      accent: color(theme.accent),
      accentHi: color(theme.accentHi),
      accentDark: color(theme.accentDark),
    };
  }

  if (raw.copy && typeof raw.copy === "object") {
    result.copy = {};
    for (const [key, value] of Object.entries(raw.copy)) {
      if (typeof value === "string" && value.length <= 200 && /^[a-zA-Z0-9.]+$/.test(key)) {
        result.copy[key] = value;
      }
    }
  }

  if (raw.sections && typeof raw.sections === "object") {
    result.sections = {};
    for (const [key, value] of Object.entries(raw.sections)) {
      if (typeof value !== "object" || value === null || !/^[a-zA-Z0-9.]+$/.test(key)) continue;
      const section = value as Record<string, unknown>;
      result.sections[key] = {
        title: typeof section.title === "string" ? section.title.slice(0, 80) : undefined,
        enabled: typeof section.enabled === "boolean" ? section.enabled : undefined,
      };
    }
  }

  return result;
}

function applyTheme(config: RemoteUIConfig): void {
  if (!config.theme) return;
  const root = document.documentElement;
  if (config.theme.accent) root.style.setProperty("--accent", config.theme.accent);
  if (config.theme.accentHi) root.style.setProperty("--accent-hi", config.theme.accentHi);
  if (config.theme.accentDark) root.style.setProperty("--accent-dark", config.theme.accentDark);
}

export async function loadRemoteUi(url: string): Promise<RemoteUIConfig> {
  const publicKey = getPublicKey();
  if (!publicKey) throw new Error("Configure the public key first");
  if (!/^https:\/\//.test(url)) throw new Error("Only HTTPS endpoints are allowed");

  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const envelope = (await response.json()) as Envelope;

  if (envelope.algorithm !== "ECDSA-P256-SHA256") throw new Error("Unsupported signature algorithm");
  if (typeof envelope.payload !== "string" || typeof envelope.signature !== "string") {
    throw new Error("Malformed envelope");
  }

  const cryptoKey = await crypto.subtle.importKey(
    "spki",
    base64ToBytes(publicKey),
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["verify"],
  );

  const payloadBytes = base64ToBytes(envelope.payload);
  const valid = await crypto.subtle.verify(
    { name: "ECDSA", hash: "SHA-256" },
    cryptoKey,
    base64ToBytes(envelope.signature),
    payloadBytes,
  );
  if (!valid) throw new Error("Invalid signature — descriptor rejected");

  const parsed = validate(JSON.parse(new TextDecoder().decode(payloadBytes)));
  active = parsed;
  applyTheme(parsed);
  localStorage.setItem(CACHE_KEY, JSON.stringify(parsed));
  setRemoteUiUrl(url);
  return parsed;
}

export { bytesToBase64Url };
