import assert from 'node:assert/strict';
import test from 'node:test';

import { coordinatesProvider, parseCoordinates } from '../../js/search/coordinates.js';
import { createSearchEngine, createSearchSession } from '../../js/search/engine.js';
import { createGeocoderProvider, normalizeQuery } from '../../js/search/geocoder.js';
import { STRINGS } from '../../js/strings.js';
import { moveHighlight } from '../../js/ui/place-search.js';
import { geometryBbox } from '../../js/util/geo.js';


const featureCollection = (...features) => ({ type: 'FeatureCollection', features });
const point = (properties, coordinates = [6.19, 49.1]) => ({
  type: 'Feature', geometry: { type: 'Point', coordinates }, properties,
});
const METZ = point({
  label: 'Metz', name: 'Metz', type: 'municipality', id: '57463',
  citycode: '57463', postcode: '57000', context: '57, Moselle, Grand Est',
});

function fakeFetch(body, { ok = true, status = 200 } = {}) {
  const calls = [];
  const fetchImpl = async url => {
    calls.push(new URL(url));
    return { ok, status, json: async () => body };
  };
  return { calls, fetchImpl };
}

/* Le géocodeur d'une commune, dont l'index `poi` répond `body`. */
async function communeWithPoi(body) {
  const search = fakeFetch(featureCollection(METZ));
  const poi = fakeFetch(body);
  const [commune] = (await createGeocoderProvider({
    fetchImpl: async url => (new URL(url).searchParams.get('index') === 'poi'
      ? poi.fetchImpl(url) : search.fetchImpl(url)),
  }).resolve('Metz')).results;
  return { commune, poi };
}

test('les coordonnées valides sont lues dans toutes les écritures admises', () => {
  const metz = { status: 'valid', lat: 49.1193, lng: 6.1757 };
  for (const text of [
    '49.1193, 6.1757', '49.1193,6.1757', ' 49.1193 , 6.1757 ', '49.1193 6.1757',
    '49.1193;6.1757', '49,1193 6,1757', '49,1193, 6,1757', '49,1193,6,1757',
    '49,1193 ; 6,1757', '+49.1193, +6.1757',
  ]) assert.deepEqual(parseCoordinates(text), metz, text);
  assert.deepEqual(parseCoordinates('-21.1, -175.2'), { status: 'valid', lat: -21.1, lng: -175.2 });
  assert.deepEqual(parseCoordinates('49, 6'), { status: 'valid', lat: 49, lng: 6 });
  assert.deepEqual(parseCoordinates('49,6'), { status: 'valid', lat: 49, lng: 6 });
  assert.deepEqual(parseCoordinates('49,1193, 6'), { status: 'valid', lat: 49.1193, lng: 6 });
});

test('les bornes sont incluses et leur dépassement refusé', () => {
  assert.equal(parseCoordinates('90, 180').status, 'valid');
  assert.equal(parseCoordinates('-90, -180').status, 'valid');
  assert.equal(parseCoordinates('0, 0').status, 'valid');
  for (const text of ['200, 500', '90.01, 0', '0, 180.01', '-91, 0', '0, -181', '49,1193'])
    assert.deepEqual(parseCoordinates(text), { status: 'invalid' }, text);
});

test('ce qui n’est pas numérique, ou un entier seul, revient au géocodeur', () => {
  for (const text of ['abc, xyz', 'Metz', 'Gap', '57000', '05000', '12', '',
    '   ', '12 rue de la Paix, Metz', '12, rue de la Paix', '49.1, abc', null, undefined])
    assert.deepEqual(parseCoordinates(text), { status: 'none' }, String(text));
});

test('une paire en cours de saisie n’est ni fausse ni envoyée à l’API', () => {
  for (const text of ['-', '49.', '49.1193', '49,1193,', '49.1193, ', '49.1193, -', '49.1193, 6.'])
    assert.equal(parseCoordinates(text).status, 'partial', text);
  for (const text of ['1.2.3', '49..1, 6', '1 2 3 4'])
    assert.equal(parseCoordinates(text).status, 'invalid', text);
});

test('des coordonnées ne déclenchent aucun appel au géocodeur', async () => {
  const { calls, fetchImpl } = fakeFetch(featureCollection());
  const engine = createSearchEngine([coordinatesProvider, createGeocoderProvider({ fetchImpl })]);
  const valid = await engine.search('49.1193, 6.1757');
  assert.equal(valid.status, 'results');
  assert.deepEqual(
    [valid.results[0].lat, valid.results[0].lng, valid.results[0].label],
    [49.1193, 6.1757, '49.1193, 6.1757'],
  );
  assert.equal((await engine.search('200, 500')).status, 'invalid');
  assert.equal((await engine.search('49.11')).status, 'incomplete');
  assert.equal(calls.length, 0);
  await engine.search('abc, xyz');
  assert.equal(calls.length, 1);
});

