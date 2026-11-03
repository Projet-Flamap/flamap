import { t } from '../i18n.js';
import { createSearchSession } from '../search/engine.js';


/* Déplacement dans la liste, en boucle ; -1 signifie « rien de surligné ». */
export function moveHighlight(current, delta, length) {
  if (!length) return -1;
  if (current < 0) return delta > 0 ? 0 : length - 1;
  return (current + delta + length) % length;
}

/* La barre de recherche : saisie, suggestions et messages. Elle ignore tout de
 * l'origine des résultats (`engine`) comme de leur affichage (`onSelect`). */
export function createPlaceSearch({
  form, engine, onSelect, onClear, blurOnSelect = false, doc = document,
}) {
  const input = form.querySelector('input');
  const clearButton = form.querySelector('.place-search-clear');
  const list = form.querySelector('.place-search-list');
  const status = form.querySelector('.place-search-status');

  let results = [];
  let resultsText = null;
  let highlighted = -1;
  let hasSelection = false;

  const isOpen = () => !list.hidden;

  function syncClear() {
    clearButton.hidden = !input.value && !hasSelection;
  }

  function setMessage(text = '') {
    status.textContent = text;
    status.hidden = !text;
  }

  function setHighlight(index) {
    highlighted = index;
    [...list.children].forEach((option, position) => {
      const active = position === index;
      option.setAttribute('aria-selected', String(active));
      if (active) option.scrollIntoView?.({ block: 'nearest' });
    });
    if (index < 0) input.removeAttribute('aria-activedescendant');
    else input.setAttribute('aria-activedescendant', list.children[index].id);
  }

  function setOpen(open) {
    list.hidden = !open;
    input.setAttribute('aria-expanded', String(open));
    if (!open) setHighlight(-1);
  }

  function renderOptions() {
    list.replaceChildren(...results.map((result, index) => {
      const option = doc.createElement('li');
      option.id = `place-search-option-${index}`;
      option.setAttribute('role', 'option');
      option.setAttribute('aria-selected', 'false');
      const label = doc.createElement('strong');
      label.textContent = result.label;
      const context = doc.createElement('span');
      context.textContent = result.contextKey ? t(result.contextKey) : result.context;
      option.append(label, context);
      // Garder le focus dans le champ : un clic ne doit pas passer pour une sortie.
      option.addEventListener('pointerdown', event => event.preventDefault());
      option.addEventListener('click', () => choose(result));
      return option;
    }));
    setHighlight(-1);
  }

  function render(state) {
    form.setAttribute('aria-busy', String(state.status === 'loading'));
    if (state.status === 'loading') return;
    results = state.status === 'results' ? state.results : [];
    resultsText = state.status === 'results' ? state.text : null;
    renderOptions();
    setOpen(results.length > 0);
    if (state.status === 'empty') setMessage(t('search.noResults', { query: state.text.trim() }));
    else if (state.status === 'error') setMessage(t('search.apiError'));
    else if (state.status === 'message') setMessage(t(state.messageKey));
    else setMessage();
  }

  const session = createSearchSession({ engine, onChange: render });

  function choose(result) {
    session.cancel();
    form.setAttribute('aria-busy', 'false');
    input.value = result.label;
    resultsText = null;
    hasSelection = true;
    setOpen(false);
    setMessage();
    syncClear();
    if (blurOnSelect) input.blur();
    onSelect(result);
  }

  function clear() {
    session.cancel();
    form.setAttribute('aria-busy', 'false');
    input.value = '';
    results = [];
    resultsText = null;
    hasSelection = false;
    list.replaceChildren();
    setOpen(false);
    setMessage();
    syncClear();
    onClear();
    input.focus();
  }

  /* Entrée : l'option surlignée, sinon la première de la liste déjà affichée,
   * sinon une recherche immédiate dont on retient le meilleur résultat. */
  async function submit() {
    const text = input.value;
    if (highlighted >= 0) { choose(results[highlighted]); return; }
    if (!text.trim()) return;
    if (results.length && resultsText === text) { choose(results[0]); return; }
    const state = await session.submit(text);
    if (state?.status === 'results') choose(state.results[0]);
  }

  input.addEventListener('input', () => {
    syncClear();
    session.input(input.value);
  });
  input.addEventListener('keydown', event => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      if (!results.length) return;
      event.preventDefault();
      if (!isOpen()) setOpen(true);
      setHighlight(moveHighlight(highlighted, event.key === 'ArrowDown' ? 1 : -1, results.length));
    } else if (event.key === 'Escape' && (isOpen() || !status.hidden)) {
      // Sinon `main.js` fermerait aussi les panneaux ouverts au même appui.
      event.stopPropagation();
      setOpen(false);
      setMessage();
    }
  });
  input.addEventListener('focus', () => {
    if (results.length && resultsText === input.value) setOpen(true);
  });
  form.addEventListener('submit', event => {
    event.preventDefault();
    submit();
  });
  clearButton.addEventListener('click', clear);
  doc.addEventListener('pointerdown', event => {
    if (form.contains(event.target)) return;
    setOpen(false);
    setMessage();
  });

  return Object.freeze({ clear });
}
