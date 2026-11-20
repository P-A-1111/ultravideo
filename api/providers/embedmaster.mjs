/** embedmaster.link — rotas conforme https://embedmaster.com/documentation/ */
import { createSniffProvider } from "./generic.mjs";

export const { id, buildUrl, resolve } = createSniffProvider({
  id: "embedmaster",
  base: "https://embedmaster.link",
  routes: {
    movie: "/movie/{id}",
    tv: "/tv/{id}/{season}/{episode}",
  },
});
