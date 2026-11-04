// Moteur de règles : pur, sans DOM, sans horloge. Tout l'état est sérialisable en JSON.
//
//   createGame(options)                 → état initial
//   applyAction(state, playerId, action) → { ok: true, state } | { ok: false, error }
//   legalActions(state, playerId)       → actions possibles (avec leurs cibles)
//   waitingFor(state)                   → joueurs dont on attend une décision
//   viewFor(state, playerId)            → état filtré pour ce joueur
//
// `applyAction` ne modifie jamais l'état reçu : il travaille sur une copie.

import { RES, COST, DECK, PIECES, VP_TO_WIN, LONGEST_MIN, ARMY_MIN, DISCARD_ABOVE, Z, total } from './constantes.js';
import { hashSeed, int, shuffle } from './alea.js';
import { TOPO, otherEnd, rollBoard } from './plateau.js';

export const VERSION = 1;

/* ---------- création ---------- */

// players : [{ name, ai }] (4 places). opts.aiOffersToHumans : les IA peuvent proposer des échanges aux humains.
export function createGame({ seed = Date.now(), players, aiOffersToHumans = true } = {}) {
  if (!Array.isArray(players) || players.length < 2 || players.length > 4) throw new Error('Il faut de 2 à 4 places.');
  const s = { rng: hashSeed(seed) };
  const board = rollBoard(s);
  const state = {
    v: VERSION,
    seed: String(seed),
    rng: s.rng,
    seq: 0,
    opts: { aiOffersToHumans },
    hexes: board.hexes,
    ports: board.ports,
    verts: TOPO.verts.map(() => ({ o: null, t: 0 })),
    edges: TOPO.edges.map(() => null),
    players: players.map((p, i) => ({
      name: p.name, ai: !!p.ai, res: Z(), dev: [], knights: 0,
      roads: PIECES.roads, settles: PIECES.settles, cities: PIECES.cities, offersOn: true,
    })),
    phase: 'setup',
    setup: { k: 0, step: 'settle', last: null },
    cur: 0, turn: 0, rolled: false, devPlayed: false, dice: [0, 0], lastRoll: 0,
    robber: board.hexes.findIndex((h) => h.res === 'friche'),
    longest: null, army: null, winner: null,
    deck: [], pending: null, trade: null, tradeSeq: 0, tradesThisTurn: 0, turnActions: 0,
    log: [],
  };
  state.deck = shuffle(state, [...DECK]);
  state.setup = { k: 0, step: 'settle', last: null };
  state.cur = setupOrder(state)[0];
  log(state, { k: 'start' });
  return state;
}

/* ---------- lectures ---------- */

export const setupOrder = (s) => { const n = s.players.map((_, i) => i); return [...n, ...[...n].reverse()]; };
const settleOK = (s, v) => s.verts[v].o === null && TOPO.verts[v].adj.every((a) => s.verts[a].o === null);
export const canAfford = (res, c) => Object.entries(c).every(([r, n]) => res[r] >= n);

