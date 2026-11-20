/**
 * u-stream-mirror.palv.org
 *
 * O domínio não respondeu daqui (HTTP 000). O módulo fica registrado, mas
 * retorna null silenciosamente enquanto o host estiver fora — e portanto não
 * aparece no JSON, conforme o contrato "o que não retorna nada é ignorado".
 *
 * Ajuste USTREAM_BASE se o mirror mudar de endereço.
 */
import { createSniffProvider } from "./generic.mjs";

const BASE = process.env.USTREAM_BASE ?? "https://u-stream-mirror.palv.org";

export const { id, buildUrl, resolve } = createSniffProvider({
  id: "ustream",
  base: BASE,
  routes: {
    movie: "/movie/{id}",
    tv: "/tv/{id}/{season}/{episode}",
    anime: "/anime/{id}/{episode}",
  },
});
