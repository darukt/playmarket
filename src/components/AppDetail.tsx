import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  Bookmark,
  BookmarkCheck,
  Check,
  Download,
  Star,
  Trash2,
  X,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import AppIcon from "./AppIcon";
import { AppLink } from "./AppLink";
import { Description } from "./Description";
import { downloadLabel, preferredDownload, formatRating, formatSize, type CatalogApp } from "../data/apps";
import { useCatalog } from "../hooks/useCatalog";

export default function AppDetail({
  app,
  installed,
  busy,
  wishlisted,
  onInstall,
  onUninstall,
  onToggleWish,
}: {
  app: CatalogApp;
  installed: boolean;
  busy: number | undefined;
  wishlisted: boolean;
  onInstall: (id: string) => void;
  onUninstall: (id: string) => void;
  onToggleWish: (id: string) => void;
}) {
  const [lightbox, setLightbox] = useState<number | null>(null);
  const lightboxDialog = useRef<HTMLDialogElement>(null);
  const lightboxOpen = lightbox !== null;
  const screens = app.detail.screenshots;
  const isBusy = busy !== undefined;

  useEffect(() => {
    if (!lightboxOpen) return;
    const node = lightboxDialog.current;
    const previous = document.activeElement;
    const overflow = document.body.style.overflow;
    if (!node?.open) node?.showModal();
    document.body.style.overflow = 'hidden';
    return () => {
      node?.close();
      document.body.style.overflow = overflow;
      if (previous instanceof HTMLElement) previous.focus();
    };
  }, [lightboxOpen]);

  useEffect(() => {
    if (lightbox === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setLightbox(null);
      if (e.key === "ArrowRight") setLightbox((i) => (i === null ? i : (i + 1) % screens.length));
      if (e.key === "ArrowLeft")
        setLightbox((i) => (i === null ? i : (i - 1 + screens.length) % screens.length));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lightbox, screens.length]);

  const catalog = useCatalog();
  const sameDev = catalog.filter((a) => a.developer === app.developer && a.id !== app.id).slice(0, 3);

  return (
    <div className="detail">
      <nav className="crumbs" aria-label="Хлебные крошки">
        <AppLink to={{ name: "chart" }} className="crumbs-link">
          <ArrowLeft size={12} aria-hidden="true" /> Каталог
        </AppLink>
        <span aria-hidden="true">/</span>
        <span className="crumbs-genre">{app.genre}</span>
        <span aria-hidden="true">/</span>
        <span aria-current="page">{app.name}</span>
      </nav>

      <header className="detail-hero">
        <AppIcon app={app} size="lg" />
        <div className="detail-hero-main">
          <h1>{app.name}</h1>
          <p className="detail-dev">
            {app.developer.toUpperCase()} · {app.genre.toUpperCase()}
          </p>
          <p className="detail-lead">{app.detail.itempropDescription}</p>

          <div className="detail-facts" aria-label="Ключевые цифры">
            <div className="fact">
              <span className="fact-num">
              <Star size={16} className="fact-star" aria-hidden="true" />
                {formatRating(app.rating)}
              </span>
              <span className="fact-cap">{app.ratings} оценок</span>
            </div>
            <div className="fact">
              <span className="fact-num">{app.downloads}</span>
              <span className="fact-cap">Установок</span>
            </div>
            <div className="fact">
              <span className="fact-num">{formatSize(app.mb)}</span>
              <span className="fact-cap">Вес</span>
            </div>
            <div className="fact">
              <span className="fact-num">{app.detail.updatedRaw ?? app.updated}</span>
              <span className="fact-cap">Обновлено</span>
            </div>
          </div>

          <div className="detail-actions">
            {installed ? (
              <>
                <button className="btn btn-done" disabled>
                  <Check size={14} strokeWidth={3} aria-hidden="true" />
                  В загрузках
                </button>
                <button className="btn btn-ghost" onClick={() => onUninstall(app.id)}>
                  <Trash2 size={14} aria-hidden="true" />
                  Удалить
                </button>
              </>
            ) : isBusy ? (
              <button className="btn btn-paper busy" disabled aria-live="polite">
                Подготовка файла…
              </button>
            ) : (
              <button className="btn" onClick={() => onInstall(app.id)}>
                <Download size={14} aria-hidden="true" />
                {downloadLabel(app)}
              </button>
            )}
            <a
              className="btn btn-ghost"
              href={`/api/download/${encodeURIComponent(app.id)}`}
              download={preferredDownload(app)?.kind !== "store"}
              target={preferredDownload(app)?.kind === "store" ? "_blank" : undefined}
              rel="noopener noreferrer"
            >
              <Download size={14} aria-hidden="true" />
              {preferredDownload(app)?.kind === "store" ? "Магазин" : "Пакет"}
            </a>
            <button
              className={`icon-btn${wishlisted ? " on" : ""}`}
              onClick={() => onToggleWish(app.id)}
              aria-pressed={wishlisted}
              aria-label={wishlisted ? `Убрать ${app.name} из списка желаний` : `Добавить ${app.name} в список желаний`}
            >
              {wishlisted ? <BookmarkCheck size={18} aria-hidden="true" /> : <Bookmark size={18} aria-hidden="true" />}
            </button>
          </div>
        </div>
      </header>

      {(screens.length > 0 || app.detail.video) && (
        <section className="section" aria-labelledby="media-h">
          <div className="section-head">
            <h2 id="media-h">
              <span className="no">02 ·&nbsp;</span>Медиа
            </h2>
            <span className="section-note">скриншоты и трейлер · webp</span>
          </div>
          <div className="screens" role="list">
            {app.detail.video && (
              <figure className="screen-item screen-video">
                <img src={app.detail.video} alt={`Трейлер приложения ${app.name}`} className="screen-img screen-img-anim" />
                <figcaption>Трейлер · WebP-анимация</figcaption>
              </figure>
            )}
            {screens.map((src, i) => (
              <figure className="screen-item" key={src}>
                <button
                  className="screen-btn"
                  onClick={() => setLightbox(i)}
                  aria-label={`Открыть скриншот ${i + 1} из ${screens.length}`}
                >
                  <img src={src} alt={`${app.name} — скриншот ${i + 1}`} loading="lazy" className="screen-img" />
                </button>
                <figcaption>
                  {String(i + 1).padStart(2, "0")} / {String(screens.length).padStart(2, "0")}
                </figcaption>
              </figure>
            ))}
          </div>
        </section>
      )}

      <section className="section detail-desc" aria-labelledby="desc-h">
        <div className="section-head">
          <h2 id="desc-h">
            <span className="no">03 ·&nbsp;</span>О приложении
          </h2>
        </div>
        <div className="desc-body">
          <Description text={app.detail.description} />
        </div>
      </section>

      <section className="section" aria-labelledby="spec-h">
        <div className="section-head">
          <h2 id="spec-h">
            <span className="no">04 ·&nbsp;</span>Сведения
          </h2>
        </div>
        <dl className="spec-grid">
          <div><dt>Версия</dt><dd>{app.version}</dd></div>
          <div><dt>Размер</dt><dd>{formatSize(app.mb)}</dd></div>
          <div><dt>Разработчик</dt><dd>{app.developer}</dd></div>
          <div><dt>Сейчас установок</dt><dd>{app.downloads}</dd></div>
          <div><dt>Оценок</dt><dd>{app.ratings} · {formatRating(app.rating)}</dd></div>
          <div><dt>Обновлено</dt><dd>{app.detail.updatedRaw ?? app.updated}</dd></div>
        </dl>
      </section>

      {sameDev.length > 0 && (
        <section className="section" aria-labelledby="more-h">
          <div className="section-head">
            <h2 id="more-h">
              <span className="no">05 ·&nbsp;</span>Ещё от {app.developer}
            </h2>
          </div>
          <ul className="more-dev">
            {sameDev.map((a) => (
              <li key={a.id}>
                <AppLink to={{ name: "app", id: a.id }} className="more-dev-link" ariaLabel={`Открыть страницу ${a.name}`}>
                  <AppIcon app={a} size="sm" />
                  <span className="more-dev-name">{a.name}</span>
                  <span className="more-dev-cap">{a.genre}</span>
                  <span className="more-dev-rating">
                    <Star size={12} className="fact-star" aria-hidden="true" />
                    {formatRating(a.rating)}
                  </span>
                </AppLink>
              </li>
            ))}
          </ul>
        </section>
      )}

      {lightbox !== null && screens[lightbox] && (
        <dialog ref={lightboxDialog} className="lightbox" aria-label={`Скриншот ${lightbox + 1} из ${screens.length}`} onCancel={(event) => { event.preventDefault(); setLightbox(null); }} onClick={() => setLightbox(null)}>
          <button className="lightbox-close" aria-label="Закрыть" onClick={() => setLightbox(null)}>
            <X size={22} aria-hidden="true" />
          </button>
          <button
            className="lightbox-btn lightbox-prev"
            aria-label="Предыдущий скриншот"
            onClick={(e) => {
              e.stopPropagation();
              setLightbox((lightbox - 1 + screens.length) % screens.length);
            }}
          >
            <ChevronLeft size={26} aria-hidden="true" />
          </button>
          <img
            className="lightbox-img"
            src={screens[lightbox]}
            alt={`${app.name} — скриншот ${lightbox + 1}`}
            onClick={(e) => e.stopPropagation()}
          />
          <button
            className="lightbox-btn lightbox-next"
            aria-label="Следующий скриншот"
            onClick={(e) => {
              e.stopPropagation();
              setLightbox((lightbox + 1) % screens.length);
            }}
          >
            <ChevronRight size={26} aria-hidden="true" />
          </button>
          <div className="lightbox-count" aria-hidden="true">
            {String(lightbox + 1).padStart(2, "0")} / {String(screens.length).padStart(2, "0")}
          </div>
        </dialog>
      )}
    </div>
  );
}
