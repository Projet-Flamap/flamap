import assert from 'node:assert/strict';
import test from 'node:test';

import { fitBoundsFor, toBurnt, toHotspots } from '../../js/archive/adapt.js';
import { filterFires, yearsOf } from '../../js/archive/filter.js';


const FIRMS = [
  { lon: 6.09, lat: 43.49, ts: 200, source: 'VIIRS/NOAA-20', brightness: 331.2,
    frp: 4.8, confidence: 'nominal', daynight: 'D', scan: .42, track: .39 },
  { lon: 6.08, lat: 43.48, ts: 100, source: 'MODIS', frp: 2.1, confidence: '72' },
];

const EFFIS = [
  { id: 'd-abc123', ts: 1785700000, lu: 1785744000, area_ha: 1850.0, country: 'FR',
    props: { COMMUNE: 'Correns', PROVINCE: 'Var', CLASS: '7DAYS', CONIFER: 62 },
    geometry: { type: 'MultiPolygon', coordinates: [] } },
];

test('toHotspots convertit les détections en points GeoJSON triés par date', () => {
  const fc = toHotspots(FIRMS);
  assert.equal(fc.type, 'FeatureCollection');
  assert.equal(fc.features.length, 2);
  // triées par ts croissant, même si l'entrée ne l'était pas
  assert.equal(fc.features[0].properties.ts, 100);
  assert.equal(fc.features[1].properties.ts, 200);
  assert.deepEqual(fc.features[0].geometry, { type: 'Point', coordinates: [6.08, 43.48] });
  assert.equal(fc.features[1].properties.source, 'VIIRS/NOAA-20');
  assert.equal(fc.features[1].properties.frp, 4.8);
});

test('toHotspots renvoie une collection vide sans détection', () => {
  assert.deepEqual(toHotspots([]), { type: 'FeatureCollection', features: [] });
  assert.deepEqual(toHotspots(undefined), { type: 'FeatureCollection', features: [] });
});

test('toBurnt reporte la surface, les dates et les attributs EFFIS bruts', () => {
  const fc = toBurnt(EFFIS);
  assert.equal(fc.features.length, 1);
  const p = fc.features[0].properties;
  assert.equal(p.AREA_HA, 1850.0);
  assert.equal(p.ts, 1785700000);
  assert.equal(p.lu, 1785744000);
  assert.equal(p.COMMUNE, 'Correns');
  assert.equal(p.CONIFER, 62);
  assert.deepEqual(fc.features[0].geometry, EFFIS[0].geometry);
});

test('fitBoundsFor renvoie un rectangle centré et généreux', () => {
  const [[west, south], [east, north]] = fitBoundsFor([6.08, 43.49], 10);
  assert.ok(west < 6.08 && east > 6.08);
  assert.ok(south < 43.49 && north > 43.49);
  // marge de 15 % au-delà du rayon fourni, pas un cadrage serré
  const halfWidthKm = (east - west) / 2 * 111.32 * Math.cos(43.49 * Math.PI / 180);
  assert.ok(halfWidthKm > 10 && halfWidthKm < 13);
});

const at = (y, m, d) => Math.floor(new Date(y, m - 1, d, 12).getTime() / 1000);
const FIRES = [
  { id: 'a', first_ts: at(2026, 8, 3), last_ts: at(2026, 8, 5) },
  { id: 'b', first_ts: at(2025, 12, 30), last_ts: at(2026, 1, 2) },
  { id: 'c', first_ts: at(2024, 7, 14), last_ts: at(2024, 7, 14) },
];
const ids = fires => fires.map(f => f.id);

test('yearsOf liste les années couvertes, de la plus récente à la plus ancienne', () => {
  assert.deepEqual(yearsOf(FIRES), [2026, 2025, 2024]);
  assert.deepEqual(yearsOf([]), []);
});

test('filterFires par année retient les feux qui chevauchent l’année', () => {
  assert.deepEqual(ids(filterFires(FIRES, { year: 2026 })), ['a', 'b']);
  assert.deepEqual(ids(filterFires(FIRES, { year: 2025 })), ['b']);
  assert.deepEqual(ids(filterFires(FIRES, { year: 2023 })), []);
});

test('filterFires par période inclut le jour de fin et accepte une borne ouverte', () => {
  assert.deepEqual(ids(filterFires(FIRES, { from: '2026-08-05', to: '2026-08-05' })), ['a']);
  assert.deepEqual(ids(filterFires(FIRES, { from: '2026-01-01' })), ['a', 'b']);
  assert.deepEqual(ids(filterFires(FIRES, { to: '2024-12-31' })), ['c']);
  // bornes inversées remises dans l'ordre
  assert.deepEqual(ids(filterFires(FIRES, { from: '2024-07-31', to: '2024-07-01' })), ['c']);
});

test('filterFires sans critère renvoie toute la liste', () => {
  assert.equal(filterFires(FIRES, {}), FIRES);
  assert.equal(filterFires(FIRES, { from: '', to: '' }), FIRES);
});