test('un fournisseur de plus se glisse devant les autres sans les toucher', async () => {
  const dfci = { id: 'dfci', resolve: text => (text === 'KC40'
    ? { status: 'results', results: [{ id: 'KC40' }] } : null) };
  const { calls, fetchImpl } = fakeFetch(featureCollection());
  const engine = createSearchEngine([dfci, coordinatesProvider, createGeocoderProvider({ fetchImpl })]);
  assert.equal((await engine.search('KC40')).results[0].id, 'KC40');
  assert.equal(calls.length, 0);
  assert.equal((await engine.search('1, 2')).results[0].kind, 'coordinates');
});

test('le géocodeur interroge le bon service et adapte le zoom au type', async () => {
  const { calls, fetchImpl } = fakeFetch(featureCollection(
    point({ label: '12 Rue X 57000 Metz', type: 'housenumber', context: '57' }),
    point({ label: 'Rue X 57000 Metz', type: 'street' }),
    point({ label: 'Le Lieu', type: 'locality' }),
    METZ,
    { type: 'Feature', geometry: null, properties: { label: 'cassé' } },
  ));
  const { results } = await createGeocoderProvider({ fetchImpl }).resolve('Metz');
  const url = calls[0];
  assert.equal(url.origin + url.pathname, 'https://data.geopf.fr/geocodage/search');
  assert.equal(url.searchParams.get('q'), 'Metz');
  assert.equal(url.searchParams.get('index'), 'address');
  assert.deepEqual(results.map(result => [result.kind, result.zoom]),
    [['address', 17], ['street', 15], ['locality', 14], ['commune', 12]]);
  assert.equal(results[3].context, '57000 · 57, Moselle, Grand Est');
  assert.equal(results[0].loadGeometry, undefined);
  assert.equal(typeof results[3].loadGeometry, 'function');
});

test('une saisie trop courte ne part pas ; les caractères refusés sont retirés', async () => {
  const { calls, fetchImpl } = fakeFetch(featureCollection());
  const geocoder = createGeocoderProvider({ fetchImpl });
  assert.equal((await geocoder.resolve('ab')).status, 'incomplete');
  assert.equal((await geocoder.resolve('« a')).status, 'incomplete');
  assert.equal(calls.length, 0);
  assert.equal(normalizeQuery('  (Metz) '), 'Metz)');
  assert.equal(normalizeQuery('x'.repeat(300)).length, 200);
  assert.equal(normalizeQuery('Érôme'), 'Érôme');
});

test('le contour de commune vient de l’index poi', async () => {
  const polygon = { type: 'Polygon', coordinates: [[[6, 49], [6.3, 49], [6.3, 49.2], [6, 49]]] };
  const { commune, poi } = await communeWithPoi(
    featureCollection({ properties: { truegeometry: JSON.stringify(polygon) } }));
  assert.deepEqual(await commune.loadGeometry(), polygon);
  const params = poi.calls[0].searchParams;
  assert.equal(params.get('q'), 'Metz');
  assert.equal(params.get('index'), 'poi');
  assert.equal(params.get('category'), 'commune');
  assert.equal(params.get('citycode'), '57463');
  assert.equal(params.get('returntruegeometry'), 'true');
});

test('sans contour exploitable, la commune n’a pas de géométrie', async () => {
  for (const body of [
    featureCollection(),
    featureCollection({ properties: { truegeometry: '{"type":"Point","coordinates":[6,49]}' } }),
  ]) {
    const { commune } = await communeWithPoi(body);
    assert.equal(await commune.loadGeometry(), null);
  }
});

test('une commune au nom trop court pour l’API se passe de contour', async () => {
  const eu = point({ label: 'Eu', name: 'Eu', type: 'municipality', citycode: '76255', postcode: '76260' });
  const { calls, fetchImpl } = fakeFetch(featureCollection(eu));
  const [result] = (await createGeocoderProvider({ fetchImpl }).resolve('Eu 76260')).results;
  assert.equal(await result.loadGeometry(), null);
  assert.equal(calls.length, 1);
});

test('une réponse en erreur est signalée', async () => {
  const { fetchImpl } = fakeFetch({}, { ok: false, status: 429 });
  await assert.rejects(createGeocoderProvider({ fetchImpl }).resolve('Metz'), /429/);
});

