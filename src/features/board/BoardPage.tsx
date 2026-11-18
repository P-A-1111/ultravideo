import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, Film, Heart, Play, Tv } from "lucide-react";
import { useState, type CSSProperties } from "react";
import { useNavigate } from "react-router-dom";
import logoLarge from "../../assets/uvideo-logo-lg.png";
import { api } from "../../core/bridge";
import { AdSlot } from "../../shared/ui/AdSlot";
import { DesktopAd } from "../../shared/ui/DesktopAd";
import { CarouselRow } from "../../shared/ui/CarouselRow";
import { MediaCard } from "../../shared/ui/MediaCard";

export function BoardPage() {
  const navigate = useNavigate();
  const client = useQueryClient();
  const { data: addons = [] } = useQuery({ queryKey: ["addons"], queryFn: api.listAddons });
  const { data: library = [] } = useQuery({ queryKey: ["library"], queryFn: api.getLibrary });

  const catalogs = addons.flatMap((addon) =>
    addon.manifest.catalogs.map((catalog) => ({
      ...catalog,
      addonId: addon.manifest.id,
      addonName: addon.manifest.name,
    })),
  );

  const [active, setActive] = useState(0);
  const current = catalogs[active];
  const [email, setEmail] = useState("");

  const { data: items = [], isLoading } = useQuery({
    queryKey: ["catalog", current?.addonId, current?.id],
    queryFn: () => api.getCatalog(current!.type, current!.id),
    enabled: Boolean(current),
  });

  const favorite = useMutation({
    mutationFn: () => {
      if (!featured) return Promise.resolve(null);
      return api.toggleFavorite({
        id: featured.id,
        kind: featured.type,
        name: featured.name,
        poster: featured.poster,
      });
    },
    onSuccess: () => client.invalidateQueries({ queryKey: ["library"] }),
  });

  const featured = items[0];
  const continuing = library.filter((item) => item.progress > 0 && !item.watched).slice(0, 12);
  const inList = library.some((item) => item.id === featured?.id && item.favorite);
  const background = featured?.background ?? featured?.poster;

  function open(type: string, id: string) {
    navigate(`/details/${type}/${encodeURIComponent(id)}`);
  }

  return (
    <main className="page container">
      <section
        className="hero-unit animate-in"
        style={background ? { backgroundImage: `url("${background.replace(/"/g, "%22")}")` } : undefined}
      >
        <span className="badge">All in one place</span>
        <h1>Movies, series and TV <em>on ultravideo</em></h1>
        <p className="lead">
          {featured?.description ??
            "Discover, organize and watch. Free on your device, with file sync whenever you need it."}
        </p>

        <div className="hero-actions">
          <button className="btn btn-primary" disabled={!featured} onClick={() => featured && open(featured.type, featured.id)}>
            <Play size={15} fill="currentColor" /> Watch now
          </button>
          <button className="btn btn-outline" disabled={!featured} onClick={() => favorite.mutate()}>
            <Heart size={15} fill={inList ? "currentColor" : "none"} />
            {inList ? "In my list" : "+ My list"}
          </button>
        </div>

        <form className="signup desktop-only" onSubmit={(event) => { event.preventDefault(); if (email.trim()) navigate("/addons"); }}>
          <input className="input" type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="Your email" aria-label="Email" />
          <button className="btn btn-primary" type="submit">Get started »</button>
        </form>
        <div className="signup-hint desktop-only">Free to use · no card · your data stays on your device</div>

        <div className="trust-row desktop-only">
          <div className="trust-item">
            <Film size={23} />
            <div><strong>Thousands of titles</strong><small>catalogs via add-ons</small></div>
          </div>
          <div className="trust-item">
            <Tv size={23} />
            <div><strong>TV, tablet &amp; PC</strong><small>watch anywhere</small></div>
          </div>
          <div className="trust-item">
            <Download size={23} />
            <div><strong>Continue watching</strong><small>file or cloud sync</small></div>
          </div>
        </div>
      </section>

      <ul className="breadcrumb desktop-only">
        <li><a href="#" onClick={(event) => { event.preventDefault(); navigate("/"); }}>Home</a></li>
        <li>/</li>
        <li>Catalogs</li>
      </ul>

      {catalogs.length > 0 && (
        <div className="chips" style={{ marginTop: 16 }}>
          {catalogs.map((catalog, index) => (
            <button
              key={`${catalog.addonId}:${catalog.id}`}
              className={`chip ${index === active ? "active" : ""}`}
              onClick={() => setActive(index)}
            >
              {catalog.name}
            </button>
          ))}
        </div>
      )}

      {continuing.length > 0 && (
        <CarouselRow title="Continue watching" hint={`${continuing.length} titles`} index={1}>
          {continuing.map((item, index) => (
            <MediaCard
              key={item.id}
              index={index}
              compact
              progress={item.progress}
              item={{ id: item.id, type: item.kind, name: item.name, poster: item.poster, extensions: {} }}
              onClick={() => open(item.kind, item.id)}
            />
          ))}
        </CarouselRow>
      )}

      <CarouselRow title={`Popular · ${current?.name ?? "ultravideo"}`} hint={current?.addonName} index={2}>
        {isLoading
          ? Array.from({ length: 8 }, (_, index) => <div className="skeleton" key={index} />)
          : items.slice(0, 24).map((item, index) => (
              <MediaCard key={`${item.type}:${item.id}`} index={index} item={item} onClick={() => open(item.type, item.id)} />
            ))}
      </CarouselRow>

      <AdSlot />
      <DesktopAd />

      {items.length > 0 && (
        <CarouselRow title="Trending on ultravideo" hint="trending" index={3}>
          {[...items].reverse().slice(0, 24).map((item, index) => (
            <MediaCard key={`trend:${item.type}:${item.id}`} index={index} item={item} onClick={() => open(item.type, item.id)} />
          ))}
        </CarouselRow>
      )}

      {items.length > 0 && (
        <section className="panel">
          <div className="panel-head">Featured</div>
          <div className="panel-body">
            <div className="premium-grid">
              {items.slice(0, 14).map((item, index) => (
                <div key={`grid:${item.id}`} style={{ "--i": index } as CSSProperties} className="animate-in">
                  <MediaCard item={item} onClick={() => open(item.type, item.id)} />
                </div>
              ))}
            </div>
            <button className="btn more-btn" onClick={() => navigate("/discover")}>View more titles »</button>
          </div>
        </section>
      )}

      {addons.length === 0 && (
        <div className="well" style={{ marginTop: 18, textAlign: "center" }}>
          <img src={logoLarge} alt="ultravideo" style={{ height: 42, width: "auto", margin: "2px auto 8px" }} />
          <strong style={{ color: "var(--text)" }}>No add-ons installed</strong>
          <div style={{ marginTop: 10 }}>
            <button className="btn btn-primary" onClick={() => navigate("/addons")}>
              <Play size={13} /> Install an add-on
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