export function validSettle(s, pi, setup) {
  const out = [];
  s.verts.forEach((v, i) => {
    if (settleOK(s, i) && (setup || TOPO.verts[i].edges.some((e) => s.edges[e] === pi))) out.push(i);
  });
  return out;
}
export function validRoad(s, pi) {
  const out = [];
  s.edges.forEach((o, i) => {
    if (o !== null) return;
    const e = TOPO.edges[i];
    if ([e.a, e.b].some((u) => {
      const ow = s.verts[u].o;
      return ow === pi || (ow === null && TOPO.verts[u].edges.some((x) => x !== i && s.edges[x] === pi));
    })) out.push(i);
  });
  return out;
}
export const validCity = (s, pi) => s.verts.map((v, i) => (v.o === pi && v.t === 1 ? i : -1)).filter((i) => i >= 0);
export const portOf = (s, v) => (TOPO.verts[v].port === null ? null : s.ports[TOPO.verts[v].port]);
export function rate(s, pi, r) {
  let x = 4;
  s.verts.forEach((v, i) => {
    if (v.o !== pi) return;
    const p = portOf(s, i);
    if (!p) return;
    if (p === '3:1') x = Math.min(x, 3); else if (p === r) x = 2;
  });
  return x;
}
export function vp(s, pi, hidden) {
  let n = 0;
  s.verts.forEach((v) => { if (v.o === pi) n += v.t; });
  if (s.longest === pi) n += 2;
  if (s.army === pi) n += 2;
  if (hidden) n += s.players[pi].dev.filter((c) => c.t === 'vp').length;
  return n;
}
export function roadLen(s, pi) {
  let best = 0;
  const dfs = (v, used) => {
    let m = 0;
    for (const e of TOPO.verts[v].edges) {
      if (s.edges[e] !== pi || used.has(e)) continue;
      const o = otherEnd(e, v), ow = s.verts[o].o;
      used.add(e);
      const l = 1 + (ow !== null && ow !== pi ? 0 : dfs(o, used));
      used.delete(e);
      if (l > m) m = l;
    }
    return m;
  };
  TOPO.verts.forEach((v, i) => { if (v.edges.some((e) => s.edges[e] === pi)) best = Math.max(best, dfs(i, new Set())); });
  return best;
}
export const playableDev = (s, pi) => s.players[pi].dev.filter((c) => c.t !== 'vp' && c.turn < s.turn);
export const robberVictims = (s, hex, pi) =>
  [...new Set(TOPO.hexes[hex].verts.map((v) => s.verts[v].o).filter((o) => o !== null && o !== pi && total(s.players[o].res) > 0))];

// Joueurs dont une décision est attendue (plusieurs à la fois possible : défausse, réponses d'échange).
export function waitingFor(s) {
  if (s.phase === 'over') return [];
  const out = new Set();
  const p = s.pending;
  if (p?.type === 'discard') Object.keys(p.need).forEach((k) => out.add(+k));
  else if (p) out.add(p.p);
  else out.add(s.cur);
  if (s.trade) s.trade.to.forEach((k) => { if (!s.trade.resp[k]) out.add(k); });
  return [...out].sort((a, b) => a - b);
}

/* ---------- application ---------- */

const err = (error) => ({ ok: false, error });

export function applyAction(state, pi, action) {
  if (!action || typeof action.type !== 'string') return err('Action illisible.');
  if (!Number.isInteger(pi) || pi < 0 || pi >= state.players.length) return err('Joueur inconnu.');
  const handler = HANDLERS[action.type];
  if (!handler) return err(`Action inconnue : ${action.type}.`);
  if (state.phase === 'over') return err('La partie est terminée.');
  const s = structuredClone(state);
  const why = handler(s, pi, action);
  if (why) return err(why);
  s.seq++;
  if (pi === state.cur && pi === s.cur && action.type !== 'endTurn') s.turnActions++;
  checkWin(s);
  return { ok: true, state: s };
}

function log(s, ev) {
  // Jamais de champ undefined : l'état doit rester identique après un passage par JSON
  for (const k of Object.keys(ev)) if (ev[k] === undefined) delete ev[k];
  s.log.push({ i: (s.log.at(-1)?.i ?? -1) + 1, turn: s.turn, ...ev });
  if (s.log.length > 120) s.log.shift();
}

function checkWin(s) {
  if (s.phase !== 'main') return;
  if (vp(s, s.cur, true) >= VP_TO_WIN) {
    s.phase = 'over';
    s.winner = s.cur;
    s.pending = null;
    s.trade = null;
    log(s, { k: 'win', p: s.cur, scores: s.players.map((_, i) => vp(s, i, true)) });
  }
}

const isRes = (r) => RES.includes(r);
function readCounts(o) {
  if (!o || typeof o !== 'object') return null;
  const c = Z();
  for (const r of RES) {
    const n = o[r] ?? 0;
    if (!Number.isInteger(n) || n < 0) return null;
    c[r] = n;
  }
  for (const k of Object.keys(o)) if (!isRes(k)) return null;
  return c;
}
const pay = (p, c) => { for (const r in c) p.res[r] -= c[r]; };

