import {
  Newspaper,
  ListOrdered,
  Gamepad2,
  HardDrive,
  Bookmark,
  ArrowRight,
  Trash2,
} from "lucide-react";
import Sidebar from "./components/Sidebar";
import TopBar from "./components/TopBar";
import FeaturedPanel from "./components/FeaturedPanel";
import ChartList from "./components/ChartList";
import CategoryTiles from "./components/CategoryTiles";
import UpdatesStrip from "./components/UpdatesStrip";
import WebGamesStrip from "./components/WebGamesStrip";
import GamesIndex from "./components/GamesIndex";
import GamePage from "./components/GamePage";
import AppIcon from "./components/AppIcon";
import AppDetail from "./components/AppDetail";
import { parsePath, pathFor, routeForApp, type Route } from "./nav";
import { AppLink } from "./components/AppLink";
import { useCatalog } from "./hooks/useCatalog";
import {
  categories,
  featuredId,
  formatSize,
  type CategoryId,
} from "./data/apps";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { requestDownload } from "./services/downloads";
import type { View, SortMode } from "./types";

const TOTAL_MB = 128 * 1024;

function loadIds(key: string): string[] {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return [...new Set(parsed.filter((x): x is string => typeof x === "string" && /^[a-zA-Z0-9._-]{1,160}$/.test(x)))];
  } catch {
    return [];
  }
}

