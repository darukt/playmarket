import { Component, lazy, Suspense, useCallback, useState, type ReactNode } from "react";
import { ArrowLeft, Gamepad2, MonitorSmartphone, Wifi } from "lucide-react";
import { AppLink } from "./AppLink";
import { Description } from "./Description";
import AppIcon from "./AppIcon";
import Leaderboard from "./Leaderboard";
import "../games/games.css";
import { formatRating } from "../data/apps";
import { useCatalogQuery } from "../hooks/useCatalog";
import { useDelayedFlag } from "../hooks/useDelayedFlag";

const GAME_COMPONENTS = {
  snake: lazy(() => import("../games/SnakeGame")),
  "2048": lazy(() => import("../games/Game2048")),
  razlom: lazy(() => import("../games/RazlomGame")),
  memory: lazy(() => import("../games/ArcadeGames").then(m => ({ default: m.MemoryGame }))),
  pong: lazy(() => import("../games/ArcadeGames").then(m => ({ default: m.PongGame }))),
  reaction: lazy(() => import("../games/ArcadeGames").then(m => ({ default: m.ReactionGame }))),
  minesweeper: lazy(() => import("../games/ArcadeGames").then(m => ({ default: m.MinesweeperGame }))),
  "tic-tac-toe": lazy(() => import("../games/ArcadeGames").then(m => ({ default: m.TicTacToeGame }))),
  "connect-four": lazy(() => import("../games/ArcadeGames").then(m => ({ default: m.ConnectFourGame }))),
  simon: lazy(() => import("../games/ArcadeGames").then(m => ({ default: m.SimonGame }))),
  "whack-a-mole": lazy(() => import("../games/ArcadeGames").then(m => ({ default: m.WhackAMoleGame }))),
  "lights-out": lazy(() => import("../games/ArcadeGames").then(m => ({ default: m.LightsOutGame }))),
  "sliding-puzzle": lazy(() => import("../games/ArcadeGames").then(m => ({ default: m.SlidingPuzzleGame }))),
  sudoku: lazy(() => import("../games/ArcadeGames").then(m => ({ default: m.SudokuGame }))),
  "word-scramble": lazy(() => import("../games/ArcadeGames").then(m => ({ default: m.WordScrambleGame }))),
} as const;

const GAME_CONTROLS: Record<string, { keys: string; touch: string }> = {
  snake: { keys: "Стрелки или WASD — направление, пробел — пауза, R — заново", touch: "свайп по полю или экранная крестовина" },
  "2048": { keys: "Стрелки или WASD — сдвиг поля, Z — отмена хода, R — новая партия", touch: "свайп по полю или кнопки под ним" },
  razlom: { keys: "Мышь или A/D / стрелки — платформа, пробел — запуск мяча, P — пауза, R — заново", touch: "ведите пальцем по полю, тап — запуск мяча" },
  memory: { keys: "Tab — выбор карточки, Enter или пробел — открыть", touch: "открывайте карточки касанием и находите одинаковые пары" },
  pong: { keys: "↑/↓, W/S или мышь — платформа, пробел — пауза", touch: "ведите пальцем по полю, «Играть» — запуск или пауза" },
  reaction: { keys: "Tab — выбрать поле, Enter или пробел — ответить на сигнал", touch: "нажмите поле, когда оно станет зелёным" },
  minesweeper: { keys: "Tab и Enter — открыть клетку, правый клик или режим флажков — отметить мину", touch: "касание открывает клетку, кнопка «Флажки» переключает отметки" },
  "tic-tac-toe": { keys: "Tab — выбор клетки, Enter или пробел — поставить крестик", touch: "нажмите свободную клетку" },
  "connect-four": { keys: "Tab — выбор клетки столбца, Enter или пробел — бросить фишку", touch: "нажмите любой участок выбранного столбца" },
  simon: { keys: "Tab — выбор цвета, Enter или пробел — повторить ноту", touch: "повторите показанную последовательность цветных кнопок" },
  "whack-a-mole": { keys: "Tab — выбор норки, Enter или пробел — удар", touch: "нажимайте на появляющегося крота" },
  "lights-out": { keys: "Tab — выбор лампы, Enter или пробел — переключить", touch: "нажмите клетку, чтобы переключить её и соседей" },
  "sliding-puzzle": { keys: "Стрелки — двигать плитки; Tab и Enter — выбрать плитку", touch: "нажимайте плитку рядом с пустой клеткой" },
  sudoku: { keys: "Выберите клетку, 1–4 — число, Backspace или Delete — стереть", touch: "выберите клетку, затем число под полем" },
  "word-scramble": { keys: "Tab и Enter — выбор буквы, «Отменить букву» — шаг назад", touch: "нажимайте буквы в порядке, чтобы собрать слово" },
};

class GameBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    if (this.state.failed) return <div className="game-loading" role="alert"><b>Не удалось запустить игру</b><p>Проверьте соединение и обновите страницу.</p><button className="btn" onClick={() => window.location.reload()}>Перезагрузить</button></div>;
    return this.props.children;
  }
}

/** Заглушка для ленивой загрузки игры: не мигает, если код готов за 30 мс. */
function GameLoadingFallback() {
  const visible = useDelayedFlag(true, 30);
  if (!visible) return null;
  return (
    <div className="game-loading" role="status" aria-live="polite">
      <div className="game-loading-board" aria-hidden="true" />
      <b>Загружаем игру…</b>
      <span>Готовим поле и управление</span>
    </div>
  );
}

export default function GamePage({ slug }: { slug: string }) {
  return <GameContent key={slug} slug={slug} />;
}

function GameContent({ slug }: { slug: string }) {
  const catalogQuery = useCatalogQuery();
  const catalog = catalogQuery.data ?? [];
  const game = catalog.find((g) => g.kind === "web" && g.game === slug);
  const GameComponent = GAME_COMPONENTS[slug as keyof typeof GAME_COMPONENTS];
  const [lastScore, setLastScore] = useState<number | null>(null);
  const handleGameOver = useCallback((score: number) => setLastScore(score), []);

  if (catalogQuery.isPending) return <GameLoadingFallback />;
  if (catalogQuery.isError && !catalogQuery.data) return <div className="game-loading" role="alert"><b>Не удалось загрузить каталог игр</b><p>Проверьте соединение и попробуйте ещё раз.</p><button className="btn" onClick={() => void catalogQuery.refetch()}>Повторить</button></div>;

  if (!game || !GameComponent) {
    return (
      <section className="section" style={{ marginTop: 12 }}>
        <div className="view-empty">
          <b>Такой игры нет</b>
          Выберите доступную игру в каталоге.
          <div style={{ marginTop: 16 }}>
            <AppLink to={{ name: "games" }} className="btn">
              Все игры
              <ArrowLeft size={14} aria-hidden="true" />
            </AppLink>
          </div>
        </div>
      </section>
    );
  }

  const controls = GAME_CONTROLS[slug];

  return (
    <div className="game-page">
      <nav className="crumbs" aria-label="Хлебные крошки">
        <AppLink to={{ name: "games" }} className="crumbs-link">
          <ArrowLeft size={12} aria-hidden="true" /> Игры
        </AppLink>
        <span aria-hidden="true">/</span>
        <span className="crumbs-genre">Веб-игра</span>
        <span aria-hidden="true">/</span>
        <span aria-current="page">{game.name}</span>
      </nav>

      <header className="game-hero">
        <AppIcon app={game} size="lg" />
        <div>
          <div className="feature-kicker" style={{ color: "var(--accent)" }}>Игра в браузере</div>
          <h1 className="game-title">{game.name}</h1>
          <p className="game-dev">ВИТРИНА STUDIO · {game.genre.toUpperCase()}</p>
          <div className="game-facts" aria-label="Ключевые цифры">
            <span>РЕЙТИНГ {formatRating(game.rating)}</span>
            <span>Без установки</span>
            <span>ВЕРСИЯ {game.version}</span>
          </div>
        </div>
      </header>

      <div className="game-layout">
        <GameBoundary><Suspense fallback={<GameLoadingFallback />}><GameComponent onGameOver={handleGameOver} /></Suspense></GameBoundary>

        <aside className="game-side" aria-label="Об игре">
          <h2 className="game-side-h">
            <Gamepad2 size={16} aria-hidden="true" />
            Управление
          </h2>
          <p className="game-side-p">
            <b>Клавиатура.</b> {controls.keys}
          </p>
          <p className="game-side-p">
            <b>Телефон.</b> {controls.touch}
          </p>

          <Leaderboard slug={slug} lastScore={lastScore} />

          <h2 className="game-side-h" style={{ marginTop: 22 }}>
            <MonitorSmartphone size={16} aria-hidden="true" />
            Играйте без установки
          </h2>
          <p className="game-side-p">
            Игра загружается при открытии. После запуска можно играть без сети, а результат сохранить на устройстве.
          </p>
          <p className="game-side-note">
            <Wifi size={13} aria-hidden="true" />
            Для общей таблицы рекордов нужен интернет и вход в аккаунт.
          </p>

          <h2 className="game-side-h" style={{ marginTop: 22 }}>Об игре</h2>
          <div className="desc-body game-desc">
            <Description text={game.detail.description} />
          </div>
        </aside>
      </div>
    </div>
  );
}
