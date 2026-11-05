// Generates prerendered static HTML for every app page in dist/apps/<id>/index.html,
// plus robots.txt and sitemap.xml using PUBLIC_URL (default http://localhost:5173).
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const BASE_URL = (process.env.PUBLIC_URL || "http://localhost:8088").replace(/\/+$/, "");
const ROOT = fileURLToPath(new URL("..", import.meta.url));
const DIST = join(ROOT, "dist");

const base = JSON.parse(await readFile(join(ROOT, "scripts", "base.json"), "utf8"));
const details = JSON.parse(await readFile(join(ROOT, "src", "data", "details.json"), "utf8"));
const schemaCategory = new Map([
  ["social", "SocialNetworkingApplication"],
  ["video", "MultimediaApplication"],
  ["games", "GameApplication"],
  ["finance", "FinanceApplication"],
  ["productivity", "BusinessApplication"],
  ["music", "MusicApplication"],
  ["photo", "MultimediaApplication"],
  ["tools", "UtilitiesApplication"],
  ["sport", "GameApplication"],
]);

const esc = (s) =>
  String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const initials = (name) => {
  const words = String(name).replace(/[^A-Za-zА-Яа-яЁё0-9 ]/g, "").split(" ").filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return words.slice(0, 2).map((w) => w[0]).join("").toUpperCase();
};

const formatSize = (mb) => (mb >= 1024 ? `${(mb / 1024).toFixed(1).replace(".", ",")} ГБ` : `${mb} МБ`);
const formatRating = (r) => r.toFixed(1).replace(".", ",");
const parseCount = (s) => {
  const m = String(s).match(/([\d\s]+(?:,\d+)?)/);
  if (!m) return null;
  const num = parseFloat(m[1].replace(/\s/g, "").replace(",", "."));
  const unit = /млрд/i.test(s) ? 1e9 : /млн/i.test(s) ? 1e6 : /тыс/i.test(s) ? 1e3 : 1;
  return Math.round(num * unit);
};

// Read entry links rather than picking an arbitrary lazy game chunk.
const shell = await readFile(join(DIST, "index.html"), "utf8");
const cssHref = shell.match(/<link[^>]+href="([^"]+\.css)"/)?.[1];
const jsHref = shell.match(/<script[^>]+src="([^"]+\.js)"/)?.[1];
if (!cssHref || !jsHref) throw new Error("Missing Vite entry assets");

const appIconHtml = (app) => {
  const fg = app.ink === "light" ? "#ffffff" : "#141414";
  return `<div class="app-icon sz-lg" style="background:${app.color};color:${fg}" aria-hidden="true"><span>${esc(initials(app.name))}</span></div>`;
};

const descBlocks = (text) =>
  String(text || "")
    .split(/\n{2,}/)
    .map((b) => b.trim())
    .filter(Boolean);

const escape = (s) =>
  String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const WEB_GAMES = [
  {
    id: "web.snake",
    slug: "snake",
    name: "Змейка",
    genre: "Аркада",
    rating: 4.8,
    controls: "Стрелки или WASD — направление, пробел — пауза, R — заново. На телефоне — свайп или экранная крестовина.",
  },
  {
    id: "web.2048",
    slug: "2048",
    name: "2048",
    genre: "Головоломка",
    rating: 4.7,
    controls: "Стрелки или WASD — сдвиг поля, R — новая партия. На телефоне — свайп.",
  },
  {
    id: "web.razlom",
    slug: "razlom",
    name: "Разлом",
    genre: "Аркада",
    rating: 4.6,
    controls: "Мышь или A/D / стрелки — платформа, пробел — запуск мяча, R — заново. На телефоне — ведите пальцем по полю.",
  },
];

