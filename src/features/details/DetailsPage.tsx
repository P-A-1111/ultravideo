import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Heart, Play } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../../core/bridge";
import type { Stream } from "../../core/types";
import { AdSlot } from "../../shared/ui/AdSlot";

export function DetailsPage() {
  const { kind = "movie", id = "" } = useParams();
  const navigate = useNavigate();
  const client = useQueryClient();

  const { data: meta, isLoading } = useQuery({
    queryKey: ["meta", kind, id],
    queryFn: () => api.getMeta(kind, decodeURIComponent(id)),
  });
  const { data: streams = [] } = useQuery({
    queryKey: ["streams", kind, id],
    queryFn: () => api.getStreams(kind, decodeURIComponent(id)),
  });
  const { data: library = [] } = useQuery({ queryKey: ["library"], queryFn: api.getLibrary });
  const favorite = library.some((item) => item.id === id && item.favorite);

  const favoriteMutation = useMutation({
    mutationFn: () =>
      api.toggleFavorite({
        id,
        kind,
        name: meta?.name ?? id,
        poster: meta?.poster,
      }),
    onSuccess: () => client.invalidateQueries({ queryKey: ["library"] }),
  });

  function play(stream: Stream) {
    navigate("/player", {
      state: {
        stream,
        info: { id, kind, name: meta?.name ?? id, poster: meta?.poster ?? null },
      },
    });
  }

  if (isLoading) {
    return <main className="page container"><div className="skeleton" style={{ height: 340, aspectRatio: "auto" }} /></main>;
  }

  if (!meta) {
    return (
      <main className="page container">
        <div className="empty"><strong>Metadata unavailable</strong><span>No add-on answered for this item.</span></div>
      </main>
    );
  }

  return (
    <main className="page container">
      <section
        className="hero-unit"
        style={meta.background ? { backgroundImage: `url("${meta.background.replace(/"/g, "%22")}")` } : undefined}
      >
        <div className="pad">
          <span className="badge">{kind === "series" ? "Series" : "Movie"}</span>
          <h1>{meta.name}</h1>
          <div className="meta-row">
            {meta.releaseInfo && <span>{meta.releaseInfo}</span>}
            {meta.runtime && <span>{meta.runtime}</span>}
            {meta.imdbRating && <span className="star">★ {meta.imdbRating}</span>}
            {meta.genre.slice(0, 3).map((genre) => <span key={genre}>{genre}</span>)}
          </div>
          {meta.description && <p className="lead">{meta.description}</p>}
          <div className="hero-actions">
            {streams[0] && (
              <button className="btn btn-primary" onClick={() => play(streams[0])}>
                <Play size={15} fill="currentColor" /> Watch
              </button>
            )}
            <button className="btn btn-outline" onClick={() => favoriteMutation.mutate()}>
              <Heart size={15} fill={favorite ? "currentColor" : "none"} />
              {favorite ? "In library" : "Add to library"}
            </button>
          </div>
        </div>
      </section>

      <AdSlot compact />

      <section className="section">
        <div className="section-head">
          <h2>Streams</h2>
          <span>{streams.length} source(s)</span>
        </div>
        {streams.length === 0 ? (
          <div className="empty"><strong>No streams</strong><span>Install a stream add-on.</span></div>
        ) : (
          <div className="stream-list">
            {streams.map((stream, index) => (
              <div className="stream-item" key={index}>
                <div className="stream-name">
                  {stream.name ?? stream.title ?? `Source ${index + 1}`}
                  <small>{stream.url?.slice(0, 80) ?? stream.infoHash ?? "external stream"}</small>
                </div>
                <button className="btn" onClick={() => play(stream)}>Watch</button>
              </div>
            ))}
          </div>
        )}
      </section>

      {meta.videos.length > 0 && (
        <section className="section">
          <div className="section-head"><h2>Videos</h2><span>{meta.videos.length}</span></div>
          <div className="stream-list">
            {meta.videos.map((video) => (
              <div className="stream-item" key={video.id}>
                <div className="stream-name">
                  {video.title ?? `S${video.season ?? 1}:E${video.episode ?? 1}`}
                  <small>{video.released ?? ""}</small>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
