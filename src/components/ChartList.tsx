import { memo } from "react";
import { Download, Check, Gamepad2, Bookmark, BookmarkCheck } from "lucide-react";
import AppIcon from "./AppIcon";
import { AppLink } from "./AppLink";
import { routeForApp } from "../nav";
import { formatRating, formatSize, type CatalogApp } from "../data/apps";

const ChartRow = memo(
  function ChartRow({
    app,
    index,
    installed,
    wishlisted,
    busy,
    onInstall,
    onUninstall,
    onToggleWish,
  }: {
    app: CatalogApp;
    index: number;
    installed: boolean;
    wishlisted: boolean;
    busy: number | undefined;
    onInstall: (id: string) => void;
    onUninstall: (id: string) => void;
    onToggleWish: (id: string) => void;
  }) {
    const isWeb = app.kind === "web";
    const isBusy = busy !== undefined;
    const target = routeForApp(app);
    const label = `Открыть ${app.name}`;

    return (
      <li className={`chart-row${installed ? " is-installed" : ""}${isWeb ? " is-web" : ""}`}>
        {/* вся строка — единая ссылка: переход по нажатию на любое место */}
        <AppLink to={target} className="row-link" ariaLabel={label} />
        <span className="chart-num" aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
        <AppIcon app={app} size="sm" />
        <div className="chart-main">
          <div className="chart-name">
            {app.name}
            {app.tag && <span className="chart-tag">{app.tag}</span>}
          </div>
          <div className="chart-dev">
            {app.developer} · {app.genre}
          </div>
        </div>
        <div className="chart-meta" aria-label={`Рейтинг ${formatRating(app.rating)}, ${app.ratings} оценок`}>
          <b>{formatRating(app.rating)}</b> · {app.ratings}<br />
          {app.downloads} · {formatSize(app.mb)}
        </div>
        <div className="chart-actions">
          <button
            className={`icon-btn${wishlisted ? " on" : ""}`}
            onClick={() => onToggleWish(app.id)}
            aria-pressed={wishlisted}
            aria-label={wishlisted ? `Убрать ${app.name} из списка желаний` : `Добавить ${app.name} в список желаний`}
          >
            {wishlisted ? <BookmarkCheck size={16} /> : <Bookmark size={16} />}
          </button>
          {isWeb ? (
            <AppLink to={target} className="btn btn-ghost btn-sm" ariaLabel={`Играть в ${app.name}`}>
              <Gamepad2 size={12} aria-hidden="true" />
              Играть
            </AppLink>
          ) : installed ? (
            <button className="btn btn-done btn-sm" onClick={() => onUninstall(app.id)}>
              <Check size={12} strokeWidth={3} aria-hidden="true" />
              В загрузках
            </button>
          ) : isBusy ? (
            <button className="btn btn-sm busy" disabled aria-live="polite">
              Подготовка…
            </button>
          ) : (
            <button className="btn btn-ghost btn-sm" onClick={() => onInstall(app.id)}>
              <Download size={12} aria-hidden="true" />
              Скачать
            </button>
          )}
        </div>
      </li>
    );
  }
);

export default function ChartList({
  rows,
  installedIds,
  wishlistIds,
  progress,
  onInstall,
  onUninstall,
  onToggleWish,
}: {
  rows: CatalogApp[];
  installedIds: string[];
  wishlistIds: string[];
  progress: Record<string, number>;
  onInstall: (id: string) => void;
  onUninstall: (id: string) => void;
  onToggleWish: (id: string) => void;
}) {
  if (rows.length === 0) {
    return (
      <p className="view-empty">
        <b>Пусто</b>
        Под этот запрос ничего не нашлось. Очистите поиск или смените раздел.
      </p>
    );
  }

  return (
    <ol className="chart">
      {rows.map((app, i) => {
        const installed = installedIds.includes(app.id);
        const wish = wishlistIds.includes(app.id);
        return (
          <ChartRow
            key={app.id}
            app={app}
            index={i}
            installed={installed}
            wishlisted={wish}
            busy={progress[app.id]}
            onInstall={onInstall}
            onUninstall={onUninstall}
            onToggleWish={onToggleWish}
          />
        );
      })}
    </ol>
  );
}