for (const game of WEB_GAMES) {
  const d = details[game.id] ?? {};
  const desc = String(d.itempropDescription || "").trim();
  const fullDesc = String(d.description || desc);
  const fullHtml = descBlocks(fullDesc)
    .map((b) => (b.startsWith("## ") ? `<h3>${escape(b.slice(3).trim())}</h3>` : `<p>${escape(b)}</p>`))
    .join("\n");
  const title = `${game.name} — мгновенная игра | Play Market`;
  const description = desc || `${game.name} — игра, которая работает прямо в браузере.`;
  const mediaDir = `/media/${game.id}`;
  const html = `<!doctype html>
<html lang="ru">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    <meta name="theme-color" content="#f4f1e8" />
    <title>${escape(title)}</title>
    <meta name="description" content="${escape(description)}" />
    <meta property="og:title" content="${escape(title)}" />
    <meta property="og:description" content="${escape(description)}" />
    <meta property="og:image" content="${BASE_URL}${mediaDir}/icon.webp" />
    <meta property="og:type" content="website" />
    <link rel="canonical" href="${BASE_URL}/games/${game.slug}" />
    <script type="application/ld+json">${JSON.stringify({
      "@context": "https://schema.org",
      "@type": "Game",
      name: game.name,
      description,
      gamePlatform: ["Web browser"],
      applicationCategory: "GameApplication",
      author: { "@type": "Organization", name: "Play Market Studio" },
      aggregateRating: { "@type": "AggregateRating", ratingValue: String(game.rating), ratingCount: "1000" },
      offers: { "@type": "Offer", price: "0", priceCurrency: "KZT" },
    }).replace(/</g, "\\u003c")}</script>
    <link rel="stylesheet" href="${cssHref}" />
  </head>
  <body>
    <div id="root" data-prerendered="true">
      <div class="shell">
        <main class="main">
          <div class="content">
            <div class="detail">
              <nav class="crumbs" aria-label="Хлебные крошки">
                <a class="crumbs-link" href="/games">Игры</a>
                <span>/</span>
                <span class="crumbs-genre">Веб-игра</span>
                <span>/</span>
                <span aria-current="page">${escape(game.name)}</span>
              </nav>
              <header class="detail-hero">
                <img class="app-icon-img sz-lg" src="${mediaDir}/icon.webp" alt="${escape(game.name)}" width="256" height="256" />
                <div class="detail-hero-main">
                  <div class="feature-kicker" style="color: var(--accent)">МГНОВЕННАЯ ИГРА · 0 МБ</div>
                  <h1>${escape(game.name)}</h1>
                  <p class="detail-dev">PLAY MARKET STUDIO · ${escape(game.genre.toUpperCase())}</p>
                  <p class="detail-lead">${escape(description)}</p>
                  <div class="detail-actions">
                    <a class="btn" href="/games/${game.slug}">Играть в браузере</a>
                  </div>
                </div>
              </header>
              <section class="section" aria-labelledby="ctrl-h">
                <div class="section-head"><h2 id="ctrl-h"><span class="no">01 ·&nbsp;</span>Управление</h2></div>
                <p class="detail-lead" style="max-width: 900px">${escape(game.controls)}</p>
              </section>
              <section class="section detail-desc" aria-labelledby="desc-h">
                <div class="section-head"><h2 id="desc-h"><span class="no">02 ·&nbsp;</span>О игре</h2></div>
                <div class="desc-body">${fullHtml}</div>
              </section>
            </div>
            <footer class="colophon">
              <div><strong>PLAY MARKET</strong>Каталог приложений и игр,<br />сделанный вручную</div>
              <ul>
                <li>Игра работает локально, загрузка — один раз</li>
                <li>Предмет: ${escape(game.name)} · веб-игра</li>
                <li>Не является магазином Google и не связан с ним</li>
              </ul>
            </footer>
          </div>
        </main>
      </div>
    </div>
    <script type="module" src="${jsHref}"></script>
  </body>
</html>
`;
  const dir = join(DIST, "games", game.slug);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "index.html"), html, "utf8");
}

// games index page
{
  const cards = WEB_GAMES.map(
    (g, i) => `        <a class="game-card" href="/games/${g.slug}">
          <span class="game-card-no">${String(i + 1).padStart(2, "0")}</span>
          <img class="app-icon-img sz-lg" src="/media/${g.id}/icon.webp" alt="${escape(g.name)}" width="256" height="256" />
          <span class="game-card-body">
            <span class="game-card-name">${escape(g.name)}</span>
            <span class="game-card-cap">${escape(g.genre)} · рейтинг ${g.rating.toFixed(1)}</span>
          </span>
          <span class="game-card-cta">Играть →</span>
        </a>`
  ).join("\n");
  const html = `<!doctype html>
<html lang="ru">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    <meta name="theme-color" content="#f4f1e8" />
    <title>Мгновенные игры — Play Market</title>
    <meta name="description" content="Змейка, 2048 и Разлом: игры, которые работают локально в браузере. Ноль скачивания, ноль мегабайт." />
    <meta property="og:title" content="Мгновенные игры — Play Market" />
    <meta property="og:description" content="Змейка, 2048 и Разлом: игры, которые работают локально в браузере." />
    <meta property="og:image" content="${BASE_URL}/media/web.snake/icon.webp" />
    <meta property="og:type" content="website" />
    <link rel="canonical" href="${BASE_URL}/games" />
    <link rel="stylesheet" href="${cssHref}" />
  </head>
  <body>
    <div id="root" data-prerendered="true">
      <div class="shell">
        <main class="main">
          <div class="content">
            <section class="section" style="margin-top: 12px" aria-labelledby="games-h">
              <div class="standfirst" style="padding-bottom: 18px">
                <h1 id="games-h">Мгновенные игры</h1>
                <div class="issue"><b>БЕЗ СКАЧИВАНИЯ</b>3 игры в браузере<br />ноль мегабайт на диске</div>
              </div>
              <div class="games-index">
${cards}
              </div>
            </section>
          </div>
        </main>
      </div>
    </div>
    <script type="module" src="${jsHref}"></script>
  </body>
</html>
`;
  const dir = join(DIST, "games");
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "index.html"), html, "utf8");
}

