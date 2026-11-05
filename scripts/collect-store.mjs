// Fetches Play Store pages and extracts: full description, screenshot URLs,
// direct promo-video MP4 (Google CDN) and poster. Writes src/data/details.json.
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";

const base = JSON.parse(await readFile(new URL("./base.json", import.meta.url), "utf8"));

const ENTITIES = [
  [/&nbsp;/g, " "],
  [/&amp;/g, "&"],
  [/&quot;/g, '"'],
  [/&#39;|&apos;/g, "'"],
  [/&lt;/g, "<"],
  [/&gt;/g, ">"],
  [/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n))],
];

function decodeEntities(s) {
  let out = s;
  for (const [re, rep] of ENTITIES) out = out.replace(re, rep);
  return out;
}

function htmlToText(block) {
  const withBreaks = block
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<h1>/gi, "\n\n## ")
    .replace(/<\/h1>/gi, "\n\n")
    .replace(/<h2>/gi, "\n\n## ")
    .replace(/<\/h2>/gi, "\n\n");
  return decodeEntities(withBreaks.replace(/<[^>]+>/g, ""))
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function extractScreenshots(html) {
  const re = /<img\s+src="(https:\/\/play-lh\.googleusercontent\.com\/[^"]+)"\s+srcset="([^"]+)"[^>]*data-screenshot-index="(\d+)"/g;
  const items = [];
  for (const m of html.matchAll(re)) {
    const srcset = m[2].trim();
    const twoX = srcset.match(/(https:\/\/play-lh[^\s"]+)\s+2x/);
    items.push({ index: Number(m[3]), url: twoX ? twoX[1] : m[1] });
  }
  items.sort((a, b) => a.index - b.index);
  const urls = [];
  const seen = new Set();
  for (const it of items) {
    const key = it.url.split("=")[0];
    if (seen.has(key)) continue;
    seen.add(key);
    urls.push(it.url);
    if (urls.length >= 8) break;
  }
  return urls;
}

function extractVideoAndPoster(html) {
  const idx = html.indexOf("data-screenshot-index");
  const head = idx > 0 ? html.slice(0, idx) : html;
  const v = head.match(/<source\s+src="(https:\/\/play-games\.googleusercontent\.com\/vp\/mp4\/[^"]+\.mp4)"/i);
  const p = head.match(/<video[^>]*\bposter="(https:\/\/[^"]+)"/i);
  return { video: v ? v[1] : null, poster: p ? p[1] : null };
}

const details = {};
for (const app of base) {
  const url = `https://play.google.com/store/apps/details?id=${app.id}&hl=ru&gl=kz`;
  const started = Date.now();
  const res = await fetch(url, { headers: { "user-agent": "Mozilla/5.0 (catalog-refresh)\n" } });
  if (!res.ok) {
    console.error("FAIL", app.id, res.status);
    details[app.id] = { description: "", itempropDescription: "", screenshots: [], video: null, poster: null, updatedRaw: null };
    continue;
  }
  const html = await res.text();
  const descBlock = html.match(/<div class="bARER" data-g-id="description" inert>([\s\S]*?)<\/div>/);
  const metaDesc = html.match(/<meta\s+itemprop="description"\s+content="([^"]*)"/i);
  const updatedRaw = html.match(/Последнее обновление<\/div><div class="xg1aie">([^<]+)<\/div>/);
  const { video, poster } = extractVideoAndPoster(html);
  const screenshots = extractScreenshots(html);
  const description = descBlock ? htmlToText(descBlock[1]) : "";
  const itempropDescription = metaDesc ? decodeEntities(metaDesc[1]).trim() : "";
  details[app.id] = {
    description,
    itempropDescription,
    screenshots,
    video,
    poster,
    updatedRaw: updatedRaw ? decodeEntities(updatedRaw[1]).trim() : null,
  };
  console.log(
    `OK ${app.id}  desc ${description.length} chars  screens ${screenshots.length}  video ${video ? "yes" : "no"}  (${Date.now() - started}ms)`
  );
}

const outPath = new URL("../src/data/details.json", import.meta.url);
await mkdir(dirname(outPath.pathname.replace(/^\/+/, "")), { recursive: true });
await writeFile(outPath, JSON.stringify(details, null, 2), "utf8");
console.log("written", outPath);
