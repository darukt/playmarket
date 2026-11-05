// Refreshes selected F-Droid records in the database seed, never in frontend code.
// Selection and the last import's provenance live in docs/catalog-sources.json.
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join, extname } from 'node:path';

const root = fileURLToPath(new URL('..', import.meta.url));
const cache = join(root, '.runtime', 'catalog-import');
const manifestPath = join(root, 'docs', 'catalog-sources.json');
const seedPath = join(root, 'backend', 'data', 'seed.json');
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
const source = manifest.fdroid;
await mkdir(cache, { recursive: true });
const digest = value => createHash('sha256').update(value).digest('hex');
async function fetchBytes(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(180_000) });
  if (!response.ok) throw new Error(`${response.status} while downloading ${url}`);
  return Buffer.from(await response.arrayBuffer());
}
if (process.argv.includes('--refresh')) {
  const entryBytes = await fetchBytes(source.entryUrl);
  const entry = JSON.parse(entryBytes);
  const bytes = await fetchBytes(source.indexUrl);
  if (bytes.length !== entry.index.size || digest(bytes) !== entry.index.sha256) {
    throw new Error('F-Droid index size or SHA-256 does not match entry.json');
  }
  await writeFile(join(cache, 'entry.json'), entryBytes);
  await writeFile(join(cache, 'index-v2.json'), bytes);
}
const entry = JSON.parse(await readFile(join(cache, 'entry.json'), 'utf8'));
const indexBytes = await readFile(join(cache, 'index-v2.json'));
if (digest(indexBytes) !== entry.index.sha256) throw new Error('Cached index checksum mismatch');
const index = JSON.parse(indexBytes);
const seed = JSON.parse(await readFile(seedPath, 'utf8'));
const locale = value => value?.ru ?? value?.['ru-RU'] ?? value?.['en-US'] ?? value?.en ?? Object.values(value ?? {})[0];
const plain = value => String(value ?? '')
  .replace(/<\/(p|div|ul|ol)>|<br\s*\/?\s*>/gi, '\n\n')
  .replace(/<li[^>]*>/gi, '• ').replace(/<[^>]+>/g, '')
  .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&nbsp;/g, ' ')
  .replace(/\n{3,}/g, '\n\n').trim();
