// The canonical bootstrap catalog is backend/data/seed.json. Application data
// is no longer exported from bundled frontend source files into the backend.
// Keep this historical command read-only so it cannot erase database seed data.
import { readFile } from 'node:fs/promises';

const seed = JSON.parse(await readFile(new URL('../backend/data/seed.json', import.meta.url), 'utf8'));
if (!Array.isArray(seed) || seed.some(row => !row.id || !row.name)) throw new Error('Invalid catalog seed');
if (new Set(seed.map(row => row.id)).size !== seed.length) throw new Error('Duplicate catalog IDs');
console.log(`Canonical database seed: ${seed.length} entries. No frontend catalog was exported. Use scripts/import-fdroid.mjs to refresh F-Droid records.`);
