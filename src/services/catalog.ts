import type { CatalogApp, CategoryId } from "../data/apps";

const categories = new Set(["social", "video", "games", "finance", "productivity", "music", "photo", "tools", "sport"]);
const record = (value: unknown): Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const text = (value: unknown, fallback = "") => typeof value === "string" ? value : fallback;
const number = (value: unknown, fallback = 0) => typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : fallback;
function media(value: unknown): string | null {
  if (typeof value !== "string" || !/^\/(media|uploads|icons)\/[A-Za-z0-9._/-]+$/.test(value) || value.split("/").includes("..")) return null;
  return value;
}

/** Normalize nullable Go JSON fields once, at the public API boundary. */
export function normalizeApp(value: unknown): CatalogApp | undefined {
  const row = record(value);
  if (typeof row.id !== "string" || !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,159}$/.test(row.id) || typeof row.name !== "string" || !row.name.trim()) return undefined;
  const detail = record(row.detail);
  return {
    id: row.id, name: row.name, developer: text(row.developer, "Не указан"), genre: text(row.genre, "Приложение"),
    category: (categories.has(text(row.category)) ? row.category : "tools") as Exclude<CategoryId, "all">,
    rating: Math.min(5, number(row.rating)), ratings: text(row.ratings, "0"), downloads: text(row.downloads, "0"),
    downloadsM: number(row.downloadsM), mb: number(row.mb), version: text(row.version, "1.0"), updated: text(row.updated, "Нет данных"),
    fresh: /^\d{4}-\d{2}-\d{2}$/.test(text(row.fresh)) ? text(row.fresh) : "",
    color: /^#[0-9a-f]{6}$/i.test(text(row.color)) ? text(row.color) : "#4b67ad", ink: row.ink === "light" ? "light" : "dark",
    tag: typeof row.tag === "string" ? row.tag : undefined, kind: row.kind === "web" ? "web" : "app",
    game: typeof row.game === "string" ? row.game : undefined, custom: row.custom === true, icon: media(row.icon) ?? undefined,
    detail: {
      description: text(detail.description), itempropDescription: text(detail.itempropDescription),
      screenshots: Array.isArray(detail.screenshots) ? detail.screenshots.map(media).filter((path): path is string => path !== null).slice(0, 20) : [],
      video: media(detail.video), poster: media(detail.poster), updatedRaw: typeof detail.updatedRaw === "string" && detail.updatedRaw ? detail.updatedRaw : null,
    },
  };
}

export function normalizeCatalog(value: unknown): CatalogApp[] {
  if (!Array.isArray(value)) throw new Error("Invalid catalog response");
  const rows = value.map(normalizeApp).filter((row): row is CatalogApp => row !== undefined);
  if (value.length > 0 && rows.length === 0) throw new Error("Invalid catalog entries");
  return [...new Map(rows.map((row) => [row.id, row])).values()];
}
