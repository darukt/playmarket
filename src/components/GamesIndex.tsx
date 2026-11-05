import { ArrowRight, Wifi, HardDriveDownload, Monitor } from "lucide-react";
import { AppLink } from "./AppLink";
import AppIcon from "./AppIcon";
import { formatRating } from "../data/apps";
import { useCatalog } from "../hooks/useCatalog";

export default function GamesIndex() {
  const catalog = useCatalog();
  const webGames = catalog.filter((a) => a.kind === "web" && a.game);

  return (
    <section className="section" style={{ marginTop: 12 }} aria-labelledby="games-h">
      <div className="standfirst" style={{ paddingBottom: 18 }}>
        <h1 id="games-h">Мгновенные игры</h1>
        <div className="issue">
          <b>БЕЗ СКАЧИВАНИЯ</b>
          {webGames.length} игры в браузере
          <br />
          без установки приложения
        </div>
      </div>

      <div className="games-index">
        {webGames.map((game, i) => (
          <AppLink
            key={game.id}
            to={{ name: "game", slug: game.game! }}
            className="game-card"
            ariaLabel={`Играть в ${game.name}`}
          >
            <span className="game-card-no">{String(i + 1).padStart(2, "0")}</span>
            <AppIcon app={game} size="lg" />
            <span className="game-card-body">
              <span className="game-card-name">{game.name}</span>
              <span className="game-card-cap">{game.genre} · рейтинг {formatRating(game.rating)}</span>
              <span className="game-card-desc">{game.detail.itempropDescription}</span>
            </span>
            <span className="game-card-cta">
              Играть
              <ArrowRight size={18} aria-hidden="true" />
            </span>
          </AppLink>
        ))}
      </div>

      <ul className="games-facts" aria-label="Как это работает">
        <li>
          <Wifi size={16} aria-hidden="true" />
          <span><b>После запуска можно без сети.</b> Игра загружается один раз при открытии; рекорды синхронизируются при подключении.</span>
        </li>
        <li>
          <HardDriveDownload size={16} aria-hidden="true" />
          <span><b>Без установщика.</b> Играйте на телефоне или компьютере прямо в браузере.</span>
        </li>
        <li>
          <Monitor size={16} aria-hidden="true" />
          <span><b>Управление на выбор.</b> Клавиатура, мышь, свайпы и экранные кнопки.</span>
        </li>
      </ul>

      <div style={{ marginTop: 28 }}>
        <AppLink to={{ name: "chart" }} className="btn btn-ghost">
          Смотреть весь чарт
          <ArrowRight size={14} aria-hidden="true" />
        </AppLink>
      </div>
    </section>
  );
}