function updateLongest(s) {
  const L = s.players.map((_, i) => roadLen(s, i)), max = Math.max(...L), h = s.longest;
  if (h !== null && L[h] >= LONGEST_MIN && L[h] >= max) return;
  const tops = L.map((l, i) => (l === max ? i : -1)).filter((i) => i >= 0);
  const nh = max >= LONGEST_MIN && tops.length === 1 ? tops[0] : null;
  if (nh !== h) { s.longest = nh; if (nh !== null) log(s, { k: 'longest', p: nh, len: max }); }
}
function updateArmy(s) {
  const h = s.army;
  s.players.forEach((p, i) => { if (p.knights >= ARMY_MIN && (s.army === null || p.knights > s.players[s.army].knights)) s.army = i; });
  if (s.army !== h) log(s, { k: 'army', p: s.army });
}

function placeSettle(s, pi, v) { s.verts[v] = { o: pi, t: 1 }; s.players[pi].settles--; updateLongest(s); }
function placeCity(s, pi, v) { s.verts[v].t = 2; s.players[pi].cities--; s.players[pi].settles++; }
function placeRoad(s, pi, e) { s.edges[e] = pi; s.players[pi].roads--; updateLongest(s); }

// Garde commune aux actions du joueur courant pendant la phase principale
function mainTurn(s, pi, { rolled } = {}) {
  if (s.phase !== 'main') return 'Pas encore : la mise en place est en cours.';
  if (s.cur !== pi) return "Ce n'est pas ton tour.";
  if (s.pending) return 'Une décision est en attente.';
  if (rolled && !s.rolled) return "Lance d'abord les dés.";
  return null;
}

function startRobber(s, pi, reason) { s.pending = { type: 'robber', p: pi, reason }; }

function steal(s, pi, victim) {
  const pool = [];
  RES.forEach((r) => { for (let k = 0; k < s.players[victim].res[r]; k++) pool.push(r); });
  const r = pool[int(s, pool.length)];
  s.players[victim].res[r]--;
  s.players[pi].res[r]++;
  log(s, { k: 'steal', p: pi, v: victim, r });
}

function distribute(s, n) {
  const gains = s.players.map(() => Z());
  s.hexes.forEach((h, hi) => {
    if (h.num !== n || hi === s.robber) return;
    TOPO.hexes[hi].verts.forEach((v) => {
      const V = s.verts[v];
      if (V.o !== null) { s.players[V.o].res[h.res] += V.t; gains[V.o][h.res] += V.t; }
    });
  });
  log(s, { k: 'produce', gains: gains.map((g, p) => ({ p, res: g })).filter((x) => total(x.res) > 0) });
}

function endTradeIfAny(s, why) {
  if (!s.trade) return;
  log(s, { k: 'tradeClosed', p: s.trade.from, why });
  s.trade = null;
}

