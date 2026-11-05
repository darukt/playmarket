// Local integrity checks by default. --remote checks live official links;
// --sample-apk additionally hashes three complete small APKs without running them.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const root = fileURLToPath(new URL('..', import.meta.url));
const manifestPath = join(root, 'docs', 'catalog-sources.json');
const seed = JSON.parse(await readFile(join(root, 'backend', 'data', 'seed.json'), 'utf8'));
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
const byId = new Map(seed.map(app => [app.id, app]));
assert.equal(byId.size, seed.length, 'catalog IDs must be unique');
assert.equal(manifest.fdroid.importedIds.length, 100, 'exactly 100 added apps');
assert.equal(new Set(manifest.fdroid.importedIds).size, 100, '100 distinct package IDs');
assert.equal(manifest.fdroid.packages.length, 100, 'each imported app has provenance');
for (const id of manifest.baselineAppIds) assert(byId.has(id), `original app retained: ${id}`);
for (const app of seed) {
  if (app.kind === 'web') continue;
  assert(Object.keys(app.downloadsByPlatform ?? {}).length, `real source for ${app.id}`);
  for (const [platform, source] of Object.entries(app.downloadsByPlatform)) {
    assert(['android', 'windows'].includes(platform));
    const url = new URL(source.url);
    assert.equal(url.protocol, 'https:');
    assert(!url.username && !url.password);
    assert(['file', 'store'].includes(source.kind));
    if (source.kind === 'file') assert(source.filename?.match(/\.(apk|exe|msi)$/i));
  }
}
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
for (const source of manifest.fdroid.packages) {
  const app = byId.get(source.id);
  assert(app, `seed entry for ${source.id}`);
  assert.equal(app.downloadsByPlatform.android.kind, 'file');
  assert.equal(app.downloadsByPlatform.android.url, source.apkUrl);
  assert.equal(app.version, source.version);
  assert.equal(app.mb, Math.round(source.size / 1024 / 1024 * 10) / 10);
  assert.match(source.apkSha256, /^[a-f0-9]{64}$/);
  assert(source.localIcon.startsWith(`/media/${source.id}/`));
  const icon = await readFile(join(root, 'public', source.localIcon));
  assert.equal(hash(icon), source.iconSha256, `authentic local icon for ${source.id}`);
}
console.log(`Local integrity passed: ${seed.filter(a => a.kind === 'app').length} apps, ${seed.filter(a => a.kind === 'web').length} browser games, 100 original icon hashes and APK manifests.`);

async function boundedMap(values, concurrency, operation) {
  let cursor = 0;
  const results = [];
  await Promise.all(Array.from({ length: concurrency }, async () => {
    while (cursor < values.length) {
      const index = cursor++;
      try { results[index] = await operation(values[index]); }
      catch (error) { results[index] = { ...values[index], error: String(error.message) }; }
    }
  }));
  return results;
}
if (process.argv.includes('--remote')) {
  const requests = seed.filter(a => a.kind === 'app').flatMap(a => Object.entries(a.downloadsByPlatform).map(([platform, source]) => ({ id: a.id, platform, ...source })));
  const results = await boundedMap(requests, 6, async source => {
    const response = await fetch(source.url, { method: 'HEAD', signal: AbortSignal.timeout(45_000) });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const length = Number(response.headers.get('content-length')) || null;
    const expected = manifest.fdroid.packages.find(p => p.id === source.id);
    if (expected && source.platform === 'android' && length) assert.equal(length, expected.size, 'published APK size');
    if (source.kind === 'file') assert(!response.headers.get('content-type')?.includes('text/html'), 'file URL must not return an HTML page');
    return { ...source, status: response.status, finalUrl: response.url, contentType: response.headers.get('content-type'), contentLength: length };
  });
  const failures = results.filter(r => r.error);
  console.log(`Remote links: ${results.length - failures.length}/${results.length} passed.`);
  if (process.argv.includes('--record')) {
    // Keep temporary publisher redirect tokens out of tracked provenance.
    manifest.linkVerification = { checkedOn: new Date().toISOString().slice(0, 10), results: results.map(({finalUrl: _finalUrl, ...result}) => result) };
    await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
  }
  if (failures.length) { console.error(JSON.stringify(failures, null, 2)); process.exitCode = 1; }
}
if (process.argv.includes('--sample-apk')) {
  const samples = [...manifest.fdroid.packages].sort((a, b) => a.size - b.size).slice(0, 3);
  for (const source of samples) {
    const response = await fetch(source.apkUrl, { signal: AbortSignal.timeout(60_000) });
    assert(response.ok, `sample APK response for ${source.id}`);
    const bytes = Buffer.from(await response.arrayBuffer());
    assert.equal(bytes.length, source.size, `sample APK size for ${source.id}`);
    assert.equal(bytes.subarray(0, 4).toString('hex'), '504b0304', 'APK ZIP header');
    assert.equal(hash(bytes), source.apkSha256, `complete APK SHA-256 for ${source.id}`);
    console.log(`Verified complete APK: ${source.id} (${bytes.length} bytes, SHA-256 matches official index).`);
  }
}
