import { Gamepad2, ArrowRight } from "lucide-react";
import { AppLink } from "./AppLink";
import AppIcon from "./AppIcon";
import { formatRating } from "../data/apps";
import { useCatalog } from "../hooks/useCatalog";

/** Полоса мгновенных веб-игр: работают прямо в браузере, 0 МБ. */
export default function WebGamesStrip() {
  const catalog = useCatalog();
  const webGames = catalog.filter((a) => a.kind === "web" && a.game);

  return (
    <div className="web-games">
      {webGames.map((game) => (
        <AppLink
          key={game.id}
          to={{ name: "game", slug: game.game! }}
          className="web-game-card"
          ariaLabel={`Играть в ${game.name}`}
        >
          <AppIcon app={game} size="md" />
          <span className="web-game-body">
            <span className="web-game-name">{game.name}</span>
            <span className="web-game-cap">
              {game.genre} · {formatRating(game.rating)} · в браузере
            </span>
          </span>
          <span className="web-game-cta">
            <Gamepad2 size={18} aria-hidden="true" />
            <span className="web-game-play">Играть</span>
            <ArrowRight size={14} aria-hidden="true" />
          </span>
        </AppLink>
      ))}
    </div>
  );
}
