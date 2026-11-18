// Minifica CSS/JS/HTML da landing e copia os SVGs para dist-landing/.
import { build } from "esbuild";
import { readFileSync, writeFileSync, mkdirSync, copyFileSync } from "node:fs";

mkdirSync("dist-landing/assets", { recursive: true });
mkdirSync("dist-landing/video", { recursive: true });

await build({
  entryPoints: ["landing/assets/style.css"],
  outfile: "dist-landing/assets/style.min.css",
  minify: true,
});

await build({
  entryPoints: ["landing/assets/app.js"],
  outfile: "dist-landing/assets/app.min.js",
  minify: true,
  format: "iife",
  target: "es2020",
});

for (const file of ["mark.svg", "wordmark.svg"]) {
  copyFileSync(`landing/assets/${file}`, `dist-landing/assets/${file}`);
}

for (const [source, output] of [
  ["landing/index.html", "dist-landing/index.html"],
  ["landing/video/index.html", "dist-landing/video/index.html"],
]) {
  let html = readFileSync(source, "utf8");
  html = html.replace(">\s+<", "><").replace(/[ \t]{2,}/g, " ").trim() + "\n";
  writeFileSync(output, html);
}

console.log("landing minificada em dist-landing/");