function classify(categories) {
  const all = categories.join(' ');
  if (/Games|Game |Board Game|Strategy|Puzzle|Arcade/i.test(all)) return ['games', 'Игры'];
  if (/Finance Manager|Market & Price/.test(all)) return ['finance', 'Финансы'];
  if (/Sports & Health|Workout|Habit Tracker/.test(all)) return ['sport', 'Здоровье и спорт'];
  if (/Online Media Player|Cast/.test(all)) return ['video', 'Видео'];
  if (/Audiobook|Podcast|Radio|Local Media Player/.test(all)) return ['music', 'Музыка и аудио'];
  if (/Camera|Gallery|Graphics|Draw|OCR/.test(all)) return ['photo', 'Фото и графика'];
  if (/Messaging|Social Network|Forum|Voice & Video Chat|Phone & SMS|Contact/.test(all)) return ['social', 'Общение'];
  if (/Note|Task|Writing|Calendar|Ebook Reader|Reading|Email|Science & Education|News/.test(all)) return ['productivity', 'Работа и обучение'];
  return ['tools', /Navigation/.test(all) ? 'Навигация' : 'Инструменты'];
}
const imported = [];
const packages = [];
const iconJobs = [];
for (const id of source.importedIds) {
  const item = index.packages[id];
  if (!item) throw new Error(`Selected package is absent from F-Droid: ${id}`);
  const metadata = item.metadata;
  const versions = Object.values(item.versions)
    .filter(v => !v.releaseChannels?.length && !v.antiFeatures?.KnownVuln &&
      !v.antiFeatures?.DisabledAlgorithm && !v.antiFeatures?.NoSourceSince &&
      (!metadata.preferredSigner || v.manifest.signer?.sha256?.includes(metadata.preferredSigner)))
    .filter(v => !v.manifest.nativecode?.length || v.manifest.nativecode.includes('arm64-v8a'))
    .sort((a, b) => b.manifest.versionCode - a.manifest.versionCode);
  const version = versions[0];
  if (!version) throw new Error(`No stable arm64/universal package is available: ${id}`);
  const apk = version.file;
  const name = plain(locale(metadata.name)) || id;
  const summary = plain(locale(metadata.summary));
  const description = plain(locale(metadata.description)).slice(0, 4000);
  const [category, genre] = classify(metadata.categories ?? []);
  const updatedDate = new Date(version.added ?? metadata.lastUpdated);
  const updated = updatedDate.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
  const icon = locale(metadata.icon);
  const iconExtension = extname(icon?.name ?? '').toLowerCase();
  if (!icon || !['.png', '.webp', '.jpg', '.jpeg'].includes(iconExtension)) throw new Error(`No supported authentic icon: ${id}`);
  const localIcon = `/media/${id}/icon${iconExtension}`;
  imported.push({
    id, name, developer: metadata.authorName || 'Автор не указан в F-Droid', genre, category,
    rating: 0, ratings: 'Нет оценок', downloads: 'Нет данных', downloadsM: 0,
    mb: Math.round(apk.size / 1024 / 1024 * 10) / 10,
    version: version.manifest.versionName, updated, fresh: updatedDate.toISOString().slice(0, 10),
    color: '#d9f2e7', ink: 'dark', tag: 'F-Droid', kind: 'app', game: null, custom: false,
    icon: localIcon,
    detail: { description: description || summary, itempropDescription: summary, screenshots: [], video: null, poster: null, updatedRaw: updated },
    downloadsByPlatform: { android: { url: source.repository + apk.name, kind: 'file', filename: apk.name.split('/').at(-1) } },
  });
  packages.push({ id, name, packagePage: `https://f-droid.org/packages/${id}/`,
    sourceCode: metadata.sourceCode ?? null, license: metadata.license,
    version: version.manifest.versionName, versionCode: version.manifest.versionCode,
    apkUrl: source.repository + apk.name, apkSha256: apk.sha256, size: apk.size,
    signerSha256: version.manifest.signer?.sha256 ?? [],
    minSdkVersion: version.manifest.usesSdk?.minSdkVersion,
    abi: version.manifest.nativecode ?? ['universal'],
    antiFeatures: Object.keys(version.antiFeatures ?? {}),
    iconUrl: source.repository + icon.name, iconSha256: icon.sha256, localIcon,
  });
  iconJobs.push(async () => {
    const path = join(root, 'public', localIcon);
    let bytes;
    try { bytes = await readFile(path); } catch { /* fetch missing cached media */ }
    if (bytes && digest(bytes) === icon.sha256) return;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const repository = attempt === 0 ? source.repository : 'https://mirror.f-droid.org/fdroid/repo';
        bytes = await fetchBytes(repository + icon.name);
        if (digest(bytes) !== icon.sha256) throw new Error(`Icon checksum mismatch: ${id}`);
        await mkdir(join(root, 'public', 'media', id), { recursive: true });
        await writeFile(path, bytes);
        return;
      } catch (error) { if (attempt === 2) throw error; }
    }
  });
}
if (imported.length !== 100 || new Set(imported.map(e => e.id)).size !== 100) throw new Error('Expected exactly 100 unique selected apps');
let cursor = 0;
await Promise.all(Array.from({ length: 6 }, async () => {
  while (cursor < iconJobs.length) { const job = iconJobs[cursor++]; await job(); }
}));
const importedIds = new Set(source.importedIds);
const result = [...seed.filter(e => !importedIds.has(e.id)), ...imported];
if (new Set(result.map(e => e.id)).size !== result.length) throw new Error('Duplicate seed IDs');
manifest.checkedOn = new Date().toISOString().slice(0, 10);
manifest.fdroid = { ...source, indexTimestamp: entry.timestamp, indexSha256: entry.index.sha256, packages };
await writeFile(seedPath, JSON.stringify(result, null, 2) + '\n');
await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
console.log(`Imported ${imported.length} real APK apps with verified icons; seed contains ${result.filter(e => e.kind === 'app').length} apps and ${result.filter(e => e.kind === 'web').length} browser games.`);
