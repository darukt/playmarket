// Re-encodes the three promo trailers to animated WebP at 30 fps
// (the previous pass used 12 fps). Re-downloads the source MP4 from
// Google's CDN and overwrites public/media/<id>/video.webp.
import { writeFile, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileP = promisify(execFile);
const FFMPEG = (await import("ffmpeg-static")).default;
const ROOT = new URL("..", import.meta.url).pathname.replace(/^\/+/, "");

const IDS = ["com.pubg.newstate", "com.roblox.client", "com.supercell.brawlstars"];

for (const id of IDS) {
  const res = await fetch(`https://play.google.com/store/apps/details?id=${id}&hl=ru&gl=kz`, {
    headers: { "user-agent": "Mozilla/5.0 (catalog-refresh)" },
  });
  const html = await res.text();
  const idx = html.indexOf("data-screenshot-index");
  const head = idx > 0 ? html.slice(0, idx) : html;
  const m = head.match(/<source\s+src="(https:\/\/play-games\.googleusercontent\.com\/vp\/mp4\/[^"]+\.mp4)"/i);
  if (!m) {
    console.error(`SKIP ${id}: direct mp4 not found`);
    continue;
  }
  const src = join(ROOT, "tmp-trailer.mp4");
  const out = join(ROOT, "public", "media", id, "video.webp");
  const buf = Buffer.from(await (await fetch(m[1], { redirect: "follow" })).arrayBuffer());
  await writeFile(src, buf);
  await execFileP(FFMPEG, [
    "-y",
    "-i",
    src,
    "-t",
    "24",
    "-an",
    "-vf",
    "fps=30,scale=640:-2:flags=lanczos",
    "-c:v",
    "libwebp_anim",
    "-quality",
    "62",
    "-loop",
    "0",
    out,
  ]);
  await rm(src, { force: true });
  console.log(`OK ${id} -> ${(await stat(out)).size / 1024 / 1024} MB`);
}
