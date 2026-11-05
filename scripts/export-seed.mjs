// Generates backend/data/seed.json from the frontend's catalog sources.
// The Go backend serves this exact payload from /api/catalog and persists
// any additions made through the Studio UI on top of it.
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname.replace(/^\/+/, "");
const base = JSON.parse(await readFile(join(ROOT, "scripts", "base.json"), "utf8"));
const details = JSON.parse(await readFile(join(ROOT, "src", "data", "details.json"), "utf8"));
const webGames = JSON.parse(await readFile(join(ROOT, "src", "data", "web-games.json"), "utf8"));

const entry = (a) => {
  const d = details[a.id] ?? {};
  return {
    id: a.id,
    name: a.name,
    developer: a.developer,
    genre: a.genre,
    category: a.category,
    rating: a.rating,
    ratings: a.ratings,
    downloads: a.downloads,
    downloadsM: a.downloadsM,
    mb: a.mb,
    version: a.version,
    updated: a.updated,
    fresh: a.fresh,
    color: a.color,
    ink: a.ink,
    tag: a.tag ?? null,
    kind: a.kind ?? "app",
    game: a.game ?? null,
    custom: false,
    detail: {
      description: d.description ?? "",
      itempropDescription: d.itempropDescription ?? "",
      screenshots: d.screenshots ?? [],
      video: d.video ?? null,
      poster: d.poster ?? null,
      updatedRaw: d.updatedRaw ?? a.updated,
    },
  };
};

const seed = [...base.map(entry), ...webGames.map(entry)];
const out = join(ROOT, "backend", "data", "seed.json");
await mkdir(join(ROOT, "backend", "data"), { recursive: true });
await writeFile(out, JSON.stringify(seed, null, 2), "utf8");
console.log(`seed.json: ${seed.length} entries -> ${out}`);
