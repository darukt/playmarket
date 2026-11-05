// Downloads screenshots/posters/trailers listed in src/data/details.json,
// converts everything to WebP in public/media/<id>/, then rewrites details.json
// to point at local files.
import { mkdir, readFile, writeFile, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileP = promisify(execFile);
const CWEBP = "C:\\msys64\\ucrt64\\bin\\cwebp.exe";
const ROOT = new URL("..", import.meta.url).pathname.replace(/^\/+/, "");
const FFMPEG = (await import("ffmpeg-static")).default;

const detailsPath = new URL("../src/data/details.json", import.meta.url);
const base = JSON.parse(await readFile(new URL("../scripts/base.json", import.meta.url), "utf8"));
const details = JSON.parse(await readFile(detailsPath, "utf8"));

async function getBuffer(url) {
  const res = await fetch(url, {
    headers: { "user-agent": "Mozilla/5.0 (catalog-refresh)" },
    redirect: "follow",
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return Buffer.from(await res.arrayBuffer());
}

function extFrom(url, contentType) {
  if (/\.jpe?g(\?|$)/i.test(url) || /image\/jpe?g/i.test(contentType ?? "")) return ".jpg";
  if (/\.png(\?|$)/i.test(url) || /image\/png/i.test(contentType ?? "")) return ".png";
  if (/\.webp(\?|$)/i.test(url) || /image\/webp/i.test(contentType ?? "")) return ".webp";
  if (/\.gif(\?|$)/i.test(url) || /image\/gif/i.test(contentType ?? "")) return ".gif";
  return ".bin";
}

async function toWebp(input, output, { quality = 78, maxWidth } = {}) {
  const args = ["-q", String(quality), "-m", "6"];
  if (maxWidth) args.push("-resize", String(maxWidth), "0");
  args.push(input, "-o", output);
  await execFileP(CWEBP, args);
}

async function fileSize(path) {
  const s = await stat(path);
  return s.size;
}

function mb(bytes) {
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

for (const app of base) {
  const d = details[app.id];
  if (!d) continue;
  const mediaDir = join(ROOT, "public", "media", app.id);
  await mkdir(mediaDir, { recursive: true });
  const logs = [];

  const screens = [];
  let i = 0;
  for (const url of d.screenshots ?? []) {
    const name = `screen-${i}.webp`;
    const out = join(mediaDir, name);
    try {
      const buf = await getBuffer(url);
      const ext = extFrom(url, undefined);
      const tmp = join(mediaDir, `tmp-${i}${ext}`);
      await writeFile(tmp, buf);
      await toWebp(tmp, out, { quality: 80, maxWidth: 1280 });
      await rm(tmp, { force: true });
      screens.push(`/media/${app.id}/${name}`);
      logs.push(`${name} ${mb(buf.length)} -> ${mb(await fileSize(out))}`);
      i++;
    } catch (e) {
      logs.push(`screen-${i} FAILED: ${e.message}`);
      i++;
    }
  }
  d.screenshots = screens;

  if (d.poster) {
    const out = join(mediaDir, "poster.webp");
    try {
      const buf = await getBuffer(d.poster);
      const tmp = join(mediaDir, "tmp-poster" + extFrom(d.poster, undefined));
      await writeFile(tmp, buf);
      await toWebp(tmp, out, { quality: 82, maxWidth: 1280 });
      await rm(tmp, { force: true });
      d.poster = `/media/${app.id}/poster.webp`;
      logs.push(`poster ${mb(buf.length)} -> ${mb(await fileSize(out))}`);
    } catch (e) {
      logs.push(`poster FAILED: ${e.message}`);
      d.poster = null;
    }
  }

  if (d.video) {
    const out = join(mediaDir, "video.webp");
    const src = join(mediaDir, "tmp-trailer.mp4");
    try {
      const buf = await getBuffer(d.video);
      await writeFile(src, buf);
      logs.push(`video downloaded ${mb(buf.length)}`);
      await execFileP(FFMPEG, [
        "-y",
        "-i",
        src,
        "-t",
        "24",
        "-an",
        "-vf",
        "fps=12,scale=640:-2",
        "-c:v",
        "libwebp_anim",
        "-quality",
        "48",
        "-loop",
        "0",
        out,
      ]);
      await rm(src, { force: true });
      d.video = `/media/${app.id}/video.webp`;
      logs.push(`video.webp ${mb(await fileSize(out))}`);
    } catch (e) {
      logs.push(`video FAILED: ${e.message}`);
      await rm(src, { force: true }).catch(() => {});
      d.video = null;
    }
  }

  console.log(`== ${app.id}\n   ${logs.join("\n   ")}`);
}

await writeFile(detailsPath, JSON.stringify(details, null, 2), "utf8");
console.log("details.json updated");