const HANDLERS = {
  build(s, pi, { what, at }) {
    const p = s.players[pi];
    if (!Number.isInteger(at)) return 'Emplacement manquant.';
    if (s.phase === 'setup') {
      if (s.cur !== pi) return "Ce n'est pas ton tour.";
      const second = s.setup.k >= s.players.length;
      if (s.setup.step === 'settle') {
        if (what !== 'settle') return 'Place d’abord une microbrasserie.';
        if (!validSettle(s, pi, true).includes(at)) return 'Emplacement trop proche d’un autre bâtiment.';
        placeSettle(s, pi, at);
        log(s, { k: 'build', p: pi, what, at, free: true });
        if (second) {
          const g = Z();
          TOPO.verts[at].hexes.forEach((h) => { const t = s.hexes[h]; if (t.res !== 'friche') { p.res[t.res]++; g[t.res]++; } });
          log(s, { k: 'setupGain', p: pi, res: g });
        }
        s.setup = { k: s.setup.k, step: 'road', last: at };
        return null;
      }
      if (what !== 'road') return 'Trace la tournée qui part de ta microbrasserie.';
      if (!TOPO.verts[s.setup.last].edges.includes(at) || s.edges[at] !== null) return 'La tournée doit partir de la microbrasserie que tu viens de poser.';
      placeRoad(s, pi, at);
      log(s, { k: 'build', p: pi, what, at, free: true });
      const order = setupOrder(s), k = s.setup.k + 1;
      if (k >= order.length) {
        s.phase = 'main'; s.cur = 0; s.turn = 1; s.setup = null; s.turnActions = 0;
        log(s, { k: 'season', p: 0 });
      } else {
        s.setup = { k, step: 'settle', last: null };
        s.cur = order[k];
      }
      return null;
    }
    // Nouveau camion : tournées gratuites
    if (s.pending?.type === 'roads') {
      if (s.pending.p !== pi) return "Ce n'est pas à toi de jouer.";
      if (what !== 'road') return 'Pose tes tournées gratuites.';
      if (!validRoad(s, pi).includes(at)) return 'Cette tournée doit prolonger ton réseau.';
      placeRoad(s, pi, at);
      log(s, { k: 'build', p: pi, what, at, free: true });
      s.pending.left--;
      if (s.pending.left <= 0 || p.roads <= 0 || !validRoad(s, pi).length) s.pending = null;
      return null;
    }
    const g = mainTurn(s, pi, { rolled: true });
    if (g) return g;
    if (what === 'road') {
      if (p.roads <= 0) return 'Plus de tournée disponible.';
      if (!canAfford(p.res, COST.road)) return 'Il te manque des ressources.';
      if (!validRoad(s, pi).includes(at)) return 'Cette tournée doit prolonger ton réseau.';
      pay(p, COST.road); placeRoad(s, pi, at);
    } else if (what === 'settle') {
      if (p.settles <= 0) return 'Plus de microbrasserie disponible.';
      if (!canAfford(p.res, COST.settle)) return 'Il te manque des ressources.';
      if (!validSettle(s, pi, false).includes(at)) return 'Emplacement non relié à ton réseau ou trop proche d’un bâtiment.';
      pay(p, COST.settle); placeSettle(s, pi, at);
    } else if (what === 'city') {
      if (p.cities <= 0) return 'Plus de grande brasserie disponible.';
      if (!canAfford(p.res, COST.city)) return 'Il te manque des ressources.';
      if (!validCity(s, pi).includes(at)) return 'Seule une de tes microbrasseries peut être agrandie.';
      pay(p, COST.city); placeCity(s, pi, at);
    } else return 'Construction inconnue.';
    log(s, { k: 'build', p: pi, what, at });
    return null;
  },

  roll(s, pi) {
    const g = mainTurn(s, pi);
    if (g) return g;
    if (s.rolled) return 'Les dés sont déjà lancés.';
    const d = [1 + int(s, 6), 1 + int(s, 6)], n = d[0] + d[1];
    s.dice = d; s.rolled = true; s.lastRoll = n;
    log(s, { k: 'roll', p: pi, d });
    if (n !== 7) { distribute(s, n); return null; }
    log(s, { k: 'seven', p: pi });
    const need = {};
    s.players.forEach((q, i) => { const t = total(q.res); if (t > DISCARD_ABOVE) need[i] = Math.floor(t / 2); });
    if (Object.keys(need).length) s.pending = { type: 'discard', need, then: pi };
    else startRobber(s, pi, 'seven');
    return null;
  },

  discard(s, pi, { res }) {
    const p = s.pending;
    if (p?.type !== 'discard' || p.need[pi] === undefined) return "Tu n'as rien à défausser.";
    const c = readCounts(res);
    if (!c) return 'Défausse illisible.';
    if (total(c) !== p.need[pi]) return `Défausse exactement ${p.need[pi]} cartes.`;
    if (!canAfford(s.players[pi].res, c)) return "Tu n'as pas ces cartes.";
    pay(s.players[pi], c);
    log(s, { k: 'discard', p: pi, n: p.need[pi], res: c });
    delete p.need[pi];
    if (!Object.keys(p.need).length) startRobber(s, p.then, 'seven');
    return null;
  },

  moveRobber(s, pi, { hex }) {
    const p = s.pending;
    if (p?.type !== 'robber' || p.p !== pi) return "Ce n'est pas à toi de déplacer le contrôleur.";
    if (!Number.isInteger(hex) || hex < 0 || hex >= s.hexes.length) return 'Case inconnue.';
    if (hex === s.robber) return 'Le contrôleur doit changer de case.';
    s.robber = hex;
    log(s, { k: 'robber', p: pi, hex });
    const vic = robberVictims(s, hex, pi);
    s.pending = null;
    if (vic.length === 1) steal(s, pi, vic[0]);
    else if (vic.length > 1) s.pending = { type: 'steal', p: pi, victims: vic };
    return null;
  },

  steal(s, pi, { victim }) {
    const p = s.pending;
    if (p?.type !== 'steal' || p.p !== pi) return "Tu n'as personne à piocher.";
    if (!p.victims.includes(victim)) return 'Choisis un voisin de la case.';
    s.pending = null;
    steal(s, pi, victim);
    return null;
  },

  buyDev(s, pi) {
    const g = mainTurn(s, pi, { rolled: true });
    if (g) return g;
    const p = s.players[pi];
    if (!s.deck.length) return 'La pioche est vide.';
    if (!canAfford(p.res, COST.dev)) return 'Il te manque des ressources.';
    pay(p, COST.dev);
    const t = s.deck.pop();
    p.dev.push({ t, turn: s.turn });
    log(s, { k: 'buyDev', p: pi, t });
    return null;
  },

  playDev(s, pi, { card, res, r }) {
    const g = mainTurn(s, pi);
    if (g) return g;
    const p = s.players[pi];
    if (card === 'vp') return 'Une médaille ne se joue pas : elle compte à la victoire.';
    if (s.devPlayed) return 'Une seule carte Événement par tour.';
    const idx = p.dev.findIndex((c) => c.t === card && c.turn < s.turn);
    if (idx < 0) return p.dev.some((c) => c.t === card) ? 'Carte tirée ce tour-ci : jouable au prochain tour.' : "Tu n'as pas cette carte.";
    if (card === 'plenty') {
      const c = readCounts(res);
      if (!c || total(c) !== 2) return 'Choisis 2 ressources.';
      res = c;
    }
    if (card === 'mono' && !isRes(r)) return 'Choisis une ressource.';
    p.dev.splice(idx, 1);
    s.devPlayed = true;
    log(s, { k: 'playDev', p: pi, t: card });
    if (card === 'knight') { p.knights++; updateArmy(s); startRobber(s, pi, 'knight'); }
    else if (card === 'roads') {
      if (p.roads > 0 && validRoad(s, pi).length) s.pending = { type: 'roads', p: pi, left: Math.min(2, p.roads) };
    } else if (card === 'plenty') {
      RES.forEach((x) => { p.res[x] += res[x]; });
      log(s, { k: 'plenty', p: pi, res });
    } else if (card === 'mono') {
      let n = 0;
      s.players.forEach((q, i) => { if (i !== pi) { n += q.res[r]; q.res[r] = 0; } });
      p.res[r] += n;
      log(s, { k: 'mono', p: pi, r, n });
    } else return 'Carte inconnue.';
    return null;
  },

  bankTrade(s, pi, { give, get }) {
    const g = mainTurn(s, pi, { rolled: true });
    if (g) return g;
    if (!isRes(give) || !isRes(get) || give === get) return 'Choisis deux ressources différentes.';
    const p = s.players[pi], n = rate(s, pi, give);
    if (p.res[give] < n) return `Il te faut ${n} cartes.`;
    p.res[give] -= n; p.res[get]++;
    log(s, { k: 'bank', p: pi, give, n, get });
    return null;
  },

  proposeTrade(s, pi, { give, get, to }) {
    const g = mainTurn(s, pi, { rolled: true });
    if (g) return g;
    if (s.trade) return 'Une offre est déjà ouverte.';
    const G = readCounts(give), W = readCounts(get);
    if (!G || !W || !total(G) || !total(W)) return 'Indique ce que tu donnes et ce que tu demandes.';
    if (RES.some((r) => G[r] && W[r])) return 'Tu ne peux pas donner et demander la même ressource.';
    if (!canAfford(s.players[pi].res, G)) return "Tu n'as pas ces cartes.";
    const others = s.players.map((_, i) => i).filter((i) => i !== pi && s.players[i].offersOn);
    const list = to === undefined ? others : to;
    if (!Array.isArray(list) || !list.length || list.some((i) => !others.includes(i)) || new Set(list).size !== list.length) return 'Personne ne peut recevoir cette offre.';
    s.trade = { id: ++s.tradeSeq, from: pi, give: G, get: W, to: list, resp: {} };
    s.tradesThisTurn++;
    log(s, { k: 'tradeOffer', p: pi, give: G, get: W, to: list });
    return null;
  },

  respondTrade(s, pi, { accept, counter }) {
    const t = s.trade;
    if (!t || !t.to.includes(pi)) return "Aucune offre ne t'est adressée.";
    if (counter) {
      const G = readCounts(counter.give), W = readCounts(counter.get);
      if (!G || !W || !total(G) || !total(W)) return 'Contre-proposition illisible.';
      if (!canAfford(s.players[pi].res, W)) return "Tu n'as pas les cartes de ta contre-proposition.";
      t.resp[pi] = { s: 'counter', give: G, get: W };
    } else if (accept) {
      if (!canAfford(s.players[pi].res, t.get)) return "Tu n'as pas les cartes demandées.";
      t.resp[pi] = { s: 'accept' };
    } else t.resp[pi] = { s: 'refuse' };
    log(s, { k: 'tradeResp', p: pi, from: t.from, s: t.resp[pi].s, give: t.resp[pi].give, get: t.resp[pi].get });
    return null;
  },

  concludeTrade(s, pi, { with: w }) {
    const t = s.trade;
    if (!t || t.from !== pi) return "Tu n'as pas d'offre ouverte.";
    const r = t.resp[w];
    if (!r || r.s === 'refuse') return "Ce joueur n'a pas accepté.";
    const give = r.s === 'counter' ? r.give : t.give, get = r.s === 'counter' ? r.get : t.get;
    const a = s.players[pi], b = s.players[w];
    if (!canAfford(a.res, give)) return "Tu n'as plus les cartes proposées.";
    if (!canAfford(b.res, get)) { delete t.resp[w]; return "Ce joueur n'a plus les cartes demandées."; }
    RES.forEach((x) => { a.res[x] += get[x] - give[x]; b.res[x] += give[x] - get[x]; });
    s.trade = null;
    log(s, { k: 'tradeDone', p: pi, with: w, give, get });
    return null;
  },

  cancelTrade(s, pi) {
    if (!s.trade || s.trade.from !== pi) return "Tu n'as pas d'offre ouverte.";
    endTradeIfAny(s, 'cancel');
    return null;
  },

  setOffers(s, pi, { on }) {
    s.players[pi].offersOn = !!on;
    return null;
  },

  endTurn(s, pi) {
    const g = mainTurn(s, pi, { rolled: true });
    if (g) return g;
    endTradeIfAny(s, 'end');
    log(s, { k: 'endTurn', p: pi });
    s.cur = (s.cur + 1) % s.players.length;
    s.turn++;
    s.rolled = false; s.devPlayed = false; s.tradesThisTurn = 0; s.turnActions = 0;
    return null;
  },
};

