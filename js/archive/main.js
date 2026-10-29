import { t } from '../i18n.js';
import { fetchFireList } from './api.js';
import { renderList } from './list.js';
import { filterFires, yearsOf } from './filter.js';
import { openFire } from './detail.js';

const listEl = document.getElementById('archive-list');
const detailEl = document.getElementById('archive-detail');
const cardsEl = document.getElementById('archive-cards');
const listStatusEl = document.getElementById('archive-list-status');
const backBtn = document.getElementById('archive-back');

const detailElements = {
  mapContainerId: 'archive-map',
  dock: document.getElementById('archive-timebar'),
  slider: document.getElementById('archive-slider'),
  playBtn: document.getElementById('archive-play'),
  clockEl: document.getElementById('archive-clock'),
  summaryEl: document.getElementById('archive-summary'),
  statusEl: document.getElementById('archive-detail-status'),
};

const filterEl = document.getElementById('archive-filter');
const yearSelect = document.getElementById('archive-year');
const periodEl = document.getElementById('archive-period');
const fromInput = document.getElementById('archive-from');
const toInput = document.getElementById('archive-to');
const countEl = document.getElementById('archive-count');

let allFires = [];

// Filtre par année ou période : la liste complète est déjà en mémoire, on ne
// fait que la retrier côté client — aucun appel supplémentaire à l'API. Le
// filtre vit dans le DOM, il survit donc à un aller-retour vers un feu.
function fillYears(fires) {
  const periodOption = yearSelect.querySelector('option[value="period"]');
  for (const year of yearsOf(fires)) {
    periodOption.before(new Option(String(year), String(year)));
  }
}

function currentFilter() {
  if (yearSelect.value === 'period') return { from: fromInput.value, to: toInput.value };
  return yearSelect.value ? { year: Number(yearSelect.value) } : {};
}

function applyFilter() {
  periodEl.hidden = yearSelect.value !== 'period';
  const fires = filterFires(allFires, currentFilter());
  countEl.textContent = t('archive.filter.count', { n: fires.length, count: fires.length });
  renderList(cardsEl, fires, fireId => showDetail(fireId),
    fires.length === allFires.length ? 'archive.empty' : 'archive.filter.none');
}

yearSelect.addEventListener('change', applyFilter);
fromInput.addEventListener('change', applyFilter);
toInput.addEventListener('change', applyFilter);
filterEl.addEventListener('submit', event => event.preventDefault());

let currentFire = null; // { destroy }
// Incrémenté à chaque navigation : une réponse asynchrone qui revient après
// coup (retour/avant rapide, double clic) se reconnaît obsolète et se détruit
// sans toucher à l'affichage courant, au lieu d'écraser une carte plus récente.
let navToken = 0;

// Chargée une seule fois et mise en cache : la liste doit être prête même si
// on atterrit directement sur un lien `?id=…`, sinon un retour arrière la
// montre vide (elle n'avait jamais été demandée).
let fireListPromise = null;
function loadFireList() {
  if (fireListPromise) return fireListPromise;
  listStatusEl.textContent = '';
  listStatusEl.append(Object.assign(document.createElement('span'), { className: 'archive-loader' }),
    document.createTextNode(t('archive.loading')));
  fireListPromise = fetchFireList().then(fires => {
    listStatusEl.textContent = '';
    allFires = fires;
    fillYears(fires);
    filterEl.hidden = !fires.length;
    applyFilter();
  }).catch(error => {
    console.error(t('archive.list.errorLog'), error);
    listStatusEl.textContent = t('archive.list.error');
    fireListPromise = null; // un retour ultérieur sur la liste retentera l'appel
  });
  return fireListPromise;
}

function showList() {
  navToken++;
  currentFire?.destroy();
  currentFire = null;
  detailEl.hidden = true;
  listEl.hidden = false;
  loadFireList();
}

async function showDetail(id, { push = true } = {}) {
  const token = ++navToken;
  currentFire?.destroy();
  currentFire = null;
  listEl.hidden = true;
  detailEl.hidden = false;
  detailElements.statusEl.textContent = t('archive.detail.loading');
  detailElements.summaryEl.innerHTML = '';

  if (push) history.pushState({ id }, '', `?id=${encodeURIComponent(id)}`);

  let result;
  try {
    result = await openFire(id, detailElements);
  } catch (error) {
    console.error(t('archive.detail.errorLog'), error);
    if (token === navToken) detailElements.statusEl.textContent = t('archive.detail.error');
    return;
  }
  if (token !== navToken) {
    // une navigation plus récente a eu lieu pendant le chargement : cette
    // réponse est obsolète, on la détruit sans l'appliquer à l'affichage.
    result.destroy();
    return;
  }
  if (result.notFound) {
    detailElements.statusEl.textContent = t('archive.notFound');
    return;
  }
  // openFire() a déjà mis à jour le statut lui-même (vidé s'il rejoue le feu,
  // ou message « pas assez de données » sinon) : ne pas l'écraser ici.
  currentFire = result;
}

backBtn.addEventListener('click', () => {
  history.pushState({}, '', location.pathname);
  showList();
});

addEventListener('popstate', () => {
  const id = new URLSearchParams(location.search).get('id');
  if (id) showDetail(id, { push: false });
  else showList();
});

function init() {
  // Toujours amorcée, même en démarrant sur un lien direct vers un feu : voir
  // loadFireList() ci-dessus.
  loadFireList();
  const id = new URLSearchParams(location.search).get('id');
  if (id) showDetail(id, { push: false });
}

init();
