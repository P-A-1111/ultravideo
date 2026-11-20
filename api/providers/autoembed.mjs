/** watch-v2.autoembed.app — rotas reais: /movie/{id}/watch e /tv/{id}/watch (200 confirmado). */
import { createSniffProvider } from "./generic.mjs";

export const { id, buildUrl, resolve } = createSniffProvider({
  id: "autoembed",
  base: "https://watch-v2.autoembed.app",
  routes: {
    movie: "/movie/{id}/watch",
    tv: "/tv/{id}/watch",
    // não existe rota de anime neste domínio
    anime: null,
  },
});
