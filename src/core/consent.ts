/** Local, revogable consent flags. Nothing leaves the device automatically. */
export interface ConsentState {
  terms: boolean;
  privacy: boolean;
  anonymousData: boolean;
  bandwidthSharing: boolean;
}

const KEY = "uv.consent";
const DEFAULT: ConsentState = {
  terms: false,
  privacy: false,
  anonymousData: false,
  bandwidthSharing: false,
};

type Listener = (state: ConsentState) => void;
const listeners = new Set<Listener>();

export function getConsent(): ConsentState {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT };
    return { ...DEFAULT, ...(JSON.parse(raw) as Partial<ConsentState>) };
  } catch {
    return { ...DEFAULT };
  }
}

export function setConsent(patch: Partial<ConsentState>): ConsentState {
  const next = { ...getConsent(), ...patch };
  localStorage.setItem(KEY, JSON.stringify(next));
  for (const listener of listeners) listener(next);
  return next;
}

export function hasAcceptedTerms(): boolean {
  const consent = getConsent();
  return consent.terms && consent.privacy;
}

export function subscribeConsent(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
