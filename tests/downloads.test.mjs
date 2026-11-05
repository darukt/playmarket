import { test } from 'node:test';
import assert from 'node:assert/strict';
import { requestDownload } from '../src/services/downloads.ts';

test('failed download preflight never starts a fake download', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => new Response(null, { status: 404 });
  try { await assert.rejects(requestDownload('missing', new AbortController().signal), /Файл недоступен/); }
  finally { globalThis.fetch = original; }
});
test('download streams through a same-origin browser link after HEAD, without buffering file bytes', async () => {
  const original = globalThis.fetch;
  const calls = [];
  const link = { click() { calls.push('click'); }, remove() { calls.push('remove'); } };
  globalThis.document = { createElement: () => link, body: { appendChild() { calls.push('append'); } } };
  globalThis.fetch = async (url, options) => { calls.push([url, options.method]); return new Response(null, { status: 200 }); };
  try {
    await requestDownload('example.game', new AbortController().signal);
    assert.match(calls[0][0], /^\/api\/download\/example\.game\?platform=(windows|android)$/);
    assert.equal(calls[0][1], 'HEAD');
    assert.deepEqual(calls.slice(1), ['append', 'click', 'remove']);
    assert.equal(link.href, calls[0][0]);
  } finally { globalThis.fetch = original; delete globalThis.document; }
});
