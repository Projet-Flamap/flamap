import { EMPTY } from '../data/client.js';
import { geometryBbox } from '../util/geo.js';


const SOURCE = 'search-outline';
const MAX_OUTLINE_ZOOM = 14;

/* Le résultat de la recherche sur la carte : un seul marqueur et, pour une
 * commune, son contour. Le filet sombre garde le trait blanc lisible sur le Plan
 * IGN comme sur l'imagerie ; sans remplissage, le contour ne masque pas les feux
 * et n'intercepte aucun clic.
 *
 * Une recherche peut précéder le chargement du style : le contour attend alors
 * `install()`. */
export function createSearchResultController({ map, maplibregl, padding }) {
  let marker = null;
  let installed = false;
  let outline = EMPTY;
  let pending = null;

  function setOutline(data) {
    outline = data;
    if (installed) map.getSource(SOURCE).setData(data);
  }

  function install() {
    map.addSource(SOURCE, { type: 'geojson', data: outline });
    map.addLayer({
      id: 'search-outline-casing', type: 'line', source: SOURCE,
      paint: { 'line-color': '#0d0f12', 'line-width': 4, 'line-opacity': .7 },
    });
    map.addLayer({
      id: 'search-outline-line', type: 'line', source: SOURCE,
      paint: { 'line-color': '#fff', 'line-width': 2 },
    });
    installed = true;
  }

  function clear() {
    pending?.abort();
    pending = null;
    marker?.remove();
    marker = null;
    setOutline(EMPTY);
  }

  async function show(result) {
    clear();
    const center = [result.lng, result.lat];
    const element = document.createElement('div');
    element.className = 'search-pin';
    element.setAttribute('aria-label', result.label);
    marker = new maplibregl.Marker({ element, anchor: 'bottom' }).setLngLat(center).addTo(map);
    map.flyTo({ center, zoom: result.zoom });
    if (!result.loadGeometry) return;

    const controller = new AbortController();
    pending = controller;
    let geometry = null;
    try {
      geometry = await result.loadGeometry(controller.signal);
    } catch (_) {
      // Contour indisponible : le marqueur et le zoom de commune suffisent.
    }
    if (pending !== controller) return;
    pending = null;
    if (!geometry) return;
    setOutline({ type: 'Feature', properties: {}, geometry });
    map.fitBounds(geometryBbox(geometry), { padding: padding(), maxZoom: MAX_OUTLINE_ZOOM });
  }

  return Object.freeze({ install, show, clear });
}
