// Upload de assets estaticos para o R2 via API S3-compatible.
// Requer: @aws-sdk/client-s3 (devDependency) e credenciais de API Token do R2.
//
// Env:
//   R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY
//   R2_BUCKET (default: ultra-content)
//   APK_PATH (opcional) — caminho do APK para subir como /apk/<nome>
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { readFileSync, existsSync } from "node:fs";

const accountId = process.env.R2_ACCOUNT_ID;
const accessKey = process.env.R2_ACCESS_KEY_ID;
const secretKey = process.env.R2_SECRET_ACCESS_KEY;
const bucket = process.env.R2_BUCKET ?? "ultra-content";

if (!accountId || !accessKey || !secretKey) {
  console.error("Defina R2_ACCOUNT_ID, R2_ACCESS_KEY_ID e R2_SECRET_ACCESS_KEY.");
  process.exit(1);
}

const client = new S3Client({
  region: "auto",
  endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: accessKey, secretAccessKey: secretKey },
});

const FILES = [
  ["design/ads-frame.html", "ads/frame.html", "text/html"],
  ["src/assets/uvideo-mark-sm.png", "assets/logo-mark.png", "image/png"],
  ["design/remote-ui.sample.json", "ui/sample.json", "application/json"],
  ["design/remote-ui.envelope.json", "ui/envelope.json", "application/json"],
];

async function put(local, key, contentType) {
  if (!existsSync(local)) {
    console.warn(`skip ${local} (nao existe)`);
    return;
  }
  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: readFileSync(local),
      ContentType: contentType,
    }),
  );
  console.log(`ok  ${key}`);
}

for (const [local, key, type] of FILES) await put(local, key, type);

const apk = process.env.APK_PATH;
if (apk && existsSync(apk)) {
  const name = apk.split(/[\\/]/).pop();
  await put(apk, `apk/${name}`, "application/vnd.android.package-archive");
}
