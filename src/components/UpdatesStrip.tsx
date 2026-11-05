import { routeForApp } from "../nav";
import { AppLink } from "./AppLink";
import { formatSize, type CatalogApp } from "../data/apps";
import { useCatalog } from "../hooks/useCatalog";

const MONTHS: Record<string, string> = {
  "01": "января",
  "02": "февраля",
  "03": "марта",
  "04": "апреля",
  "05": "мая",
  "06": "июня",
  "07": "июля",
  "08": "августа",
  "09": "сентября",
  "10": "октября",
  "11": "ноября",
  "12": "декабря",
};

function formatFresh(iso: string): string {
  const [, m, d] = iso.split("-");
  return `${Number(d)} ${MONTHS[m] ?? m}`;
}

export default function UpdatesStrip() {
  const catalog = useCatalog();
  const rows = catalog.filter((app) => app.fresh)
    .sort((a, b) => b.fresh.localeCompare(a.fresh))
    .slice(0, 8);

  return (
    <div className="updates" aria-label="Свежие обновления каталога">
      {rows.map((app: CatalogApp) => (
        <AppLink key={app.id} to={routeForApp(app)} className="update-card" ariaLabel={`Открыть страницу ${app.name}`}>
          <div className="date">{formatFresh(app.fresh).toUpperCase()} · ОБНОВЛЕНИЕ</div>
          <h4>{app.name}</h4>
          <p>
            <span className="dot" aria-hidden="true" />
            версия {app.version}
          </p>
          <p style={{ marginTop: 6 }}>весит {formatSize(app.mb)}</p>
        </AppLink>
      ))}
    </div>
  );
}
