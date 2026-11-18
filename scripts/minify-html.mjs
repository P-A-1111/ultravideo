// Post-build: minifica o index.html gerado (o Vite já minifica JS/CSS).
import { readFileSync, writeFileSync } from "node:fs";

const file = "dist/index.html";
let html = readFileSync(file, "utf8");

html = html.replace(/<!--[\s\S]*?-->/g, "");
html = html.replace(/>\s+</g, "><");
html = html.replace(/[ \t]{2,}/g, " ").trim() + "\n";

writeFileSync(file, html);
console.log(`index.html -> ${Buffer.byteLength(html)} bytes`);
