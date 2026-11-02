import assert from 'node:assert/strict';
import test from 'node:test';

import { createBaseStyle } from '../../js/map/base-style.js';
import { basemapVisibility, DEFAULT_BASEMAP, setBasemap } from '../../js/map/basemaps.js';
import { createMap } from '../../js/map/create-map.js';
import { loadPlanTile, PLAN_PROTOCOL } from '../../js/map/plan-tiles.js';
import { installBasemapSwitcher } from '../../js/ui/basemap-switcher.js';
import { createCursorCoords } from '../../js/ui/cursor-coords.js';

test('une tuile absente du Plan devient transparente, une panne reste une erreur', async () => {
  const controller = new AbortController();
  const params = { url: `${PLAN_PROTOCOL}://data.geopf.fr/wmts?TILEMATRIX=12` };
  const png = [0x89, 0x50, 0x4e, 0x47];
  const respond = (status, body = new ArrayBuffer(3)) => {
    const calls = [];
    const fetchImpl = async (url, options) => {
      calls.push([url, options.signal]);
      return { status, ok: status < 400, arrayBuffer: async () => body };
    };
    return { calls, fetchImpl };
  };

  const found = respond(200);
  const tile = await loadPlanTile(params, controller, found.fetchImpl);
  assert.equal(tile.data.byteLength, 3);
  assert.deepEqual(found.calls[0], ['https://data.geopf.fr/wmts?TILEMATRIX=12', controller.signal]);

  for (const status of [400, 404]) {
    const { data } = await loadPlanTile(params, controller, respond(status).fetchImpl);
    assert.deepEqual([...new Uint8Array(data).slice(0, 4)], png);
  }
  await assert.rejects(loadPlanTile(params, controller, respond(500).fetchImpl), /indisponible : 500/);
});

