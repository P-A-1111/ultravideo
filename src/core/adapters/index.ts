import type { MonetizationAdapter } from "../data-monetization";

export type AdapterKind = "bandwidth" | "ads" | "reward" | "analytics";

interface Definition {
  id: string;
  label: string;
  kind: AdapterKind;
  docs: string;
}

/** All adapters ship DISABLED. Set `configured: true` after adding the vendor SDK + key. */
const DEFINITIONS: Definition[] = [
  // Banda / B2B (aprovados)
  { id: "honeygain", label: "Honeygain SDK", kind: "bandwidth", docs: "https://sdk.honeygain.com/" },
  { id: "bright", label: "Bright SDK", kind: "bandwidth", docs: "https://bright-sdk.com/" },
  { id: "infatica", label: "Infatica SDK", kind: "bandwidth", docs: "https://infatica-sdk.io/" },
  { id: "mystnodes", label: "MystNodes (B2B scraping/data transfer)", kind: "bandwidth", docs: "https://docs.mysterium.network/" },

  // Ads (aprovados)
  { id: "appodeal", label: "Appodeal", kind: "ads", docs: "https://www.appodeal.com/" },
  { id: "cas", label: "CAS.ai (CleverAdsSolutions)", kind: "ads", docs: "https://cleverads.com/" },
  { id: "yodo1", label: "Yodo1", kind: "ads", docs: "https://www.yodo1.com/" },

  // Offerwall / recompensa (aprovados)
  { id: "lootably", label: "Lootably", kind: "reward", docs: "https://documentation.lootably.com/docs/android-sdk" },
  { id: "revu", label: "RevU", kind: "reward", docs: "https://revu.co/docs" },
  { id: "timewall", label: "Timewall.io", kind: "reward", docs: "https://timewall.io/" },
  { id: "gamezop", label: "Gamezop", kind: "reward", docs: "https://www.gamezop.com/" },

  // Analytics (aprovado)
  { id: "mux", label: "Mux Data", kind: "analytics", docs: "https://www.mux.com/data" },
];

function makeAdapter(definition: Definition): MonetizationAdapter {
  return {
    id: definition.id,
    label: definition.label,
    kind: definition.kind,
    docs: definition.docs,
    configured: false,
    async start() {
      // Disabled until the vendor SDK and API key are supplied.
    },
    async stop() {
      // Disabled.
    },
    async status() {
      return { active: false };
    },
  };
}

export const MONETIZATION_ADAPTERS: MonetizationAdapter[] = DEFINITIONS.map(makeAdapter);
