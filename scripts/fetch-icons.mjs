// Downloads the official Play Store icon (og:image, master asset) for each
// catalog app and converts it to a square icon.webp in public/media/<id>/.
import { mkdir, writeFile, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile } from "node:fs/promises";

const execFileP = promisify(execFile);
const CWEBP = "C:\\msys64\\ucrt64\\bin\\cwebp.exe";
const ROOT = new URL("..", import.meta.url).pathname.replace(/^\/+/, "");
const base = JSON.parse(await readFile(new URL("../scripts/base.json", import.meta.url), "utf8"));

const extFrom = (url, contentType) => {
  if (/\.jpe?g(\?|$)/i.test(url) || /image\/jpe?g/i.test(contentType ?? "")) return ".jpg";
  if (/\.png(\?|$)/i.test(url) || /image\/png/i.test(contentType ?? "")) return ".png";
  if (/\.webp(\?|$)/i.test(url) || /image\/webp/i.test(contentType ?? "")) return ".webp";
  return ".bin";
};

let ok = 0;
for (const app of base) {
  try {
    const res = await fetch(`https://play.google.com/store/apps/details?id=${app.id}&hl=ru&gl=kz`, {
      headers: { "user-agent": "Mozilla/5.0 (catalog-refresh)" },
    });
    if (!res.ok) throw new Error(`details HTTP ${res.status}`);
    const html = await res.text();
    const m = html.match(/<meta property="og:image" content="([^"]+)"/);
    if (!m) throw new Error("og:image not found");
    const iconUrl = m[1];

    const img = await fetch(iconUrl, { redirect: "follow" });
    if (!img.ok) throw new Error(`icon HTTP ${img.status}`);
    const buf = Buffer.from(await img.arrayBuffer());
    const type = img.headers.get("content-type") ?? "";
    const ext = extFrom(iconUrl, type);

    const mediaDir = join(ROOT, "public", "media", app.id);
    await mkdir(mediaDir, { recursive: true });
    const tmp = join(mediaDir, `tmp-icon${ext}`);
    const out = join(mediaDir, "icon.webp");
    await writeFile(tmp, buf);
    await execFileP(CWEBP, ["-q", "82", "-m", "6", "-resize", "256", "256", tmp, "-o", out]);
    await rm(tmp, { force: true });
    const size = (await stat(out)).size;
    console.log(`OK ${app.id} ${(size / 1024).toFixed(0)} KB`);
    ok++;
  } catch (e) {
    console.error(`FAIL ${app.id}: ${e.message}`);
  }
}
console.log(`icons: ${ok}/${base.length}`);
