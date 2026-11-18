import type { MetaPreview } from "../../core/types";

interface Props {
  item: MetaPreview;
  onOpen: () => void;
  progress?: number;
}

export function PosterCard({ item, onOpen, progress }: Props) {
  return (
    <button className="poster-card" onClick={onOpen} title={item.name}>
      {item.poster ? (
        <img src={item.poster} alt={item.name} loading="lazy" />
      ) : (
        <div className="poster-fallback">{item.name}</div>
      )}
      <div className="poster-overlay">
        <strong>{item.name}</strong>
        {item.releaseInfo && <small>{item.releaseInfo}</small>}
      </div>
      {progress !== undefined && progress > 0 && (
        <div className="progress-line">
          <i style={{ width: `${Math.min(100, progress * 100)}%` }} />
        </div>
      )}
    </button>
  );
}
