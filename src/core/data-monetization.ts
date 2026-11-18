import { MONETIZATION_ADAPTERS } from "./adapters";
import type { AdapterKind } from "./adapters";
import { getConsent, subscribeConsent } from "./consent";

/**
 * Adapter boundary for third-party monetization SDKs.
 *
 * Every adapter ships disabled (`configured: false`). Nothing starts until
 * both the vendor SDK/key is supplied AND the matching consent flag is on.
 */
export interface MonetizationAdapter {
  id: string;
  label: string;
  kind: AdapterKind;
  docs: string;
  configured?: boolean;
  start(): Promise<void>;
  stop(): Promise<void>;
  status(): Promise<{ active: boolean; earned?: number }>;
}

const adapters = new Set<MonetizationAdapter>(MONETIZATION_ADAPTERS);

export function registerAdapter(adapter: MonetizationAdapter): () => void {
  adapters.add(adapter);
  return () => adapters.delete(adapter);
}

function isAllowed(kind: AdapterKind): boolean {
  const consent = getConsent();
  if (kind === "bandwidth") return consent.bandwidthSharing;
  if (kind === "analytics") return consent.anonymousData;
  return consent.terms && consent.privacy;
}

export async function syncAdapters(): Promise<void> {
  for (const adapter of adapters) {
    const allowed = adapter.configured === true && isAllowed(adapter.kind);
    try {
      if (allowed) {
        await adapter.start();
      } else {
        await adapter.stop();
      }
    } catch {
      // A vendor must never break app startup.
    }
  }
}

export function watchConsent(): () => void {
  return subscribeConsent(() => {
    void syncAdapters();
  });
}

export function listAdapters(): MonetizationAdapter[] {
  return [...adapters];
}
