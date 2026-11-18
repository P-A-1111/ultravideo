/** Local simulated credit balance. No real currency, no payout, no ad SDK. */
const KEY = "uv.credits.minutes";

type Listener = (minutes: number) => void;
const listeners = new Set<Listener>();

export const REWARD_MINUTES = 60;
export const DAILY_CAP_MINUTES = 180;

export function getCredits(): number {
  return Number(localStorage.getItem(KEY) ?? 0);
}

function set(minutes: number) {
  localStorage.setItem(KEY, String(Math.max(0, minutes)));
  for (const listener of listeners) listener(minutes);
}

export function earnCredits(minutes = REWARD_MINUTES): number {
  const current = getCredits();
  const next = Math.min(current + minutes, DAILY_CAP_MINUTES);
  set(next);
  return next;
}

export function spendCredits(minutes: number): boolean {
  const current = getCredits();
  if (current < minutes) return false;
  set(current - minutes);
  return true;
}

export function subscribeCredits(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function formatCredits(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours}h ${rest}m` : `${hours}h`;
}
