// Renders the three first-party web-game logos to 256x256 WebP icons.
import { writeFile, rm, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { Resvg } from "@resvg/resvg-js";

const execFileP = promisify(execFile);
const CWEBP = "C:\\msys64\\ucrt64\\bin\\cwebp.exe";
const ROOT = new URL("..", import.meta.url).pathname.replace(/^\/+/, "");
const GAMES = ["web.snake", "web.2048", "web.razlom", "web.memory", "web.pong", "web.reaction"];

const svg = (body) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256">${body}</svg>`;

const ICONS = {
  "web.snake": svg(`
<rect width="256" height="256" rx="48" fill="#141414"/>
<path d="M56 150 h64 v-56 h48 v52 h56" fill="none" stroke="#00f076" stroke-width="34" stroke-linecap="round" stroke-linejoin="round"/>
<circle cx="196" cy="74" r="22" fill="#ff3a44"/>
<circle cx="70" cy="156" r="9" fill="#00f076"/>`),
  "web.2048": svg(`
<rect width="256" height="256" rx="48" fill="#141414"/>
<rect x="30" y="30" width="88" height="88" rx="12" fill="#ece8dc"/>
<rect x="138" y="30" width="88" height="88" rx="12" fill="#ffe000"/>
<rect x="30" y="138" width="88" height="88" rx="12" fill="#ff7a1f"/>
<rect x="138" y="138" width="88" height="88" rx="12" fill="#ff3a44"/>
<text x="74" y="88" font-family="Archivo Black, Arial" font-size="44" text-anchor="middle" fill="#141414">2</text>
<text x="182" y="88" font-family="Archivo Black, Arial" font-size="44" text-anchor="middle" fill="#141414">4</text>
<text x="74" y="196" font-family="Archivo Black, Arial" font-size="44" text-anchor="middle" fill="#141414">16</text>
<text x="182" y="196" font-family="Archivo Black, Arial" font-size="40" text-anchor="middle" fill="#fff6ef">2048</text>`),
  "web.razlom": svg(`
<rect width="256" height="256" rx="48" fill="#141414"/>
<rect x="28" y="36" width="58" height="26" fill="#ff3a44"/>
<rect x="98" y="36" width="58" height="26" fill="#ff7a1f"/>
<rect x="168" y="36" width="58" height="26" fill="#ffe000"/>
<rect x="28" y="74" width="58" height="26" fill="#ece8dc"/>
<rect x="98" y="74" width="58" height="26" fill="#00d2ff"/>
<rect x="168" y="74" width="58" height="26" fill="#00d2ff"/>
<circle cx="128" cy="150" r="15" fill="#00f076"/>
<rect x="76" y="196" width="104" height="18" rx="9" fill="#00f076"/>`),
  "web.memory": svg(`
<rect width="256" height="256" rx="48" fill="#141414"/>
<rect x="40" y="52" width="78" height="108" rx="10" fill="#ece8dc" transform="rotate(-8 79 106)"/>
<rect x="138" y="52" width="78" height="108" rx="10" fill="#2f2f2f" transform="rotate(8 177 106)" stroke="#ece8dc" stroke-width="6"/>
<path d="M64 100 h30 M64 118 h30 M153 100 h30" stroke="#141414" stroke-width="9" stroke-linecap="round"/>
<path d="M153 118 h18" stroke="#ece8dc" stroke-width="9" stroke-linecap="round"/>
<circle cx="128" cy="196" r="22" fill="#ffe000"/>
<path d="M118 196 l7 7 l13 -15" stroke="#141414" stroke-width="7" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`),
  "web.pong": svg(`
<rect width="256" height="256" rx="48" fill="#141414"/>
<rect x="32" y="76" width="18" height="104" rx="9" fill="#ece8dc"/>
<rect x="206" y="52" width="18" height="104" rx="9" fill="#00f076"/>
<rect x="118" y="64" width="20" height="20" fill="#ffe000"/>
<path d="M70 96 L120 128 L82 156" stroke="#2f2f2f" stroke-width="7" fill="none"/>
<path d="M148 92 L190 124 L154 158" stroke="#2f2f2f" stroke-width="7" fill="none"/>
<path d="M20 212 H236" stroke="#ffe000" stroke-width="8" stroke-linecap="round"/>`),
  "web.reaction": svg(`
<rect width="256" height="256" rx="48" fill="#141414"/>
<circle cx="128" cy="128" r="86" fill="none" stroke="#ece8dc" stroke-width="10"/>
<circle cx="128" cy="128" r="50" fill="none" stroke="#ff3a44" stroke-width="10"/>
<circle cx="128" cy="128" r="14" fill="#ffe000"/>
<path d="M128 22 V66 M128 190 V234 M22 128 H66 M190 128 H234" stroke="#ece8dc" stroke-width="10" stroke-linecap="round"/>`),
};

for (const id of GAMES) {
  const mediaDir = join(ROOT, "public", "media", id);
  await mkdir(mediaDir, { recursive: true });
  const tmp = join(mediaDir, "tmp-icon.png");
  const out = join(mediaDir, "icon.webp");
  const png = new Resvg(ICONS[id], { fitTo: { mode: "width", value: 256 } }).render().asPng();
  await writeFile(tmp, png);
  await execFileP(CWEBP, ["-q", "85", "-m", "6", tmp, "-o", out]);
  await rm(tmp, { force: true });
  console.log("OK", id);
}
