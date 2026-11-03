/* =====================================================================
 * GÉOCODEUR — service de la Géoplateforme IGN, public et sans clé
 *
 * Il ne couvre que la France. `/search` sert les suggestions comme le choix
 * final : il renvoie le type du résultat, dont dépend le zoom. Le débit est
 * limité à 50 requêtes par seconde et par IP (blocage de 5 s, code 429).
 * ===================================================================== */

const SEARCH_URL = 'https://data.geopf.fr/geocodage/search';
const MIN_LENGTH = 3;
const MAX_LENGTH = 200;
const LIMIT = 6;

/* Le plus proche pour un numéro, le plus large pour une commune. */
const KINDS = Object.freeze({
  housenumber: { kind: 'address', zoom: 17 },
  street: { kind: 'street', zoom: 15 },
  locality: { kind: 'locality', zoom: 14 },
  municipality: { kind: 'commune', zoom: 12 },
});

/* L'API refuse ce qui ne commence ni par une lettre ni par un chiffre. */
export function normalizeQuery(text) {
  return String(text ?? '').trim()
    .replace(/^[^\p{L}\p{N}]+/u, '')
    .slice(0, MAX_LENGTH);
}

function toResult(feature, loadOutline) {
  const coordinates = feature?.geometry?.coordinates;
  const properties = feature?.properties;
  if (!Array.isArray(coordinates) || !properties?.label) return null;
  const [lng, lat] = coordinates;
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
  const { kind, zoom } = KINDS[properties.type] ?? KINDS.street;
  const commune = kind === 'commune';
  return {
    id: properties.id ?? `${lng},${lat}`,
    kind,
    label: properties.label,
    context: commune && properties.postcode
      ? `${properties.postcode} · ${properties.context ?? ''}`
      : properties.context ?? '',
    lat,
    lng,
    zoom,
    ...(commune && properties.citycode ? {
      loadGeometry: signal => loadOutline(properties.name ?? properties.label,
        properties.citycode, signal),
    } : {}),
  };
}

export function createGeocoderProvider({ fetchImpl = (...args) => fetch(...args) } = {}) {
  async function request(params, signal) {
    const url = new URL(SEARCH_URL);
    for (const [name, value] of Object.entries(params))
      url.searchParams.set(name, value);
    const response = await fetchImpl(url, { signal });
    if (!response.ok) throw new Error(`Géocodage HTTP ${response.status}`);
    return response.json();
  }

  /* Le contour n'existe que dans l'index `poi`, interrogé par le nom. Un nom de
   * moins de trois lettres (Eu, Y) y est refusé, et rien ne le remplace. Sans
   * géométrie exploitable, la commune garde son seul marqueur. */
  async function loadOutline(name, citycode, signal) {
    if (name.length < MIN_LENGTH) return null;
    const data = await request({
      q: name,
      index: 'poi',
      category: 'commune',
      citycode,
      returntruegeometry: 'true',
      limit: '1',
    }, signal);
    const raw = data.features?.[0]?.properties?.truegeometry;
    if (!raw) return null;
    const geometry = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return ['Polygon', 'MultiPolygon'].includes(geometry?.type) ? geometry : null;
  }

  return Object.freeze({
    id: 'geocoder',
    async resolve(text, { signal } = {}) {
      const q = normalizeQuery(text);
      if (q.length < MIN_LENGTH)
        return { status: 'incomplete', messageKey: 'search.tooShort' };
      const data = await request({ q, index: 'address', limit: String(LIMIT) }, signal);
      const results = (data.features ?? [])
        .map(feature => toResult(feature, loadOutline))
        .filter(Boolean);
      return { status: 'results', results };
    },
  });
}
