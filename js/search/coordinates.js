/* =====================================================================
 * COORDONNÉES GPS — reconnaissance sans appel réseau
 *
 * L'ordre est celui de l'usage courant : latitude, puis longitude. Rien n'est
 * inversé d'office : « 6.1757, 49.1193 » est un point valide, en Somalie.
 *
 * La virgule sert à la fois de décimale et de séparateur, d'où quelques cas à
 * trancher : « 49,6 » se lit comme deux nombres (49 ; 6), « 49,1193 6,1757 » et
 * « 49,1193, 6,1757 » comme deux décimaux. Un entier seul (« 57000 ») est un
 * code postal ou un numéro : il revient au géocodeur.
 * ===================================================================== */

const ANY = '[+-]?\\d+(?:[.,]\\d+)?';
const DOT = '[+-]?\\d+(?:\\.\\d+)?';
const COMMA = '[+-]?\\d+,\\d+';
const PAIRS = [
  new RegExp(`^(${ANY})\\s*;\\s*(${ANY})$`),
  new RegExp(`^(${ANY})\\s+(${ANY})$`),
  new RegExp(`^(${DOT})\\s*,\\s*(${DOT})$`),
  new RegExp(`^(${COMMA})\\s*,\\s*(${COMMA})$`),
  new RegExp(`^(${ANY}),\\s+(${ANY})$`),
];
const NUMERIC = /^[\d\s.,;+-]+$/;
/* Ce que l'on traverse en tapant une paire : « 49.1 », « 49.1, », « 49.1, 6. ». */
const PARTIAL = /^[+-]?\d*(?:[.,]\d*)?(?:\s*[,;\s]\s*[+-]?\d*[.,]?)?$/;

const number = text => Number(text.replace(',', '.'));

/* Quatre issues : `valid` porte le point ; `invalid` et `partial` sont bien des
 * coordonnées, fausses ou en cours de saisie ; `none` n'en est pas. */
export function parseCoordinates(input) {
  const text = String(input ?? '').trim();
  if (!NUMERIC.test(text) || /^\d+$/.test(text)) return { status: 'none' };
  for (const pattern of PAIRS) {
    const match = text.match(pattern);
    if (!match) continue;
    const lat = number(match[1]);
    const lng = number(match[2]);
    return Math.abs(lat) <= 90 && Math.abs(lng) <= 180
      ? { status: 'valid', lat, lng }
      : { status: 'invalid' };
  }
  return { status: PARTIAL.test(text) ? 'partial' : 'invalid' };
}

export const coordinatesProvider = Object.freeze({
  id: 'coordinates',
  resolve(text) {
    const parsed = parseCoordinates(text);
    switch (parsed.status) {
      case 'valid':
        return {
          status: 'results',
          results: [{
            id: `coordinates:${parsed.lat},${parsed.lng}`,
            kind: 'coordinates',
            label: `${parsed.lat}, ${parsed.lng}`,
            contextKey: 'search.coordinates.context',
            lat: parsed.lat,
            lng: parsed.lng,
            zoom: 14,
          }],
        };
      case 'invalid':
        return { status: 'invalid', messageKey: 'search.coordinates.invalid' };
      case 'partial':
        return { status: 'incomplete', messageKey: 'search.coordinates.incomplete' };
      default:
        return null;
    }
  },
});