test('le style de base conserve les sources et couches dans leur ordre', () => {
  const style = createBaseStyle();
  assert.deepEqual(Object.keys(style.sources), ['sat', 'ortho', 'plan', 'toponyms']);
  assert.deepEqual(style.layers.map(layer => layer.id), [
    'sat', 'ortho', 'plan', 'label-water-point', 'label-water-line', 'label-country',
    'label-state', 'label-city', 'label-town', 'label-village', 'label-local',
    'label-road',
  ]);
  assert.equal(style.glyphs, 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf');
});

test('la création de carte conserve options et contrôle desktop', () => {
  const controls = [];
  let rotationDisabled = false;
  class Map {
    constructor(options) {
      this.options = options;
      this.touchZoomRotate = { disableRotation: () => { rotationDisabled = true; } };
    }
    addControl(control, position) { controls.push([control, position]); }
  }
  class NavigationControl {
    constructor(options) { this.options = options; }
  }
  const map = createMap({ maplibregl: { Map, NavigationControl }, mobile: false });
  assert.equal(map.options.container, 'map');
  assert.equal(map.options.hash, 'map');
  assert.deepEqual(map.options.center, [2.2, 46.5]);
  assert.equal(map.options.zoom, 5);
  assert.equal(controls.length, 1);
  assert.equal(controls[0][1], 'top-right');
  assert.deepEqual(controls[0][0].options, { showCompass: false });
  assert.equal(rotationDisabled, true);
});

test('la création mobile omet uniquement le contrôle de navigation', () => {
  let controls = 0;
  class Map {
    constructor() { this.touchZoomRotate = { disableRotation() {} }; }
    addControl() { controls++; }
  }
  createMap({
    maplibregl: { Map, NavigationControl: class {} },
    mobile: true,
  });
  assert.equal(controls, 0);
});

test('l’échelle est optionnelle : la page des archives n’en a pas', () => {
  const controls = [];
  class Map {
    constructor() { this.touchZoomRotate = { disableRotation() {} }; }
    addControl(control, position) { controls.push([control, position]); }
  }
  class ScaleControl {
    constructor(options) { this.options = options; }
  }
  const maplibregl = { Map, NavigationControl: class {}, ScaleControl };
  createMap({ maplibregl, mobile: true });
  assert.equal(controls.length, 0);
  createMap({ maplibregl, mobile: true, scale: true });
  assert.equal(controls[0][1], 'bottom-left');
  assert.equal(controls[0][0].options.unit, 'metric');
  createMap({ maplibregl, mobile: false, scale: true });
  assert.equal(controls.at(-1)[1], 'bottom-right');
});

test('le style de base s’ouvre sur le fond par défaut, sans demander le plan', () => {
  const style = createBaseStyle();
  const hidden = style.layers.filter(layer => layer.layout?.visibility === 'none');
  assert.deepEqual(hidden.map(layer => layer.id), ['plan']);
  const visible = new Map(basemapVisibility(DEFAULT_BASEMAP));
  assert.equal(visible.get('plan'), false);
  assert.equal(visible.get('ortho'), true);
  assert.equal(visible.get('label-city'), true);
});

test('le plan garde Sentinel-2 dessous et retire ortho-photo et toponymes', () => {
  assert.deepEqual(createBaseStyle().sources.plan.bounds, [-5.5, 41.3, 9.7, 51.2]);
  const visible = new Map(basemapVisibility('plan'));
  assert.equal(visible.get('sat'), true);
  assert.equal(visible.get('plan'), true);
  assert.equal(visible.get('ortho'), false);
  assert.equal(visible.get('label-city'), false);
  assert.equal(visible.get('label-road'), false);
  assert.throws(() => basemapVisibility('inconnu'), /fond de carte inconnu/);
});

test('changer de fond ne touche que les couches du style de base', () => {
  const calls = [];
  const map = { setLayoutProperty: (...args) => calls.push(args) };
  setBasemap(map, 'plan');
  const baseIds = createBaseStyle().layers.map(layer => layer.id);
  assert.deepEqual(calls.map(([id]) => id), baseIds);
  assert.ok(calls.every(([, property]) => property === 'visibility'));
  assert.deepEqual(calls.find(([id]) => id === 'plan')[2], 'visible');
  assert.deepEqual(calls.find(([id]) => id === 'ortho')[2], 'none');
});

test('le sélecteur ne touche à rien au démarrage sur le fond par défaut', () => {
  const calls = [];
  const map = { setLayoutProperty: (...args) => calls.push(args) };
  const input = (value, checked) => {
    const listeners = {};
    return { value, checked, listeners,
      addEventListener: (type, listener) => { listeners[type] = listener; } };
  };
  const satellite = input('satellite', true);
  const plan = input('plan', false);
  // Un `onChange` qui échoue ne doit pas pouvoir empêcher la carte de démarrer.
  const broken = () => { throw new Error('module en retard'); };
  installBasemapSwitcher({ map, inputs: [satellite, plan], onChange: broken });
  assert.equal(calls.length, 0);

  const changes = [];
  installBasemapSwitcher({ map, inputs: [satellite, plan], onChange: name => changes.push(name) });
  plan.listeners.change();
  assert.equal(calls.find(([id]) => id === 'plan')[2], 'visible');
  assert.deepEqual(changes, ['plan']);

  // Fond restauré par le navigateur au rechargement : il est appliqué d'emblée.
  calls.length = 0;
  changes.length = 0;
  installBasemapSwitcher({
    map,
    inputs: [input('satellite', false), input('plan', true)],
    onChange: name => changes.push(name),
  });
  assert.equal(calls.find(([id]) => id === 'plan')[2], 'visible');
  assert.deepEqual(changes, ['plan']);
});

test('les coordonnées suivent le curseur et disparaissent quand il sort', () => {
  const handlers = {};
  const element = {};
  let added = null;
  const map = {
    addControl: (control, position) => { added = [control, position]; },
    on: (type, handler) => { handlers[type] = handler; },
  };
  const doc = { createElement: () => element };
  createCursorCoords({ map, format: point => `${point.lat}/${point.lng}`, doc });
  assert.equal(added[1], 'bottom-right');
  assert.equal(added[0].onAdd(), element);
  assert.equal(element.hidden, true);
  handlers.mousemove({ lngLat: { lat: 46.5, lng: 2.2 } });
  assert.equal(element.hidden, false);
  assert.equal(element.textContent, '46.5/2.2');
  handlers.mouseout();
  assert.equal(element.hidden, true);
});
