import { getConsent } from "../../core/consent";

/**
 * Desktop ad slot: loads an AdSense/GAM frame from the publisher's own HTTPS
 * domain, the same way Electron apps (e.g. CurseForge) render ads inline.
 * No external SDK is bundled — the frame is isolated by sandbox + CSP.
 */
export function DesktopAd() {
  if (!getConsent().terms) return null;

  return (
    <aside className="ad-slot desktop-only" aria-label="Sponsored">
      <iframe
        className="desktop-ad-frame"
        src="https://u-content.palv.org/ads/frame.html"
        title="Sponsored"
        sandbox="allow-scripts allow-same-origin"
        loading="lazy"
        referrerPolicy="no-referrer"
      />
    </aside>
  );
}
