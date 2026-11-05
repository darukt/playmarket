import { Download, Check, Bookmark, BookmarkCheck } from "lucide-react";
import AppIcon from "./AppIcon";
import { downloadLabel, formatRating, formatSize, type CatalogApp } from "../data/apps";

export default function FeaturedPanel({
  app,
  installed,
  progress,
  wishlisted,
  onInstall,
  onToggleWish,
}: {
  app: CatalogApp;
  installed: boolean;
  progress: number | undefined;
  wishlisted: boolean;
  onInstall: (id: string) => void;
  onToggleWish: (id: string) => void;
}) {
  const busy = progress !== undefined;

  return (
    <article className="feature" aria-labelledby="feature-title">
      <div className="feature-icon-wrap">
        <div className="feature-kicker">Приложение дня</div>
        <AppIcon app={app} size="lg" />
        <div className="feature-by">{app.version}</div>
      </div>

      <div>
        <h2 id="feature-title">{app.name}</h2>
        <p className="dev">
          {app.developer.toUpperCase()} · {app.genre.toUpperCase()}
        </p>

        <p className="quote">
          Соберите историю из любимых кадров. Видеоредактор с обрезкой, титрами и инструментами для коротких роликов.
          <small>Выбор для творчества</small>
        </p>

        <div className="feature-actions">
          {installed ? (
            <button className="btn btn-done" disabled>
              <Check size={14} strokeWidth={3} aria-hidden="true" />
              В загрузках
            </button>
          ) : busy ? (
            <button className="btn btn-paper busy" disabled aria-live="polite">
              Подготовка файла…
            </button>
          ) : (
            <button className="btn btn-paper" onClick={() => onInstall(app.id)}>
              <Download size={14} aria-hidden="true" />
              {downloadLabel(app)}
            </button>
          )}
          <button
            className={`icon-btn${wishlisted ? " on" : ""}`}
            onClick={() => onToggleWish(app.id)}
            aria-pressed={wishlisted}
            aria-label={wishlisted ? "Убрать из списка желаний" : "Добавить в список желаний"}
          >
            {wishlisted ? (
              <BookmarkCheck size={18} aria-hidden="true" />
            ) : (
              <Bookmark size={18} aria-hidden="true" />
            )}
          </button>
        </div>
      </div>

      <div className="feature-foot" aria-label="Характеристики">
        <div>
          <b>{formatRating(app.rating)}</b>
          <span>ОЦЕНКА · {app.ratings.toUpperCase()}</span>
        </div>
        <div>
          <b>{app.downloads}</b>
          <span>УСТАНОВОК</span>
        </div>
        <div>
          <b>{formatSize(app.mb)}</b>
          <span>ВЕС ПРИЛОЖЕНИЯ</span>
        </div>
        <div>
          <b>{app.updated}</b>
          <span>ПОСЛЕДНЕЕ ОБНОВЛЕНИЕ</span>
        </div>
      </div>
    </article>
  );
}
