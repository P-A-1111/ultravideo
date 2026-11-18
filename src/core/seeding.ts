export interface SeedGuardResult {
  ok: boolean;
  reason: string;
}

/** Guardrails before enabling background seeding: Wi-Fi + charging/battery. */
export async function checkSeedGuard(): Promise<SeedGuardResult> {
  const nav = navigator as Navigator & {
    getBattery?: () => Promise<{ charging: boolean; level: number }>;
    connection?: { type?: string };
  };

  if (nav.getBattery) {
    const battery = await nav.getBattery();
    if (!battery.charging && battery.level < 0.5) {
      return { ok: false, reason: "Bateria abaixo de 50% e sem carregar" };
    }
  }

  const type = nav.connection?.type;
  if (type && type !== "wifi" && type !== "ethernet") {
    return { ok: false, reason: "Requer Wi-Fi" };
  }

  return { ok: true, reason: "OK" };
}

export function formatRemaining(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return `${hours}h ${minutes}m`;
}