for (const app of base) {
  const d = details[app.id] ?? {};
  const blocks = descBlocks(d.description);
  let descHtml = "";
  for (const b of blocks) {
    if (b.startsWith("## ")) {
      descHtml += `<h3>${esc(b.slice(3).trim())}</h3>\n`;
      continue;
    }
    const lines = b.split("\n").map((l) => l.trim()).filter(Boolean);
    const isList = lines.length > 1 && lines.every((l) => /^[—–-]/.test(l));
    if (isList) {
      descHtml += `<ul>${lines.map((l) => `<li>${esc(l.replace(/^[—–-]\s*/, ""))}</li>`).join("")}</ul>\n`;
    } else {
      descHtml += `<p>${esc(b)}</p>\n`;
    }
  }

  const screens = (d.screenshots ?? []).map(
    (src, i) => `      <figure class="screen-item"><img class="screen-img" src="${esc(src)}" alt="${esc(app.name)} — скриншот ${i + 1}" width="1052" height="592" loading="lazy"><figcaption>${String(i + 1).padStart(2, "0")} / ${String((d.screenshots ?? []).length).padStart(2, "0")}</figcaption></figure>`
  ).join("\n");

  const videoBlock = d.video
    ? `      <figure class="screen-item screen-video"><img class="screen-img screen-img-anim" src="${esc(d.video)}" alt="Трейлер приложения ${esc(app.name)}" width="640" height="360"><figcaption>Трейлер · WebP-анимация</figcaption></figure>`
    : "";

  const mediaBlock = d.video || screens
    ? `<section class="section" aria-labelledby="media-h">
  <div class="section-head">
    <h2 id="media-h"><span class="no">02 ·&nbsp;</span>Медиа</h2>
    <span class="section-note">скриншоты и трейлер · webp</span>
  </div>
  <div class="screens" role="list">
${videoBlock ? videoBlock + "\n" : ""}${screens}
  </div>
</section>`
    : "";

  const title = `${app.name} — ${app.developer} | Play Market`;
  const desc = String(d.itempropDescription || d.description || `${app.name} для Android.`)
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 200);
  const image = d.poster || (d.screenshots && d.screenshots[0]) || "/favicon.svg";
  const updatedRaw = d.updatedRaw ?? app.updated;
  const ogImage = image.startsWith("http") ? image : `${BASE_URL}${image}`;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "MobileApplication",
    name: app.name,
    description: desc,
    applicationCategory: schemaCategory.get(app.category) ?? "UtilitiesApplication",
    operatingSystem: "Android",
    author: { "@type": "Organization", name: app.developer },
    aggregateRating: { "@type": "AggregateRating", ratingValue: String(app.rating), ratingCount: String(parseCount(app.ratings) ?? 100000) },
    offers: { "@type": "Offer", price: "0", priceCurrency: "KZT" },
  };

  const sameDev = base.filter((a) => a.developer === app.developer && a.id !== app.id).slice(0, 3);
  const moreDevHtml = sameDev.length
    ? `<section class="section" aria-labelledby="more-h">
  <div class="section-head"><h2 id="more-h"><span class="no">05 ·&nbsp;</span>Ещё от ${esc(app.developer)}</h2></div>
  <ul class="more-dev">
${sameDev
  .map(
    (a) => `    <li><a class="more-dev-link" href="/apps/${esc(a.id)}"><div class="app-icon sz-sm" style="background:${a.color};color:${a.ink === "light" ? "#fff" : "#141414"}" aria-hidden="true"><span>${esc(initials(a.name))}</span></div><span><span class="more-dev-name">${esc(a.name)}</span><span class="more-dev-cap">${esc(a.genre)}</span></span><span class="more-dev-rating">${formatRating(a.rating)}</span></a></li>`
  )
  .join("\n")}
  </ul>
</section>`
    : "";

  const html = `<!doctype html>
