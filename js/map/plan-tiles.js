/* Là où le Plan IGN n'a pas de tuile (400 ou 404, au-delà des frontières dès le
 * zoom 10 environ), MapLibre étirerait la tuile parente : on lirait des lettres
 * géantes. Répondre par une tuile transparente laisse voir Sentinel-2 dessous. */
export const PLAN_PROTOCOL = 'flamap-plan';

// PNG de 1 × 1 pixel, entièrement transparent.
const EMPTY_TILE = Uint8Array.from(atob(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
), char => char.charCodeAt(0));

export async function loadPlanTile(params, abortController, fetchImpl = fetch) {
  const url = params.url.replace(`${PLAN_PROTOCOL}://`, 'https://');
  const response = await fetchImpl(url, { signal: abortController.signal });
  if (response.status === 400 || response.status === 404)
    return { data: EMPTY_TILE.slice().buffer };
  if (!response.ok) throw new Error(`tuile du Plan IGN indisponible : ${response.status}`);
  return { data: await response.arrayBuffer() };
}

export function registerPlanProtocol(maplibregl) {
  maplibregl.addProtocol(PLAN_PROTOCOL, (params, abortController) =>
    loadPlanTile(params, abortController));
}
