export type CategoryId =
  | "all"
  | "social"
  | "video"
  | "games"
  | "finance"
  | "productivity"
  | "music"
  | "photo"
  | "tools"
  | "sport";

export interface AppDetail {
  description: string;
  itempropDescription: string;
  screenshots: string[];
  video: string | null;
  poster: string | null;
  updatedRaw: string | null;
}

export interface DownloadSource {
  url: string;
  kind: "file" | "store";
  filename?: string;
}

export interface CatalogApp {
  id: string;
  name: string;
  developer: string;
  genre: string;
  category: Exclude<CategoryId, "all">;
  rating: number;
  ratings: string;
  downloads: string;
  downloadsM: number;
  mb: number;
  version: string;
  updated: string;
  fresh: string;
  color: string;
  ink: "light" | "dark";
  tag?: string;
  /** "web" — мгновенная веб-игра, работает локально в браузере, без скачивания */
  kind?: "app" | "web";
  /** slug игры для маршрута /games/:slug */
  game?: string;
  /** признак позиции, добавленной через Студию (/api/admin/games) */
  custom?: boolean;
  /** путь к пользовательской иконке (/uploads/<id>/icon.webp) */
  icon?: string;
  downloadsByPlatform?: Partial<Record<"android" | "windows", DownloadSource>>;
  detail: AppDetail;
}

export const categories: { id: CategoryId; label: string }[] = [
  { id: "all", label: "Всё" },
  { id: "social", label: "Общение" },
  { id: "video", label: "Видео" },
  { id: "games", label: "Игры" },
  { id: "finance", label: "Финансы" },
  { id: "productivity", label: "Работа" },
  { id: "music", label: "Музыка" },
  { id: "photo", label: "Фото и видео" },
  { id: "tools", label: "Инструменты" },
  { id: "sport", label: "Спорт" },
];

export const featuredId = "com.lemon.lvoverseas";

export function preferredDownload(app: CatalogApp): DownloadSource | undefined {
  const platform = typeof navigator !== "undefined" && /Windows/i.test(navigator.userAgent) ? "windows" : "android";
  return app.downloadsByPlatform?.[platform] ?? app.downloadsByPlatform?.android;
}

export function downloadLabel(app: CatalogApp): string {
  const source = preferredDownload(app);
  if (source?.kind === "store") return source.url.startsWith("https://play.google.com/") ? "В Google Play" : "Установить";
  return source?.filename?.endsWith(".apk") ? "Скачать APK" : "Скачать";
}

export function formatSize(mb: number): string {
  if (mb >= 1024) return `${(mb / 1024).toFixed(1).replace(".", ",")} ГБ`;
  return `${mb} МБ`;
}

export function formatRating(rating: number): string {
  return rating > 0 ? rating.toFixed(1).replace(".", ",") : "—";
}

export const categoryById = new Map(categories.map((c) => [c.id, c.label]));
