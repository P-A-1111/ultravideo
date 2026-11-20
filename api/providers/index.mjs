import * as multiembed from "./multiembed.mjs";
import * as ustream from "./ustream.mjs";
import * as vidy from "./vidy.mjs";
import * as autoembed from "./autoembed.mjs";
import * as embedmaster from "./embedmaster.mjs";

/** Ordem também define a prioridade padrão dos jobs em background. */
export const providers = [multiembed, ustream, vidy, autoembed, embedmaster];

export const providerIds = providers.map((provider) => provider.id);

export function getProvider(id) {
  return providers.find((provider) => provider.id === id) ?? null;
}
