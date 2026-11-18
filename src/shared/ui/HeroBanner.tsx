import { Heart, Play } from "lucide-react";
import type { MetaPreview } from "../../core/types";

interface Props {
  item?: MetaPreview;
  inList?: boolean;
  onWatch: () => void;
  onMyList: () => void;
}

export function HeroBanner({ item, inList, onWatch, onMyList }: Props) {
  const background = item?.background ?? item?.poster;
  const style = background
    ? { backgroundImage: `url("${background.replace(/"/g, "%22")}")` }
    : undefined;

  return (
    <section className="hero" style={style}>
      <div className="pad hero-inner animate-in">
        <span className="badge">{item ? (item.type === "series" ? "Série em destaque" : "Destaque") : "Bem-vindo"}</span>
        <h1>{item?.name ?? "SUA TELA, SEU CONTEÚDO"}</h1>
        <div className="hero-meta">
          {item?.releaseInfo && <span>{item.releaseInfo}</span>}
          <span>2h 15m</span>
          <span>{item?.type === "series" ? "Série" : "Sci-Fi"}</span>
          {item?.imdbRating && <span className="star">★ {item.imdbRating}</span>}
        </div>
        <p>
          {item?.description ??
            "Descubra filmes, séries e canais em um só lugar. Instale add-ons, monte sua biblioteca e continue assistindo em qualquer aparelho."}
        </p>
        <div className="hero-actions">
          <button className="btn btn-primary" onClick={onWatch} disabled={!item}>
            <Play size={16} fill="currentColor" /> Assistir agora
          </button>
          <button className="btn btn-outline" onClick={onMyList} disabled={!item}>
            <Heart size={16} fill={inList ? "currentColor" : "none"} />
            {inList ? "Na minha lista" : "+ Minha lista"}
          </button>
        </div>
      </div>
    </section>
  );
}
