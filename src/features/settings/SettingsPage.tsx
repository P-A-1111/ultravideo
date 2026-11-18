import { Coins, Download, RefreshCw, ShieldCheck, Upload, User } from "lucide-react";
import { open, save } from "@tauri-apps/plugin-dialog";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import logo from "../../assets/uvideo-logo-sm.png";
import { api } from "../../core/bridge";
import { earnCredits, formatCredits, getCredits, REWARD_MINUTES } from "../../core/credits";
import { checkSeedGuard, formatRemaining } from "../../core/seeding";
import { getConsent, setConsent, type ConsentState } from "../../core/consent";
import type { SeedStatus } from "../../core/types";
import { listAdapters } from "../../core/data-monetization";
import {
  disable as disableRemoteUi,
  getActiveConfig,
  getPublicKey,
  getRemoteUiUrl,
  loadCached,
  loadRemoteUi,
  setPublicKey,
} from "../../core/remote-ui";

const PALETTES = [
  { id: "violet", label: "Violet", accent: "#8b5cf6", hi: "#a78bfa", dark: "#6d28d9" },
  { id: "indigo", label: "Indigo", accent: "#6366f1", hi: "#818cf8", dark: "#4338ca" },
  { id: "rose", label: "Rose", accent: "#ec4899", hi: "#f472b6", dark: "#be185d" },
  { id: "cyan", label: "Cyan", accent: "#06b6d4", hi: "#22d3ee", dark: "#0e7490" },
  { id: "amber", label: "Amber", accent: "#f59e0b", hi: "#fbbf24", dark: "#b45309" },
];

function applyPalette(id: string) {
  const palette = PALETTES.find((item) => item.id === id) ?? PALETTES[0];
  const root = document.documentElement;
  root.style.setProperty("--accent", palette.accent);
  root.style.setProperty("--accent-hi", palette.hi);
  root.style.setProperty("--accent-dark", palette.dark);
  localStorage.setItem("uv.accent", id);
}

