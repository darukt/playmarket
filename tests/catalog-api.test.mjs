import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeApp, normalizeCatalog } from '../src/services/catalog.ts';
import { api, ApiError } from '../src/services/api.ts';

test('Catalog accepts nullable Go detail fields without crashing app interfaces', () => {
  const row = normalizeApp({ id:'custom.game', name:'Custom', detail:{screenshots:null,video:null,poster:null}, rating:null, fresh:null });
  assert.deepEqual(row.detail.screenshots, []);
  assert.equal(row.rating, 0);
  assert.equal(row.fresh, '');
  assert.equal(row.detail.video, null);
  assert.equal(row.developer, 'Не указан');
});
test('Catalog rejects malformed entries, deduplicates IDs, and filters unsafe media', () => {
  assert.throws(() => normalizeCatalog({}), /Invalid catalog/);
  const rows = normalizeCatalog([null, {id:'../private',name:'Invalid'}, {id:'valid',name:'Old'}, {id:'valid',name:'New',detail:{screenshots:['/media/game/0.webp','https://tracker.test/image','/uploads/../private','//bad.test/a']}}]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].name, 'New');
  assert.deepEqual(rows[0].detail.screenshots, ['/media/game/0.webp']);
});
test('API preserves Headers objects including CSRF while supplying default Accept', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async (path, options) => {
    assert.equal(path, '/api/auth/register');
    assert.equal(options.credentials, 'same-origin');
    assert.equal(options.headers.get('X-CSRF-Token'), 'proof');
    assert.equal(options.headers.get('Accept'), 'application/json');
    return Response.json({ok:true});
  };
  try { assert.deepEqual(await api('/api/auth/register', {headers:new Headers({'X-CSRF-Token':'proof'})}), {ok:true}); }
  finally { globalThis.fetch = original; }
});
test('API errors expose status and safe instructions instead of server secrets', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => Response.json({error:'SECRET /private/account.json'}, {status:400});
  try {
    await assert.rejects(api('/api/auth/register'), (error) => error instanceof ApiError && error.status === 400 && !error.message.includes('SECRET') && error.message.includes('12'));
  } finally { globalThis.fetch = original; }
});