/* ---------- actions légales ---------- */

// Renvoie des « gabarits » d'actions : type + cibles possibles. Les paramètres libres (défausse,
// contenu d'un échange, ressources choisies) sont décrits, pas énumérés.
export function legalActions(s, pi) {
  if (s.phase === 'over') return [];
  const out = [], p = s.players[pi], pend = s.pending;
  if (s.trade && s.trade.to.includes(pi)) out.push({ type: 'respondTrade', canAccept: canAfford(p.res, s.trade.get) });
  if (s.phase === 'setup') {
    if (s.cur !== pi) return out;
    if (s.setup.step === 'settle') out.push({ type: 'build', what: 'settle', targets: validSettle(s, pi, true) });
    else out.push({ type: 'build', what: 'road', targets: TOPO.verts[s.setup.last].edges.filter((e) => s.edges[e] === null) });
    return out;
  }
  if (pend?.type === 'discard') { if (pend.need[pi] !== undefined) out.push({ type: 'discard', count: pend.need[pi] }); return out; }
  if (pend?.type === 'robber') { if (pend.p === pi) out.push({ type: 'moveRobber', targets: s.hexes.map((_, i) => i).filter((i) => i !== s.robber) }); return out; }
  if (pend?.type === 'steal') { if (pend.p === pi) out.push({ type: 'steal', targets: [...pend.victims] }); return out; }
  if (pend?.type === 'roads') { if (pend.p === pi) out.push({ type: 'build', what: 'road', free: true, targets: validRoad(s, pi) }); return out; }
  if (s.cur !== pi) return out;
  if (!s.devPlayed) {
    const kinds = [...new Set(playableDev(s, pi).map((c) => c.t))];
    kinds.forEach((t) => out.push({ type: 'playDev', card: t }));
  }
  if (!s.rolled) { out.push({ type: 'roll' }); return out; }
  if (s.trade?.from === pi) {
    const ok = Object.entries(s.trade.resp).filter(([, r]) => r.s !== 'refuse').map(([k]) => +k);
    if (ok.length) out.push({ type: 'concludeTrade', targets: ok });
    out.push({ type: 'cancelTrade' });
  }
  const B = [['road', COST.road, p.roads > 0 && validRoad(s, pi)], ['settle', COST.settle, p.settles > 0 && validSettle(s, pi, false)], ['city', COST.city, p.cities > 0 && validCity(s, pi)]];
  B.forEach(([what, c, t]) => { if (t && t.length && canAfford(p.res, c)) out.push({ type: 'build', what, targets: t }); });
  if (s.deck.length && canAfford(p.res, COST.dev)) out.push({ type: 'buyDev' });
  RES.forEach((give) => { const n = rate(s, pi, give); if (p.res[give] >= n) out.push({ type: 'bankTrade', give, rate: n }); });
  if (!s.trade && total(p.res) > 0) out.push({ type: 'proposeTrade' });
  out.push({ type: 'endTurn' });
  return out;
}