export function SettingsPage() {
  const navigate = useNavigate();
  const client = useQueryClient();
  const [palette, setPalette] = useState(() => localStorage.getItem("uv.accent") ?? "violet");
  const [notice, setNotice] = useState<{ text: string; ok: boolean } | null>(null);
  const [url, setUrl] = useState(() => getRemoteUiUrl());
  const [publicKey, setPublicKeyState] = useState(() => getPublicKey());
  const [remoteStatus, setRemoteStatus] = useState(() => getActiveConfig()?.version ?? null);
  const [creditBalance, setCreditBalance] = useState(getCredits());
  const [seed, setSeed] = useState<SeedStatus | null>(null);
  const [consent, setConsentState] = useState<ConsentState>(getConsent);

  useEffect(() => {
    const cached = loadCached();
    if (cached) setRemoteStatus(cached.version);
    void api.getSeedStatus().then(setSeed).catch(() => undefined);
  }, []);

  async function toggleSeeding() {
    if (seed?.allowed) {
      setSeed(await api.setSeedingAllowed(false));
      setNotice({ text: "Seeding desligado.", ok: true });
      return;
    }
    const guard = await checkSeedGuard();
    if (!guard.ok) {
      setNotice({ text: guard.reason, ok: false });
      return;
    }
    setSeed(await api.setSeedingAllowed(true));
    setNotice({ text: "Seeding ativo por até 24h. Você pode desligar aqui.", ok: true });
  }

  const exportMutation = useMutation({
    mutationFn: async () => {
      const target = await save({
        defaultPath: `ultravideo-sync-${Date.now()}.json`,
        filters: [{ name: "ultravideo sync", extensions: ["json"] }],
      });
      return target && !Array.isArray(target) ? api.exportSyncFile(target) : null;
    },
    onSuccess: (result) => {
      if (result) setNotice({ text: `${result.entries} items saved to ${result.path}`, ok: true });
    },
    onError: (error) => setNotice({ text: String(error), ok: false }),
  });

  const importMutation = useMutation({
    mutationFn: async () => {
      const source = await open({ multiple: false, filters: [{ name: "ultravideo sync", extensions: ["json"] }] });
      return source && !Array.isArray(source) ? api.importSyncFile(source) : null;
    },
    onSuccess: (result) => {
      if (!result) return;
      client.invalidateQueries({ queryKey: ["library"] });
      setNotice({ text: `${result.applied}/${result.total} items merged.`, ok: true });
    },
    onError: (error) => setNotice({ text: String(error), ok: false }),
  });

  const remoteMutation = useMutation({
    mutationFn: () => {
      setPublicKey(publicKey);
      return loadRemoteUi(url);
    },
    onSuccess: (config) => {
      setRemoteStatus(config.version);
      setNotice({ text: `Remote descriptor v${config.version} applied.`, ok: true });
    },
    onError: (error) => setNotice({ text: String(error), ok: false }),
  });

  return (
    <main className="page container">
      <ul className="breadcrumb desktop-only">
        <li>Home</li><li>/</li><li>Settings</li>
      </ul>

      <section className="panel">
        <div className="panel-head">Appearance</div>
        <div className="panel-body">
          <div className="setting-row">
            <div><strong>Accent color</strong><small>Applied instantly across the app</small></div>
            <div style={{ display: "flex", gap: 8 }}>
              {PALETTES.map((item) => (
                <button
                  key={item.id}
                  className={`swatch ${palette === item.id ? "active" : ""}`}
                  style={{ background: `linear-gradient(180deg, ${item.hi}, ${item.dark})` }}
                  title={item.label}
                  aria-label={item.label}
                  onClick={() => { applyPalette(item.id); setPalette(item.id); }}
                />
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="panel">
        <div className="panel-head">ucoins · credits</div>
        <div className="panel-body">
          <div className="setting-row">
            <div>
              <strong>{formatCredits(creditBalance)} available</strong>
              <small>Watch a rewarded ad to earn +1h of free watching</small>
            </div>
            <button
              className="btn btn-primary btn-mini"
              onClick={() => setCreditBalance(earnCredits(REWARD_MINUTES))}
            >
              <Coins size={13} /> Earn 1h
            </button>
          </div>
          <div className="well" style={{ marginTop: 8 }}>
            Credits are in-app only: non-transferable and not redeemable for money. Contributor payouts are handled outside the app through a separate fund.
          </div>
        </div>
      </section>

      <section className="panel">
        <div className="panel-head">Seeding · opt-in</div>
        <div className="panel-body">
          <div className="well" style={{ marginBottom: 12 }}>
            Compartilha apenas os arquivos que você baixou, por até 24h, em segundo plano.
            Desligado por padrão. Só funciona com Wi-Fi e bateria acima de 50% (ou carregando).
          </div>
          <div className="setting-row">
            <div>
              <strong>{seed?.active ? "Ativo" : "Desativado"}</strong>
              <small>
                {seed?.active
                  ? `${formatRemaining(seed.remainingSecs)} restantes · ${seed.torrents} torrent(s)`
                  : "Nenhum arquivo sendo semeado"}
              </small>
            </div>
            <button className="btn btn-primary btn-mini" onClick={() => void toggleSeeding()}>
              {seed?.allowed ? "Desligar" : "Ativar"}
            </button>
          </div>
        </div>
      </section>

      <section className="panel">
        <div className="panel-head">Privacy &amp; data</div>
        <div className="panel-body">
          <div className="setting-row">
            <div>
              <strong>Anonymous data</strong>
              <small>Aggregated counters only, for service improvement</small>
            </div>
            <button
              className={`swatch ${consent.anonymousData ? "active" : ""}`}
              style={{ width: 30, height: 30, borderRadius: 6, background: consent.anonymousData ? "var(--accent)" : "#2a2a38" }}
              aria-label="Toggle anonymous data"
              onClick={() => setConsentState(setConsent({ anonymousData: !consent.anonymousData }))}
            />
          </div>
          <div className="setting-row">
            <div>
              <strong>Share unused bandwidth</strong>
              <small>Uses your connection/IP — separate, revocable consent</small>
            </div>
            <button
              className={`swatch ${consent.bandwidthSharing ? "active" : ""}`}
              style={{ width: 30, height: 30, borderRadius: 6, background: consent.bandwidthSharing ? "var(--accent)" : "#2a2a38" }}
              aria-label="Toggle bandwidth sharing"
              onClick={() => setConsentState(setConsent({ bandwidthSharing: !consent.bandwidthSharing }))}
            />
          </div>
          <div className="well">
            {listAdapters().filter((adapter) => adapter.configured).length === 0
              ? `${listAdapters().length} monetization adapters registered — all disabled. Add the vendor SDK + API key to activate one.`
              : `${listAdapters().filter((adapter) => adapter.configured).length} SDK(s) connected.`}
          </div>
        </div>
      </section>

      <section className="panel">
        <div className="panel-head">Account</div>
        <div className="panel-body">
          <div className="setting-row">
            <div><strong>Sign in</strong><small>Sync your library and continue watching</small></div>
            <button className="btn btn-primary btn-mini" onClick={() => navigate("/login")}>
              <User size={13} /> Discord
            </button>
          </div>
        </div>
      </section>

      <section className="panel">
        <div className="panel-head">Remote UI · signed descriptors</div>
        <div className="panel-body">
          <div className="well" style={{ marginBottom: 14 }}>
            <ShieldCheck size={14} style={{ verticalAlign: "-2px", marginRight: 6 }} />
            Only signed JSON descriptors are accepted. No remote HTML, CSS or JS is ever executed.
          </div>
          <div className="setting-row">
            <div><strong>Descriptor URL</strong><small>HTTPS only</small></div>
            <input className="input" style={{ maxWidth: 340 }} value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://..." aria-label="Descriptor URL" />
          </div>
          <div className="setting-row">
            <div><strong>Public key</strong><small>Base64 SPKI · ECDSA P-256</small></div>
            <input className="input" style={{ maxWidth: 340 }} value={publicKey} onChange={(event) => setPublicKeyState(event.target.value)} placeholder="MFkwEwYH..." aria-label="Public key" />
          </div>
          <div className="setting-row">
            <div>
              <strong>Status</strong>
              <small>{remoteStatus ? `Active descriptor v${remoteStatus}` : "Using local defaults"}</small>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button className="btn btn-primary btn-mini" disabled={remoteMutation.isPending} onClick={() => remoteMutation.mutate()}>
                <RefreshCw size={13} /> Load
              </button>
              <button className="btn btn-mini" onClick={() => { disableRemoteUi(); setRemoteStatus(null); setNotice({ text: "Remote UI disabled.", ok: true }); }}>
                Disable
              </button>
            </div>
          </div>
          {notice && <div className={`notice ${notice.ok ? "ok" : "error"}`} style={{ marginTop: 12 }}>{notice.text}</div>}
        </div>
      </section>

      <section className="panel">
        <div className="panel-head">Sync · local-first</div>
        <div className="panel-body">
          <div className="well" style={{ marginBottom: 14 }}>
            Your data stays on this device. Export the file and put it on Drive/Dropbox to use it on another device.
            Bidirectional merge with SHA-256 checksum. Add-on URLs are not exported.
          </div>
          <div style={{ display: "flex", gap: 9, flexWrap: "wrap" }}>
            <button className="btn btn-primary" disabled={exportMutation.isPending} onClick={() => exportMutation.mutate()}>
              <Download size={14} /> Export file
            </button>
            <button className="btn" disabled={importMutation.isPending} onClick={() => importMutation.mutate()}>
              <Upload size={14} /> Import file
            </button>
          </div>
          {notice && <div className={`notice ${notice.ok ? "ok" : "error"}`} style={{ marginTop: 12 }}>{notice.text}</div>}
        </div>
      </section>

      <section className="panel">
        <div className="panel-head">About</div>
        <div className="panel-body">
          <div style={{ padding: "2px 0 12px" }}>
            <img src={logo} alt="ultravideo" style={{ height: 30, width: "auto" }} />
          </div>
          <div className="setting-row"><div><strong>ultravideo</strong><small>v0.1.0 · Tauri v2 · Rust + React</small></div><span className="label">local-first</span></div>
          <div className="setting-row"><div><strong>Identifier</strong><small>org.palv.ultra.video</small></div></div>
          <div className="setting-row"><div><strong>Add-on protocol</strong><small>compatible with Stremio manifests</small></div></div>
        </div>
      </section>
    </main>
  );
}