test('la session attend la fin de la frappe et ne lance qu’une recherche', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const asked = [];
  const states = [];
  const session = createSearchSession({
    engine: { search: async text => { asked.push(text); return { status: 'results', results: [{ id: text }] }; } },
    onChange: state => states.push(state),
  });
  session.input('Met');
  t.mock.timers.tick(299);
  session.input('Metz');
  t.mock.timers.tick(299);
  assert.deepEqual(asked, []);
  t.mock.timers.tick(1);
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(asked, ['Metz']);
  assert.equal(states.at(-1).status, 'results');
  assert.equal(states.at(-1).results[0].id, 'Metz');
});

test('une réponse périmée n’atteint jamais l’écran', async () => {
  const resolvers = {};
  const states = [];
  const signals = {};
  const session = createSearchSession({
    engine: { search: (text, { signal }) => new Promise(resolve => {
      resolvers[text] = resolve;
      signals[text] = signal;
    }) },
    onChange: state => states.push(state),
  });
  const first = session.submit('Met');
  await Promise.resolve();
  const second = session.submit('Metz');
  assert.equal(signals.Met.aborted, true);
  resolvers.Metz({ status: 'results', results: [{ id: 'nouveau' }] });
  resolvers.Met({ status: 'results', results: [{ id: 'ancien' }] });
  assert.equal(await first, null);
  assert.equal((await second).results[0].id, 'nouveau');
  assert.deepEqual(states.filter(state => state.status === 'results').map(state => state.results[0].id), ['nouveau']);
});

test('la session traduit chaque issue en un état affichable', async () => {
  const outcomes = {
    vide: async () => ({ status: 'results', results: [] }),
    panne: async () => { throw new Error('réseau'); },
    faux: async () => ({ status: 'invalid', messageKey: 'clé.faux' }),
    court: async () => ({ status: 'incomplete', messageKey: 'clé.court' }),
  };
  const session = createSearchSession({
    engine: { search: text => outcomes[text]() },
    onChange() {},
  });
  assert.equal((await session.submit('vide')).status, 'empty');
  assert.equal((await session.submit('panne')).status, 'error');
  assert.equal((await session.submit('faux')).messageKey, 'clé.faux');
  assert.equal((await session.submit('court')).messageKey, 'clé.court');
});

test('en frappe, une saisie incomplète reste silencieuse et le vide efface tout', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const states = [];
  const session = createSearchSession({
    engine: { search: async () => ({ status: 'incomplete', messageKey: 'clé' }) },
    onChange: state => states.push(state),
  });
  session.input('49.1');
  t.mock.timers.tick(300);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(states.at(-1).status, 'idle');
  session.input('');
  assert.equal(states.at(-1).status, 'idle');
});

test('une API muette finit en erreur plutôt qu’en attente infinie', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const session = createSearchSession({
    engine: { search: (_, { signal }) => new Promise((_resolve, reject) => {
      signal.addEventListener('abort', () => reject(new Error('abandon')));
    }) },
    onChange() {},
    timeoutMs: 1000,
  });
  const pending = session.submit('Metz');
  t.mock.timers.tick(1000);
  assert.equal((await pending).status, 'error');
});

test('la liste se parcourt en boucle au clavier', () => {
  assert.equal(moveHighlight(-1, 1, 3), 0);
  assert.equal(moveHighlight(-1, -1, 3), 2);
  assert.equal(moveHighlight(0, 1, 3), 1);
  assert.equal(moveHighlight(2, 1, 3), 0);
  assert.equal(moveHighlight(0, -1, 3), 2);
  assert.equal(moveHighlight(-1, 1, 0), -1);
});

test('l’emprise couvre polygones et multipolygones', () => {
  const ring = [[6, 49], [6.3, 49.2], [6.1, 48.9], [6, 49]];
  assert.deepEqual(geometryBbox({ type: 'Polygon', coordinates: [ring] }), [6, 48.9, 6.3, 49.2]);
  assert.deepEqual(geometryBbox({
    type: 'MultiPolygon',
    coordinates: [[ring], [[[1, 2], [3, 4], [1, 4], [1, 2]]]],
  }), [1, 2, 6.3, 49.2]);
});

test('les messages portés par les fournisseurs existent', () => {
  for (const key of ['search.coordinates.context', 'search.coordinates.invalid',
    'search.coordinates.incomplete', 'search.tooShort'])
    assert.ok(key in STRINGS, key);
});