/* ---------- vue filtrée ---------- */

// Masque la main et les cartes Événement des autres, la pioche et la graine.
// playerId = null : spectateur. À la fin de partie, tout est révélé.
export function viewFor(s, pi) {
  const over = s.phase === 'over';
  const v = structuredClone(s);
  delete v.seed; delete v.rng;
  v.deck = s.deck.length;
  v.me = pi;
  v.waiting = waitingFor(s);
  v.players = s.players.map((p, i) => {
    const mine = i === pi || over;
    return {
      name: p.name, ai: p.ai, knights: p.knights, roads: p.roads, settles: p.settles, cities: p.cities, offersOn: p.offersOn,
      nres: total(p.res), ndev: p.dev.length,
      res: mine ? { ...p.res } : null,
      dev: mine ? p.dev.map((c) => ({ ...c })) : null,
      vp: vp(s, i, mine),
      road: roadLen(s, i),
    };
  });
  v.log = s.log.map((e) => {
    const c = { ...e };
    if (over) return c;
    if (e.k === 'steal' && e.p !== pi && e.v !== pi) delete c.r;
    if (e.k === 'buyDev' && e.p !== pi) delete c.t;
    if (e.k === 'discard' && e.p !== pi) delete c.res;
    return c;
  });
  return v;
}
