import type { CSSProperties } from "react";
import type { MetaPreview } from "../../core/types";

interface Props {
  item: MetaPreview;
  onClick: () => void;
  progress?: number;
  compact?: boolean;
  index?: number;
}

export function MediaCard({ item, onClick, progress, compact, index = 0 }: Props) {
  return (
    <article
      className={`card animate-in ${compact ? "continue-card" : ""}`}
      style={{ "--i": index } as CSSProperties}
      onClick={onClick}
      title={item.name}
      role="button"
      tabIndex={0}
      onKeyDown={(event) => { if (event.key === "Enter") onClick(); }}
    >
      {item.poster ? (
        <img src={item.poster} alt={item.name} loading="lazy" decoding="async" />
      ) : (
        <div className="card-fallback">{item.name}</div>
      )}
      {item.imdbRating && <span className="rating">★ {item.imdbRating}</span>}
      <div className="card-body">
        <strong className="card-title">{item.name}</strong>
        <small>{item.releaseInfo ?? item.type}</small>
      </div>
      {progress !== undefined && progress > 0 && (
        <div className="progress-track"><i style={{ width: `${Math.min(100, progress * 100)}%` }} /></div>
      )}
    </article>
  );
}
