import { useCatalog } from "../hooks/useCatalog";
import { ArrowUpRight } from "lucide-react";
import { categories, type CategoryId } from "../data/apps";

const TILE_STYLE: Record<string, { bg: string; fg: string; wide?: boolean }> = {
  games: { bg: "#d9f2e7", fg: "#0d1a10", wide: true },
  video: { bg: "#f9e2e5", fg: "#71313c", wide: true },
  social: { bg: "#e8e3ff", fg: "#493c7b" },
  photo: { bg: "#f6e4f1", fg: "#693e5f" },
  finance: { bg: "#dcecf9", fg: "#355770" },
  productivity: { bg: "#e8eaf4", fg: "#e1e6f1" },
  music: { bg: "#ffe7d5", fg: "#2a1100" },
  tools: { bg: "#e1e6f1", fg: "#e8e3ff" },
  sport: { bg: "#f7ecd4", fg: "#2a1200" },
};

const ORDER: CategoryId[] = ["games", "video", "social", "photo", "finance", "productivity", "music", "tools", "sport"];

export default function CategoryTiles({
  active,
  onSelect,
}: {
  active: CategoryId;
  onSelect: (id: CategoryId) => void;
}) {
  const apps = useCatalog();
  const counts = new Map<string, number>();
  for (const app of apps) counts.set(app.category, (counts.get(app.category) ?? 0) + 1);

  return (
    <div className="tiles" role="group">
      {ORDER.map((id, i) => {
        const style = TILE_STYLE[id];
        const label = categories.find((c) => c.id === id)?.label ?? id;
        const isActive = active === id;
        return (
          <button
            key={id}
            
            className={`tile${style.wide ? " wide" : ""}${isActive ? " active" : ""}`}
            style={{ background: style.bg, color: style.fg }}
            onClick={() => onSelect(isActive ? "all" : id)}
            aria-pressed={isActive}
            aria-label={`Раздел ${label}, в подборке ${counts.get(id) ?? 0} приложений`}
          >
            <span className="tile-no">{String(i + 1).padStart(2, "0")} / РАЗДЕЛ</span>
            <h3>{label}</h3>
            <span className="tile-count">
              в подборке: {counts.get(id) ?? 0}
              <ArrowUpRight size={16} aria-hidden="true" />
            </span>
          </button>
        );
      })}
    </div>
  );
}
