import sdk from "stremio-addon-sdk";

const { addonBuilder, serveHTTP } = sdk;

const manifest = {
  id: "org.palv.ultra.addon.test",
  version: "1.0.0",
  name: "PALV · Add-on de teste",
  description: "Add-on local para validar o protocolo do ultravideo",
  resources: ["catalog", "meta", "stream", "subtitles"],
  types: ["movie", "series"],
  idPrefixes: ["tt"],
  catalogs: [
    {
      type: "movie",
      id: "palv.popular",
      name: "Populares (teste)",
      extra: [
        { name: "search", isRequired: false, options: [] },
        { name: "skip", isRequired: false, options: [] },
      ],
    },
  ],
};

const CATALOG = [
  {
    id: "tt0111161",
    type: "movie",
    name: "Um Sonho de Liberdade",
    poster: "https://image.tmdb.org/t/p/w500/9cqNxx0GxF0bflZmeSMuL5tnGzr.jpg",
    background: "https://image.tmdb.org/t/p/w1280/kXfqcdQKsToO0OUXHcrrNCHDBzO.jpg",
    releaseInfo: "1994",
    imdbRating: "9.3",
  },
  {
    id: "tt0468569",
    type: "movie",
    name: "Batman: O Cavaleiro das Trevas",
    poster: "https://image.tmdb.org/t/p/w500/qJ2tW6WMUDux911r6m7haRef0WH.jpg",
    releaseInfo: "2008",
    imdbRating: "9.0",
  },
  {
    id: "tt1375666",
    type: "movie",
    name: "A Origem",
    poster: "https://image.tmdb.org/t/p/w500/oYuLEt3zVCKq57qu2F8dT7NIa6f.jpg",
    releaseInfo: "2010",
    imdbRating: "8.8",
  },
];

const builder = new addonBuilder(manifest);

builder.defineCatalogHandler(async ({ extra }) => {
  let metas = CATALOG;
  const term = extra?.search?.toString().toLowerCase();
  if (term) metas = metas.filter((item) => item.name.toLowerCase().includes(term));
  const skip = Number(extra?.skip ?? 0);
  return { metas: metas.slice(skip, skip + 20) };
});

builder.defineMetaHandler(async ({ id }) => {
  const preview = CATALOG.find((item) => item.id === id) ?? CATALOG[0];
  return {
    meta: {
      ...preview,
      runtime: "142 min",
      released: "1994-10-14T00:00:00.000Z",
      genre: ["Drama"],
      director: ["Frank Darabont"],
      cast: ["Tim Robbins", "Morgan Freeman"],
      country: "USA",
      videos: [{ id: `${id}:1:1`, title: "Piloto", season: 1, episode: 1 }],
    },
  };
});

builder.defineStreamHandler(async () => ({
  streams: [
    {
      name: "HLS de teste",
      title: "Big Buck Bunny (hls.js)",
      url: "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8",
      behaviorHints: {},
    },
  ],
}));

builder.defineSubtitlesHandler(async () => ({ subtitles: [] }));

serveHTTP(builder.getInterface(), { port: 7000, cors: true });
console.log("Add-on de teste: http://localhost:7000/manifest.json");
