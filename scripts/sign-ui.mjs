// Signs a remote UI descriptor for the ultravideo app.
// Usage: UI_PRIVATE_KEY=<base64 PKCS8> node scripts/sign-ui.mjs config.json envelope.json
import { readFileSync, writeFileSync } from "node:fs";
import { createPrivateKey, sign } from "node:crypto";

const [, , inputPath, outputPath] = process.argv;
const privateKeyBase64 = process.env.UI_PRIVATE_KEY;

if (!inputPath || !outputPath || !privateKeyBase64) {
  console.error("Usage: UI_PRIVATE_KEY=<base64 PKCS8> node scripts/sign-ui.mjs <config.json> <envelope.json>");
  process.exit(1);
}

const config = JSON.parse(readFileSync(inputPath, "utf8"));
const payload = Buffer.from(JSON.stringify(config)).toString("base64url");

const key = createPrivateKey({
  key: Buffer.from(privateKeyBase64, "base64"),
  format: "der",
  type: "pkcs8",
});

const signature = sign("sha256", Buffer.from(payload, "utf8"), key).toString("base64url");

writeFileSync(outputPath, JSON.stringify({ algorithm: "ECDSA-P256-SHA256", payload, signature }, null, 2) + "\n");
console.log(`Signed descriptor written to ${outputPath}`);
