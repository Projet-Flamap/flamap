import { DEFAULT_BASEMAP, setBasemap } from '../map/basemaps.js';

/* À installer une fois le style chargé : `setLayoutProperty` lève une erreur
 * avant. Un autre fond que celui du style a pu être coché pendant le chargement,
 * ou restauré par le navigateur : on l'applique alors d'emblée. Sinon il n'y a
 * rien à faire, et le démarrage de la carte n'a pas à dépendre de `onChange`. */
export function installBasemapSwitcher({ map, inputs, onChange = () => {} }) {
  const apply = input => {
    setBasemap(map, input.value);
    onChange(input.value);
  };
  const checked = inputs.find(input => input.checked);
  if (checked && checked.value !== DEFAULT_BASEMAP) apply(checked);
  for (const input of inputs)
    input.addEventListener('change', () => apply(input));
}