function navigateTo(route: Route, replace = false) {
  const href = pathFor(route);
  if (replace) window.history.replaceState({ route }, "", href);
  else window.history.pushState({ route }, "", href);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

const MOBILE_NAV: { id: View; label: string; icon: typeof Newspaper }[] = [
  { id: "today", label: "Сегодня", icon: Newspaper },
  { id: "chart", label: "Чарт", icon: ListOrdered },
  { id: "games", label: "Игры", icon: Gamepad2 },
  { id: "installed", label: "Мои", icon: HardDrive },
  { id: "wishlist", label: "Желания", icon: Bookmark },
];

const PAGE_TITLES: Record<string, { title: string; description: string }> = {
  today: { title: "Play Market — приложения и игры", description: "Каталог приложений и игр с выпусками редакции, чартом и свежими обновлениями." },
  chart: { title: "Чарт · бесплатные — Play Market", description: "Полный чарт бесплатных приложений и игр: по рейтингу, установкам или алфавиту." },
  games: { title: "Мгновенные игры — Play Market", description: "Змейка, 2048 и Разлом: работают локально в браузере, ноль скачивания." },
  installed: { title: "Мои загрузки — Play Market", description: "Локальная история загрузок из каталога приложений." },
  wishlist: { title: "Список желаний — Play Market", description: "Приложения, которые хотите установить позже." },
};

export default function App() {
  const [route, setRoute] = useState<Route>(() => parsePath(window.location.pathname));
  const [query, setQuery] = useState("");
  const [activeCat, setActiveCat] = useState<CategoryId>("all");
  const [sort, setSort] = useState<SortMode>("rating");
  const [installed, setInstalled] = useState<string[]>(() => loadIds("pm.installed"));
  const [wishlist, setWishlist] = useState<string[]>(() => loadIds("pm.wishlist"));
  const [progress, setProgress] = useState<Record<string, number>>({});
  const [toast, setToast] = useState<{ id: number; text: string } | null>(null);

  const catalog = useCatalog();
  const appById = useMemo(() => new Map(catalog.map((app) => [app.id, app])), [catalog]);
  const activeDownloads = useRef(new Map<string, AbortController>());
  useEffect(() => () => { activeDownloads.current.forEach((controller) => controller.abort()); activeDownloads.current.clear(); }, []);
  const view: View | null =
    route.name === "today" ||
    route.name === "chart" ||
    route.name === "games" ||
    route.name === "installed" ||
    route.name === "wishlist"
      ? route.name
      : null;

  useEffect(() => {
    const onPop = () => setRoute(parsePath(window.location.pathname));
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  // /apps/web.* — не страница приложения, а прямой вход в игру
  useEffect(() => {
    if (route.name === "app") {
      const a = appById.get(route.id);
      if (a?.kind === "web" && a.game) navigateTo({ name: "game", slug: a.game }, true);
    }
  }, [route, appById]);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [route]);

  useEffect(() => {
    try {
      localStorage.setItem("pm.installed", JSON.stringify(installed));
    } catch {
      /* noop */
    }
  }, [installed]);

  useEffect(() => {
    try {
      localStorage.setItem("pm.wishlist", JSON.stringify(wishlist));
    } catch {
      /* noop */
    }
  }, [wishlist]);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 3600);
    return () => window.clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    const info = view && PAGE_TITLES[view];
    const metaDesc = document.querySelector<HTMLMetaElement>('meta[name="description"]');
    if (route.name === "app") {
      const app = appById.get(route.id);
      document.title = app ? `${app.name} — ${app.developer} | Play Market` : "Play Market — приложения и игры";
      const desc = app?.detail.itempropDescription || app?.detail.description.slice(0, 160) || "Приложение для Android.";
      if (metaDesc) metaDesc.content = desc.slice(0, 200);
      return;
    }
    if (route.name === "game") {
      const g = Array.from(appById.values()).find((a) => a.kind === "web" && a.game === route.slug);
      document.title = g ? `${g.name} — мгновенная игра | Play Market` : "Мгновенная игра — Play Market";
      if (metaDesc && g) metaDesc.content = g.detail.itempropDescription;
      return;
    }
    document.title = info?.title ?? "Play Market — приложения и игры";
    if (metaDesc) metaDesc.content = info?.description ?? PAGE_TITLES.today.description;
  }, [route, view, appById]);

  const flash = useCallback((text: string) => setToast({ id: Date.now(), text }), []);

  const install = useCallback(async (id: string) => {
    const app = appById.get(id);
    if (app?.kind === "web") {
      if (app.game) navigateTo({ name: "game", slug: app.game });
      return;
    }
    if (!app || activeDownloads.current.has(id)) return;
    const controller = new AbortController();
    activeDownloads.current.set(id, controller);
    setProgress((current) => ({ ...current, [id]: 0 }));
    try {
      await requestDownload(id, controller.signal);
      if (controller.signal.aborted) return;
      setInstalled((list) => list.includes(id) ? list : [...list, id]);
      setToast({ id: Date.now(), text: "Файл передан браузеру. Статус загрузки — в панели браузера." });
    } catch (error) {
      if (!controller.signal.aborted) setToast({ id: Date.now(), text: error instanceof Error ? error.message : "Не удалось загрузить файл. Проверьте соединение." });
    } finally {
      activeDownloads.current.delete(id);
      if (!controller.signal.aborted) setProgress((current) => { const next = { ...current }; delete next[id]; return next; });
    }
  }, [appById]);

  const uninstall = useCallback((id: string) => {
    setInstalled((list) => list.filter((x) => x !== id));
    flash(`${appById.get(id)?.name ?? "Приложение"} убрано из истории`);
  }, [appById, flash]);

  const toggleWish = useCallback((id: string) => {
    const on = wishlist.includes(id);
    setWishlist((list) => list.includes(id) ? list.filter((item) => item !== id) : [id, ...list]);
    flash(on ? `${appById.get(id)?.name ?? "Приложение"} убрано из списка желаний` : `${appById.get(id)?.name ?? "Приложение"} в списке желаний`);
  }, [wishlist, appById, flash]);

  const open = useCallback((id: string) => {
    navigateTo({ name: "app", id });
  }, []);

  const navigateView = useCallback((v: View) => navigateTo({ name: v }), []);

  const onQuery = useCallback((v: string) => {
    setQuery(v);
    if (v.trim() && (route.name !== "today" && route.name !== "chart")) {
      navigateTo({ name: "chart" });
    }
  }, [route.name]);

  const installedApps = useMemo(
    () => installed.map((id) => appById.get(id)).filter((a) => a !== undefined),
    [installed, appById]
  );
  const wishlistApps = useMemo(
    () => wishlist.map((id) => appById.get(id)).filter((a) => a !== undefined),
    [wishlist, appById]
  );
  const usedMb = installedApps.reduce((sum, a) => sum + a.mb, 0);
  const featured = catalog.find((app) => app.id === featuredId) ?? catalog.find((app) => app.kind !== "web") ?? catalog[0];

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const rows = catalog.filter(
      (a) =>
        (activeCat === "all" || a.category === activeCat) &&
        (!q ||
          a.name.toLowerCase().includes(q) ||
          a.developer.toLowerCase().includes(q) ||
          a.genre.toLowerCase().includes(q))
    );
    return [...rows].sort((a, b) =>
      sort === "name"
        ? a.name.localeCompare(b.name, "ru")
        : sort === "downloads"
          ? b.downloadsM - a.downloadsM
          : b.rating - a.rating
    );
  }, [catalog, query, activeCat, sort]);

  const appRoute = route.name === "app" ? route : null;
  const appDetail = appRoute ? appById.get(appRoute.id) : undefined;

  const categoryChips = (
    <div className="chips" role="group" aria-label="Фильтр по разделам">
      {categories.map((c) => (
        <button
          key={c.id}
          aria-pressed={activeCat === c.id}
          className="chip"
          data-active={activeCat === c.id}
          onClick={() => setActiveCat(c.id)}
        >
          {c.label}
        </button>
      ))}
      <label className="sort-select-wrap">
        <select
          className="sort-select"
          value={sort}
          onChange={(e) => setSort(e.target.value as SortMode)}
          aria-label="Сортировка чарта"
        >
          <option value="rating">По рейтингу</option>
          <option value="downloads">По установкам</option>
          <option value="name">По алфавиту</option>
        </select>
      </label>
    </div>
  );

  return (
    <div className="shell">
      <Sidebar
        current={view}
        onNavigate={navigateView}
        installedCount={installed.length}
        wishlistCount={wishlist.length}
        usedMb={usedMb}
        totalMb={TOTAL_MB}
      />

      <main className="main">
        <TopBar
          onQuery={onQuery}
          onNavigate={navigateView}
          installedCount={installed.length}
          wishlistCount={wishlist.length}
        />

        <div className="content">
          {view === "today" && (
            <>
              <div className="standfirst">
                <h1>
                  Ваш следующий любимый запуск
                </h1>
                <div className="issue" aria-label="Выпуск">
                  <b>Игры и приложения</b>{catalog.length} позиций в каталоге<br />Игры запускаются прямо здесь
                </div>
              </div>

              {featured && <FeaturedPanel
                app={featured}
                installed={installed.includes(featured.id)}
                progress={progress[featured.id]}
                wishlisted={wishlist.includes(featured.id)}
                onInstall={install}
                onToggleWish={toggleWish}
              />}

              <section className="section" aria-labelledby="chart-h">
                <div className="section-head">
                  <h2 id="chart-h">
                    <span className="no">02 ·&nbsp;</span>Топ-чарт
                  </h2>
                  <span className="section-note">бесплатные · {visible.length} позиций</span>
                </div>

                {categoryChips}

                <div style={{ height: 14 }} />
                <ChartList
                  rows={visible.slice(0, 8)}
                  installedIds={installed}
                  wishlistIds={wishlist}
                  progress={progress}
                  onInstall={install}
                  onUninstall={uninstall}
                  onToggleWish={toggleWish}
                />
                <div className="catalog-more"><button className="btn btn-ghost" onClick={() => navigateView("chart")}>Весь каталог · {visible.length}</button></div>
              </section>

              <section className="section" aria-labelledby="games-home-h">
                <div className="section-head">
                  <h2 id="games-home-h">
                    <span className="no">03 ·&nbsp;</span>Мгновенные игры
                  </h2>
                  <span className="section-note">в браузере · 0 МБ на диске</span>
                </div>
                <WebGamesStrip />
              </section>

              <section className="section" aria-labelledby="tiles-h">
                <div className="section-head">
                  <h2 id="tiles-h">
                    <span className="no">04 ·&nbsp;</span>Разделы
                  </h2>
                  <span className="section-note">нажмите, чтобы отфильтровать чарт</span>
                </div>
                <CategoryTiles active={activeCat} onSelect={(category) => { setActiveCat(category); navigateView("chart"); }} />
              </section>

              <section className="section" aria-labelledby="fresh-h">
                <div className="section-head">
                  <h2 id="fresh-h">
                    <span className="no">05 ·&nbsp;</span>Свежие обновления
                  </h2>
                  <span className="section-note">что прилетело на телефон за неделю</span>
                </div>
                <UpdatesStrip />
              </section>
            </>
          )}

          {view === "games" && <GamesIndex />}

          {route.name === "game" && <GamePage slug={route.slug} />}

          {view === "chart" && (
            <section className="section" style={{ marginTop: 12 }} aria-labelledby="chart-full-h">
              <div className="standfirst" style={{ paddingBottom: 18 }}>
                <h1 id="chart-full-h">Чарт · бесплатные</h1>
                <div className="issue">
                  <b>ПОЛНЫЙ ЧАРТ</b>
                  {visible.length} позиций
                  <br />
                  оценки Play Store
                </div>
              </div>
              {categoryChips}
              <div style={{ height: 14 }} />
              <ChartList
                rows={visible}
                installedIds={installed}
                wishlistIds={wishlist}
                progress={progress}
                onInstall={install}
                onUninstall={uninstall}
                onToggleWish={toggleWish}
              />
            </section>
          )}

          {view === "installed" && (
            <section className="section" style={{ marginTop: 12 }} aria-labelledby="installed-h">
              <div className="standfirst" style={{ paddingBottom: 18 }}>
                <h1 id="installed-h">Мои загрузки</h1>
                <div className="issue">
                  <b>История на этом устройстве</b>
                  {installedApps.length} приложений
                  <br />
                  {formatSize(usedMb)} — размеры файлов
                </div>
              </div>

              {installedApps.length === 0 ? (
                <div className="view-empty">
                  <b>Пока пусто</b>
                  Загрузки из каталога появятся здесь. Файлами и установкой управляют браузер и устройство.
                  <div style={{ marginTop: 16 }}>
                    <button className="btn" onClick={() => navigateView("chart")}>
                      Смотреть чарт
                      <ArrowRight size={14} aria-hidden="true" />
                    </button>
                  </div>
                </div>
              ) : (
                <ul className="list">
                  {installedApps.map((app) => (
                    <li key={app.id}>
                      <AppLink to={routeForApp(app)} className="row-link" ariaLabel={`Открыть страницу ${app.name}`} />
                      <AppIcon app={app} size="sm" />
                      <div className="list-main">
                        <b>{app.name}</b>
                        <span>
                          {formatSize(app.mb)} · {app.developer}
                        </span>
                      </div>
                      <button className="btn btn-ghost btn-sm" onClick={() => open(app.id)}>
                        Подробнее
                      </button>
                      <button className="icon-btn" onClick={() => uninstall(app.id)} aria-label={`Удалить ${app.name}`}>
                        <Trash2 size={16} aria-hidden="true" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}

          {view === "wishlist" && (
            <section className="section" style={{ marginTop: 12 }} aria-labelledby="wishlist-h">
              <div className="standfirst" style={{ paddingBottom: 18 }}>
                <h1 id="wishlist-h">Список желаний</h1>
                <div className="issue">
                  <b>ОТЛОЖЕНО</b>
                  {wishlistApps.length} приложений
                </div>
              </div>

              {wishlistApps.length === 0 ? (
                <div className="view-empty">
                  <b>Список желаний пуст</b>
                  Нажмите на закладку в чарте — приложение отложится сюда.
                  <div style={{ marginTop: 16 }}>
                    <button className="btn" onClick={() => navigateView("chart")}>
                      Смотреть чарт
                      <ArrowRight size={14} aria-hidden="true" />
                    </button>
                  </div>
                </div>
              ) : (
                <ul className="list">
                  {wishlistApps.map((app) => (
                    <li key={app.id}>
                      <AppLink to={routeForApp(app)} className="row-link" ariaLabel={`Открыть страницу ${app.name}`} />
                      <AppIcon app={app} size="sm" />
                      <div className="list-main">
                        <b>{app.name}</b>
                        <span>
                          {formatSize(app.mb)} · {app.genre}
                        </span>
                      </div>
                      {app.kind === "web" ? (
                        <AppLink to={routeForApp(app)} className="btn btn-ghost btn-sm">
                          Играть
                        </AppLink>
                      ) : (
                        <button className="btn btn-ghost btn-sm" disabled={progress[app.id] !== undefined} onClick={() => install(app.id)}>
                          {progress[app.id] !== undefined ? "Подготовка…" : "Скачать"}
                        </button>
                      )}
                      <button className="icon-btn on" onClick={() => toggleWish(app.id)} aria-label={`Убрать ${app.name} из списка желаний`}>
                        <Bookmark size={16} aria-hidden="true" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}

          {appDetail && appDetail.kind !== "web" && (
            <AppDetail
              key={appDetail.id}
              app={appDetail}
              installed={installed.includes(appDetail.id)}
              busy={progress[appDetail.id]}
              wishlisted={wishlist.includes(appDetail.id)}
              onInstall={install}
              onUninstall={uninstall}
              onToggleWish={toggleWish}
            />
          )}

          {route.name === "app" && !appDetail && (
            <section className="section" style={{ marginTop: 12 }} aria-labelledby="app-404-h">
              <div className="view-empty">
                <b id="app-404-h">Приложение не найдено</b>
                В каталоге нет такой позиции: {route.id}
                <div style={{ marginTop: 16 }}>
                  <button className="btn" onClick={() => navigateView("chart")}>
                    Смотреть чарт
                    <ArrowRight size={14} aria-hidden="true" />
                  </button>
                </div>
              </div>
            </section>
          )}

          {route.name === "notfound" && (
            <section className="section" style={{ marginTop: 12 }} aria-labelledby="nf-h">
              <div className="view-empty">
                <b id="nf-h">Страницы нет</b>
                А по адресу {route.path} пусто.
                <div style={{ marginTop: 16 }}>
                  <button className="btn" onClick={() => navigateView("today")}>
                    На витрину
                    <ArrowRight size={14} aria-hidden="true" />
                  </button>
                </div>
              </div>
            </section>
          )}

          <footer className="colophon">
            <div>
              <strong>PLAY MARKET</strong>
              Приложения для устройства.<br />Игры для короткого перерыва.
            </div>
            <ul>
              <li>Оценки и версии взяты из каталога Play Store</li>
              <li>Установка файлов выполняется на вашем устройстве</li>
              <li>Не является магазином Google и не связан с ним</li>
            </ul>
          </footer>
        </div>
      </main>

      <nav className="mobile-bar" aria-label="Разделы">
        {MOBILE_NAV.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            className={`mobile-item${view === id ? " active" : ""}`}
            onClick={() => navigateView(id)}
            aria-current={view === id ? "page" : undefined}
          >
            <Icon size={18} aria-hidden="true" />
            {label}
          </button>
        ))}
      </nav>

      {toast && (
        <div className="toast" role="status" aria-live="polite">
          {toast.text}
        </div>
      )}
    </div>
  );
}
