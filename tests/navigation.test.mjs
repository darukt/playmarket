import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parsePath, pathFor } from '../src/nav.ts';

test('malformed URL encoding renders notfound without crashing the application', () => {
  assert.deepEqual(parsePath('/apps/%E0%A4%A'), { name: 'notfound', path: '/apps/%E0%A4%A' });
});
test('application and game IDs cannot inject extra route segments', () => {
  const route = { name: 'app', id: 'sample/../private?x=y' };
  const path = pathFor(route);
  assert.equal(path.split('/').length, 3);
  assert.deepEqual(parsePath(path), route);
  assert.equal(parsePath('/games/snake/extra').name, 'notfound');
});
