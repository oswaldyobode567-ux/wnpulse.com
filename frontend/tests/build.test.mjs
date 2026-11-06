import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { matchRoutes, generatePath } from 'react-router-dom';

test('main routes keep their paths and dynamic match IDs', () => {
  const routes = [{path:'/app'}, {path:'/app/montante'}, {path:'/app/suivi'}, {path:'/app/match/:matchId'}, {path:'/blog/:slug'}];
  assert.equal(matchRoutes(routes, '/app/match/fixture-123')[0].params.matchId, 'fixture-123');
  assert.equal(generatePath('/app/match/:matchId', {matchId:'fixture-123'}), '/app/match/fixture-123');
  assert.equal(matchRoutes(routes, '/app/montante')[0].route.path, '/app/montante');
});
test('built HTML includes a module entry and existing SEO information', async () => {
  const html = await readFile(new URL('../build/index.html', import.meta.url), 'utf8');
  assert.match(html, /type="module"[^>]*src="\/assets\//);
  assert.match(html, /<div id="root">/);
  assert.match(html, /og:site_name/);
  assert.doesNotMatch(html, /\/src\/index\.jsx/);
});
test('compiled assets do not retain unhandled CRA process.env expressions', async () => {
  for (const file of await readdir(new URL('../build/assets/', import.meta.url))) {
    if (!file.endsWith('.js')) continue;
    const source = await readFile(new URL('../build/assets/'+file, import.meta.url), 'utf8');
    assert.doesNotMatch(source, /process\.env\.REACT_APP_BACKEND_URL/);
  }
});