<html lang="ru">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    <meta name="theme-color" content="#f4f1e8" />
    <title>${esc(title)}</title>
    <meta name="description" content="${esc(desc)}" />
    <meta property="og:title" content="${esc(title)}" />
    <meta property="og:description" content="${esc(desc)}" />
    <meta property="og:image" content="${esc(ogImage)}" />
    <meta property="og:type" content="website" />
    <link rel="canonical" href="${BASE_URL}/apps/${esc(app.id)}" />
    <script type="application/ld+json">${JSON.stringify(jsonLd).replace(/</g, "\\u003c")}</script>
    <link rel="stylesheet" href="${cssHref}" />
  </head>
  <body>
    <div id="root" data-prerendered="true">
      <div class="shell">
        <main class="main">
          <div class="content">
            <div class="detail">
              <nav class="crumbs" aria-label="Хлебные крошки">
                <a class="crumbs-link" href="/chart">Каталог</a>
                <span>/</span>
                <span class="crumbs-genre">${esc(app.genre)}</span>
                <span>/</span>
                <span aria-current="page">${esc(app.name)}</span>
              </nav>
              <header class="detail-hero">
                ${appIconHtml(app)}
                <div class="detail-hero-main">
                  <h1>${esc(app.name)}</h1>
                  <p class="detail-dev">${esc(app.developer.toUpperCase())} · ${esc(app.genre.toUpperCase())}</p>
                  <p class="detail-lead">${esc(desc)}</p>
                  <div class="detail-facts" aria-label="Ключевые цифры">
                    <div class="fact"><span class="fact-num">${formatRating(app.rating)}</span><span class="fact-cap">${esc(app.ratings)} оценок</span></div>
                    <div class="fact"><span class="fact-num">${esc(app.downloads)}</span><span class="fact-cap">Установок</span></div>
                    <div class="fact"><span class="fact-num">${esc(formatSize(app.mb))}</span><span class="fact-cap">Вес</span></div>
                    <div class="fact"><span class="fact-num">${esc(updatedRaw)}</span><span class="fact-cap">Обновлено</span></div>
                  </div>
                  <div class="detail-actions">
                    <a class="btn" href="/apps/${esc(app.id)}">Установить</a>
                  </div>
                </div>
              </header>
              ${mediaBlock}
              <section class="section detail-desc" aria-labelledby="desc-h">
                <div class="section-head"><h2 id="desc-h"><span class="no">03 ·&nbsp;</span>О приложении</h2></div>
                <div class="desc-body">
${descHtml}                </div>
              </section>
              <section class="section" aria-labelledby="spec-h">
                <div class="section-head"><h2 id="spec-h"><span class="no">04 ·&nbsp;</span>Сведения</h2></div>
                <dl class="spec-grid">
                  <div><dt>Версия</dt><dd>${esc(app.version)}</dd></div>
                  <div><dt>Размер</dt><dd>${esc(formatSize(app.mb))}</dd></div>
                  <div><dt>Разработчик</dt><dd>${esc(app.developer)}</dd></div>
                  <div><dt>Сейчас установок</dt><dd>${esc(app.downloads)}</dd></div>
                  <div><dt>Оценок</dt><dd>${esc(app.ratings)} · ${formatRating(app.rating)}</dd></div>
                  <div><dt>Обновлено</dt><dd>${esc(updatedRaw)}</dd></div>
                </dl>
              </section>
              ${moreDevHtml}
            </div>
            <footer class="colophon">
              <div><strong>PLAY MARKET</strong>Каталог приложений и игр,<br />сделанный вручную</div>
              <ul>
                <li>Оценки и версии сверены с Play Store</li>
                <li>Предмет: ${esc(app.name)} · ${esc(app.genre)}</li>
                <li>Не является магазином Google и не связан с ним</li>
              </ul>
            </footer>
          </div>
        </main>
      </div>
    </div>
    <script type="module" src="${jsHref}"></script>
  </body>
</html>
`;

  const dir = join(DIST, "apps", app.id);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "index.html"), html, "utf8");
}

const urls = [
  { loc: `${BASE_URL}/`, changefreq: "daily", priority: "1.0" },
  { loc: `${BASE_URL}/chart`, changefreq: "daily", priority: "0.9" },
  { loc: `${BASE_URL}/games`, changefreq: "daily", priority: "0.8" },
  { loc: `${BASE_URL}/games/snake`, changefreq: "weekly", priority: "0.6" },
  { loc: `${BASE_URL}/games/2048`, changefreq: "weekly", priority: "0.6" },
  { loc: `${BASE_URL}/games/razlom`, changefreq: "weekly", priority: "0.6" },
  ...base.map((a) => ({ loc: `${BASE_URL}/apps/${encodeURIComponent(a.id)}`, changefreq: "weekly", priority: "0.7" })),
];

await writeFile(
  join(DIST, "robots.txt"),
  `User-agent: *\nAllow: /\nSitemap: ${BASE_URL}/sitemap.xml\n`,
  "utf8"
);
await writeFile(
  join(DIST, "sitemap.xml"),
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    urls
      .map(
        (u) => `  <url><loc>${esc(u.loc)}</loc><changefreq>${u.changefreq}</changefreq><priority>${u.priority}</priority></url>`
      )
      .join("\n") +
    `\n</urlset>\n`,
  "utf8"
);
console.log(`prerendered ${base.length} app pages + robots.txt + sitemap.xml (BASE_URL=${BASE_URL})`);
