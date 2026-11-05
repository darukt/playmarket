import { test } from 'node:test';
import assert from 'node:assert/strict';
import { requestDownload } from '../src/services/downloads.ts';

test('failed download preflight never starts a fake download', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => new Response(null, { status: 404 });
  try { await assert.rejects(requestDownload('missing', new AbortController().signal), /Файл недоступен/); }
  finally { globalThis.fetch = original; }
});
test('official Android file uses a native gateway link without buffering package bytes', async () => {
  const original = globalThis.fetch;
  const calls = [];
  const link = { click() { calls.push('click'); }, remove() { calls.push('remove'); } };
  globalThis.document = { createElement: () => link, body: { appendChild() { calls.push('append'); } } };
  globalThis.fetch = async (url, options) => { calls.push([url, options]); return Response.json({kind:'file',platform:'android'}); };
  try {
    const result = await requestDownload('example.game', new AbortController().signal);
    assert.deepEqual(result, {kind:'file',platform:'android'});
    assert.match(calls[0][0], /^\/api\/download\/example\.game\?platform=(windows|android)&resolve=1$/);
    assert.equal(calls[0][1].credentials, 'same-origin');
    assert.deepEqual(calls.slice(1), ['append', 'click', 'remove']);
    assert.equal(link.href, '/api/download/example.game?platform=android');
    assert.equal(link.download, '');
  } finally { globalThis.fetch = original; delete globalThis.document; }
});

test('store opens separately and is reported as a store action', async () => {
  const original = globalThis.fetch;
  const link = { click() {}, remove() {} };
  globalThis.document = { createElement: () => link, body: { appendChild() {} } };
  globalThis.fetch = async () => Response.json({kind:'store', platform:'android'});
  try {
    assert.deepEqual(await requestDownload('example', new AbortController().signal), {kind:'store',platform:'android'});
    assert.equal(link.target, '_blank');
    assert.equal(link.rel, 'noopener noreferrer');
    assert.equal(link.download, undefined);
  } finally { globalThis.fetch = original; delete globalThis.document; }
});

test('invalid metadata and aborted requests never click a download link', async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async () => Response.json({kind:'unknown',platform:'android'});
    await assert.rejects(requestDownload('example', new AbortController().signal), /источник/);
    globalThis.fetch = async () => Response.json({kind:'file',platform:'android'});
    const controller = new AbortController(); controller.abort();
    await assert.rejects(requestDownload('example', controller.signal), {name:'AbortError'});
  } finally { globalThis.fetch = original; }
});
