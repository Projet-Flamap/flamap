/* Posée comme un contrôle MapLibre pour s'empiler avec l'échelle. Elle n'apparaît
 * qu'au premier survol : sans curseur sur la carte, il n'y a rien à lire. */
export function createCursorCoords({ map, format, position = 'bottom-right',
  doc = document }) {
  const element = doc.createElement('div');
  element.className = 'maplibregl-ctrl cursor-coords glass';
  element.hidden = true;
  map.addControl({
    onAdd: () => element,
    onRemove: () => element.remove(),
  }, position);
  map.on('mousemove', event => {
    element.textContent = format(event.lngLat);
    element.hidden = false;
  });
  map.on('mouseout', () => { element.hidden = true; });
  return element;
}
