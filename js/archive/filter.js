// Fonctions pures du filtre de la liste : par année civile ou par période
// libre (deux dates « AAAA-MM-JJ » venues d'un <input type="date">). Les
// bornes sont prises en heure locale du navigateur, comme les champs date
// eux-mêmes — le public est en France ou en Espagne, même fuseau.

// Un feu est retenu dès qu'il chevauche la période, pas seulement s'il y
// commence : un feu parti le 30 décembre et éteint le 3 janvier appartient
// aux deux années.
export function overlaps(fire, [start, end]) {
  const first = fire.first_ts ?? fire.last_ts;
  const last = fire.last_ts ?? fire.first_ts;
  if (!Number.isFinite(first)) return false;
  return first < end && last >= start;
}

const toTs = date => Math.floor(date.getTime() / 1000);

export function yearBounds(year) {
  return [toTs(new Date(year, 0, 1)), toTs(new Date(year + 1, 0, 1))];
}

function parseDay(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value || '');
  return match ? new Date(+match[1], match[2] - 1, +match[3]) : null;
}

// Une borne absente laisse la période ouverte de ce côté ; la date de fin est
// incluse (jusqu'au lendemain minuit). Deux bornes inversées sont remises
// dans l'ordre plutôt que de vider la liste sans explication.
export function periodBounds(from, to) {
  let start = parseDay(from);
  let end = parseDay(to);
  if (start && end && start > end) [start, end] = [end, start];
  if (end) end.setDate(end.getDate() + 1);
  return [start ? toTs(start) : -Infinity, end ? toTs(end) : Infinity];
}

// Années couvertes par au moins un feu, de la plus récente à la plus ancienne.
export function yearsOf(fires) {
  const years = new Set();
  for (const fire of fires) {
    const first = fire.first_ts ?? fire.last_ts;
    const last = fire.last_ts ?? fire.first_ts;
    if (!Number.isFinite(first)) continue;
    const to = new Date(last * 1000).getFullYear();
    for (let y = new Date(first * 1000).getFullYear(); y <= to; y++) years.add(y);
  }
  return [...years].sort((a, b) => b - a);
}

// `filter` : { year } ou { from, to } ; vide ou absent, tout passe.
export function filterFires(fires, filter = {}) {
  let bounds = null;
  if (Number.isInteger(filter.year)) bounds = yearBounds(filter.year);
  else if (filter.from || filter.to) bounds = periodBounds(filter.from, filter.to);
  return bounds ? fires.filter(fire => overlaps(fire, bounds)) : fires;
}
