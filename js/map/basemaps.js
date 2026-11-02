import { createBaseStyle } from './base-style.js';

/* Les fonds vivent tous dans le style de base et s'échangent par visibilité :
 * `setStyle()` emporterait les sources et les couches de feux ajoutées par-dessus.
 *
 * Le Plan IGN ne couvre que la France et ses abords : Sentinel-2 reste donc allumé
 * dessous, comme pour l'ortho-photo. Ses toponymes étant dessinés dans l'image,
 * les nôtres feraient doublon. */
const BASEMAPS = Object.freeze({
  satellite: id => id !== 'plan',
  plan: id => id === 'sat' || id === 'plan',
});

export const DEFAULT_BASEMAP = 'satellite';

const BASE_LAYERS = createBaseStyle().layers.map(layer => layer.id);

export function basemapVisibility(name) {
  const visible = BASEMAPS[name];
  if (!visible) throw new Error(`fond de carte inconnu : ${name}`);
  return BASE_LAYERS.map(id => [id, visible(id)]);
}

export function setBasemap(map, name) {
  for (const [id, visible] of basemapVisibility(name))
    map.setLayoutProperty(id, 'visibility', visible ? 'visible' : 'none');
}
