// Mode solo : la partie tourne entièrement dans le navigateur, sans serveur, avec le même moteur.
// Place 0 = le joueur, les autres = l'IA. La partie est gardée dans le navigateur entre deux visites.

import { VERSION, createGame, applyAction, viewFor, aiStep, waitingFor } from '../moteur/index.js';
import { rythme, pauseApres, surRythme } from './rythme.js';

const KEY = 'brassins-solo';
const AI_NAMES = ['Brasserie du Moulin', 'La Mousse Noire', 'Les Fûts Joyeux'];
const isAi = (i) => i !== 0;


const randomSeed = () => Array.from(crypto.getRandomValues(new Uint32Array(2)), (n) => n.toString(36)).join('');

function load() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY));
    return s && s.v === VERSION ? s : null;
  } catch { return null; }
}
function save(state) {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* stockage indisponible : la partie continue sans sauvegarde */ }
}

export function startSolo(ui) {
  let opts = { adversaires: 3, niveau: 'compagnon' };
  const fresh = () => createGame({
    seed: randomSeed(), niveau: opts.niveau,
    players: [{ name: 'Toi', ai: false }, ...AI_NAMES.slice(0, opts.adversaires).map((name) => ({ name, ai: true }))],
  });
  let state = load() ?? fresh();
  let timer = null;
  let attente = false; // pas à pas : l'ordinateur attend un clic

  const show = () => { ui.update(viewFor(state, 0), { busy: timer !== null || attente, rejouer: true, pasApas: attente }); save(state); };

  // Une action de l'ordinateur, puis une pause à la mesure de ce qu'il vient de faire (rythme choisi par le joueur)
  function tick() {
    timer = null; attente = false;
    const avant = state.saison;
    const r = aiStep(state, isAi);
    if (r) {
      state = r.state;
      if (state.phase !== 'over') planifier(pauseApres(r.action, state.saison !== avant));
    }
    show();
  }
  function planifier(ms) {
    if (!waitingFor(state).some(isAi)) return;
    if (rythme() === 'pas') { attente = true; return; }
    timer = setTimeout(tick, ms);
  }
  function kick(ms = 400) {
    if (timer || attente || state.phase === 'over') return;
    planifier(ms);
  }
  // Changement de rythme en cours de partie : on reprend avec le nouveau réglage
  surRythme(() => {
    if (state.phase === 'over') return;
    clearTimeout(timer); timer = null; attente = false;
    kick(300); show();
  });

  function send(action) {
    const r = applyAction(state, 0, action);
    if (r.ok) {
      state = r.state;
      kick(action.type === 'endTurn' ? 600 : 250);
    }
    show();
    return r;
  }

  function newGame(o) {
    if (o) opts = { ...opts, ...o };
    clearTimeout(timer);
    timer = null; attente = false;
    state = fresh();
    ui.reset();
    kick();
    show();
  }

  return {
    send, newGame,
    // o : options de la partie ; si elles diffèrent de la partie sauvegardée, on en commence une nouvelle
    start(o) {
      if (o) {
        const same = state.players.length === o.adversaires + 1 && state.opts.niveau === o.niveau;
        if (!same || state.phase === 'over') return newGame(o);
        opts = { ...opts, ...o };
      }
      kick(600); show();
    },
    stop() { clearTimeout(timer); timer = null; attente = false; },
    // Pas à pas : jouer l'action suivante de l'ordinateur
    step() { if (attente) tick(); },
    options: () => ({ ...opts }),
  };
}
