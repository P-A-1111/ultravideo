import type HlsType from "hls.js";
import { ArrowLeft } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { api } from "../../core/bridge";
import type { ResolvedStream, Stream } from "../../core/types";

interface LocationState {
  stream: Stream;
  info: { id: string; kind: string; name: string; poster?: string | null };
}

export function PlayerPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const state = location.state as LocationState | null;
  const videoRef = useRef<HTMLVideoElement>(null);
  const lastSave = useRef(0);
  const [resolved, setResolved] = useState<ResolvedStream | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!state?.stream) {
      setError("Nenhum stream selecionado.");
      return;
    }
    const stream = state.stream;
    const magnet = stream.url?.startsWith("magnet:")
      ? stream.url
      : stream.infoHash
        ? `magnet:?xt=urn:btih:${stream.infoHash}`
        : null;

    const request = magnet
      ? api.addTorrent(magnet, stream.fileIdx ?? 0)
      : api.resolveStream(stream);

    request.then(setResolved).catch((reason) => setError(String(reason)));
  }, [state]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !resolved) return;

    let cancelled = false;
    let hls: HlsType | null = null;

    if (resolved.kind === "hls") {
      void import("hls.js").then(({ default: Hls }) => {
        if (cancelled) return;
        if (!Hls.isSupported()) {
          video.src = resolved.url;
          return;
        }
        hls = new Hls();
        hls.loadSource(resolved.url);
        hls.attachMedia(video);
      });
    } else {
      video.src = resolved.url;
    }

    return () => {
      cancelled = true;
      hls?.destroy();
      video.removeAttribute("src");
    };
  }, [resolved]);

  if (!state) {
    return <main className="page"><div className="notice error">Sessão de reprodução inválida.</div></main>;
  }

  const { info } = state;

  function onTimeUpdate() {
    const video = videoRef.current;
    if (!video || !Number.isFinite(video.duration)) return;
    const now = Date.now();
    if (now - lastSave.current < 10_000) return;
    lastSave.current = now;
    void api.saveProgress({
      id: info.id,
      kind: info.kind,
      name: info.name,
      poster: info.poster,
      position: video.currentTime,
      duration: video.duration,
    });
  }

  return (
    <main className="page container">
      <button className="btn" onClick={() => navigate(-1)} style={{ marginBottom: 16 }}>
        <ArrowLeft size={16} /> Voltar
      </button>

      {error && <div className="notice error">{error}</div>}

      {resolved?.requiresNativePlayer && resolved.kind !== "hls" ? (
        <div className="empty">
          <strong>Este stream exige player nativo</strong>
          <span>{resolved.url}</span>
          <a className="btn btn-primary" href={resolved.url} target="_blank" rel="noreferrer">Abrir externamente</a>
        </div>
      ) : (
        <div className="player-stage">
          <video ref={videoRef} controls autoPlay playsInline onTimeUpdate={onTimeUpdate} />
        </div>
      )}

      <div className="section-head" style={{ marginTop: 18 }}>
        <h2>{info.name}</h2>
        <span>{resolved?.kind ?? "resolvendo..."}</span>
      </div>
    </main>
  );
}
