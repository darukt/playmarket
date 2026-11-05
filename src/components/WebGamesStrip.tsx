import { Play } from "lucide-react";
import { AppLink } from "./AppLink";
import GameArtwork from "./GameArtwork";
import { useCatalog } from "../hooks/useCatalog";

/** Полоса мгновенных веб-игр: работают прямо в браузере, 0 МБ. */
export default function WebGamesStrip() {
  const catalog = useCatalog();
  const webGames = catalog.filter((a) => a.kind === "web" && a.game).slice(0, 6);

  return (
    <div className="web-games">
      {webGames.slice(0, 3).map((game) => (
        <AppLink
          key={game.id}
          to={{ name: "game", slug: game.game! }}
          className={`web-game-card arcade-card arcade-card-${game.game}`}
          ariaLabel={`Играть в ${game.name}`}
        >
          <div className="web-game-art"><GameArtwork slug={game.game!} /></div>
          <span className="web-game-body">
            <span className="web-game-name">{game.name}</span>
            <span className="web-game-cap">
              {game.game === "snake" ? "Поймай ритм. Не свой хвост." : game.game === "2048" ? "Один ход до красивого решения." : "Разбей всё. Начни ещё раз."}
            </span>
          </span>
          <span className="web-game-cta">
            <Play size={18} fill="currentColor" aria-hidden="true" />
          </span>
        </AppLink>
      ))}
    </div>
  );
}
