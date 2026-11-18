import { Gift, Play } from "lucide-react";
import { useState } from "react";
import { earnCredits, formatCredits, getCredits, REWARD_MINUTES } from "../../core/credits";

interface Props {
  compact?: boolean;
}

/** Visual placeholder for a future rewarded-ad integration. No network, no SDK. */
export function AdSlot({ compact }: Props) {
  const [balance, setBalance] = useState(getCredits());
  const [claimed, setClaimed] = useState(false);

  function watchAd() {
    const next = earnCredits(REWARD_MINUTES);
    setBalance(next);
    setClaimed(true);
    window.setTimeout(() => setClaimed(false), 2400);
  }

  return (
    <aside className={`ad-slot ${compact ? "ad-compact" : ""}`} aria-label="Sponsored">
      <div className="ad-art">
        <span className="ad-label">Sponsored</span>
        <Gift size={compact ? 18 : 24} />
        <strong>Ad placeholder</strong>
        {!compact && <small>Rewarded ads will appear here</small>}
      </div>
      <div className="ad-reward">
        <div>
          <strong>Watch an ad · +1h</strong>
          <small>Balance: {formatCredits(balance)} ucoins</small>
        </div>
        <button className="btn btn-primary btn-mini" onClick={watchAd} disabled={claimed}>
          <Play size={12} fill="currentColor" /> {claimed ? "+1h added" : "Watch"}
        </button>
      </div>
    </aside>
  );
}
