/** vidy.st — rotas conforme https://www.vidy.st/#docs */
import { createSniffProvider } from "./generic.mjs";

export const { id, buildUrl, resolve } = createSniffProvider({
  id: "vidy",
  base: "https://vidy.st",
  routes: {
    movie: "/movie/{id}",
    tv: "/tv/{id}/{season}/{episode}",
    anime: "/anime/{id}/{episode}",
  },
});
