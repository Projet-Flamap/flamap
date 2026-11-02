import { createBaseStyle } from './base-style.js';

export function createMap({ maplibregl, mobile, container = 'map', hash = 'map', scale = false }) {
  const map = new maplibregl.Map({
    container,
    attributionControl: false,
    hash,
    center: [2.2, 46.5], zoom: 5,
    style: createBaseStyle(),
  });
  if (!mobile)
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
  if (scale)
    map.addControl(new maplibregl.ScaleControl({ maxWidth: mobile ? 80 : 110, unit: 'metric' }),
      mobile ? 'bottom-left' : 'bottom-right');
  map.touchZoomRotate.disableRotation();
  return map;
}
