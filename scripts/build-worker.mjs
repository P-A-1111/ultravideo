// Bundle + minify do Worker (Cloudflare) usando esbuild (já vem via Vite).
import { build } from "esbuild";

await build({
  entryPoints: ["worker/index.mjs"],
  bundle: true,
  minify: true,
  format: "esm",
  target: "es2022",
  platform: "neutral",
  conditions: ["worker", "browser"],
  outfile: "dist-worker/index.js",
  logLevel: "info",
});
