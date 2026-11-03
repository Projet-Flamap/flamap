/* =====================================================================
 * MOTEUR DE RECHERCHE — indépendant de la barre comme de la carte
 *
 * Une saisie est proposée aux fournisseurs dans l'ordre ; le premier qui la
 * reconnaît répond, les autres n'en entendent pas parler. C'est ce qui évite
 * tout appel réseau pour des coordonnées.
 *
 * Nouveau type de recherche : un fournisseur `{ id, resolve(text, { signal }) }`
 * de plus dans la liste passée à `createSearchEngine`. `resolve` renvoie `null`
 * si la saisie ne le concerne pas, sinon l'une de ces réponses :
 *
 *   { status: 'results', results }        → voir ci-dessous
 *   { status: 'invalid', messageKey }     → affiché dès la saisie
 *   { status: 'incomplete', messageKey }  → affiché seulement à la validation
 *
 * Un résultat porte `id`, `kind`, `label`, `context` ou `contextKey`, `lat`,
 * `lng`, `zoom` et, s'il a une emprise, `loadGeometry(signal)`.
 * ===================================================================== */

export const DEBOUNCE_MS = 300;
const TIMEOUT_MS = 8000;

export function createSearchEngine(providers) {
  return Object.freeze({
    async search(text, { signal } = {}) {
      for (const provider of providers) {
        const outcome = await provider.resolve(text, { signal });
        if (outcome) return outcome;
      }
      return { status: 'results', results: [] };
    },
  });
}

/* Une seule recherche vit à la fois : une nouvelle saisie annule la précédente,
 * dont la réponse ne doit plus jamais atteindre l'écran. `onChange` reçoit
 * `{ status, text, … }` avec pour statut `idle`, `loading`, `results`, `empty`,
 * `message` ou `error`. */
export function createSearchSession({
  engine, onChange, debounceMs = DEBOUNCE_MS, timeoutMs = TIMEOUT_MS,
}) {
  let timer = null;
  let current = null;

  function stop() {
    clearTimeout(timer);
    timer = null;
    current?.abort();
    current = null;
  }

  async function run(text, { submitted = false } = {}) {
    stop();
    const controller = new AbortController();
    current = controller;
    onChange({ status: 'loading', text });
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    let state;
    try {
      const outcome = await engine.search(text, { signal: controller.signal });
      if (outcome.status === 'results') {
        state = outcome.results.length
          ? { status: 'results', text, results: outcome.results }
          : { status: 'empty', text };
      } else if (outcome.status === 'invalid' || submitted) {
        state = { status: 'message', text, messageKey: outcome.messageKey };
      } else {
        state = { status: 'idle', text };
      }
    } catch (_) {
      state = { status: 'error', text };
    } finally {
      clearTimeout(timeout);
    }
    if (current !== controller) return null;
    current = null;
    onChange(state);
    return state;
  }

  return Object.freeze({
    input(text) {
      stop();
      if (!text.trim()) {
        onChange({ status: 'idle', text });
        return;
      }
      timer = setTimeout(() => { run(text); }, debounceMs);
    },
    submit(text) {
      return run(text, { submitted: true });
    },
    cancel: stop,
  });
}
