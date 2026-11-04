// Moteur de règles de Brassins : pur, sans DOM, sans horloge. Tout l'état est sérialisable en JSON.
//
//   createGame(options)                  → état initial
//   applyAction(state, playerId, action) → { ok: true, state } | { ok: false, error }
//   legalActions(state, playerId)        → actions possibles (avec leurs cibles)
//   waitingFor(state)                    → joueurs dont on attend une décision
//   deciders(state)                      → ceux dont la décision fait avancer la partie (sans les réponses d'échange)
//   viewFor(state, playerId)             → état filtré pour ce joueur
//
// `applyAction` ne modifie jamais l'état reçu : il travaille sur une copie.
//
// Une partie : 3 ans de 4 saisons. À chaque saison, les terroirs produisent, les brassins finis
// arrivent en stock, l'événement de la carte s'applique, puis chacun joue son tour (acheter, brasser,
// livrer, vendre, améliorer, négocier). Le moins réputé joue en premier.

import {
  SAISONS, NB_SAISONS, RES, STYLES, FONCES, ITEMS, RECETTES, REP_PREMIERE, PRODUCTION, PRODUIT, PUITS, LABO_LEV, LABO_HOUB,
  LEV_REPIQUAGE, ACHAT, PRIX_PLANCHER, PRIX_REMONTEE, DEMANDE_BONUS, DEMANDE_REP, CLIENTS, FOIRES, TOURNEE_COUT, TOURNEE_COUT_CAMION,
  TOURNEE_GRATUITE_DIST, LIVRAISON_PAR_CLIENT, LIVRAISON_CAMION, FERMENTEURS_DEPART, FERMENTEURS_MAX, CUVE, STOCK_MAX, TOURAILLE_MALT,
  TOURAILLE_PAR_SAISON, SALLE_UNITES, SALLE_BONUS, SALLE_REP_HIVER, AMELIORATIONS, DEPART, CARTES, CARTE, CONCOURS, DOUANES_PAR, FETE_MULT,
  DIVERSITE, ARGENT_PAR_POINT, MARCHE_STOCK, COLLAB_UNITE_BONUS, COLLAB_REP, COLLAB_PAR_SAISON, Z, ZS, ZI, total,
} from './constantes.js';
import { hashSeed, int, next, shuffle } from './alea.js';
import { TOPO, rollBoard, distClient } from './plateau.js';

export const VERSION = 2;

/* ---------- création ---------- */

// players : [{ name, ai }] (2 à 4 places). opts : aiOffersToHumans, niveau ('apprenti' | 'compagnon' | 'maitre').
export function createGame({ seed = Date.now(), players, aiOffersToHumans = true, niveau = 'compagnon' } = {}) {
  if (!Array.isArray(players) || players.length < 2 || players.length > 4) throw new Error('Il faut de 2 à 4 places.');
  const s = { rng: hashSeed(seed) };
  const board = rollBoard(s);
  const n = players.length;
  const first = int(s, n);
  const ordre0 = players.map((_, i) => (first + i) % n);
  const state = {
    v: VERSION,
    seed: String(seed),
    rng: s.rng,
    seq: 0,
    opts: { aiOffersToHumans, niveau },
    tiles: board.tiles,
    villages: board.villages,
    prefs: board.prefs,
    deck: Object.fromEntries(SAISONS.map((k) => [k, shuffle(s, CARTES[k].map((c) => c.id))])),
    saison: -1, carte: null, demande: [], capa: {},
    marche: Object.fromEntries(STYLES.map((st) => [st, RECETTES[st].prix])),
    stockMarche: Z(),
    players: players.map((p) => ({
      name: p.name, ai: !!p.ai, hex: null,
      res: { ...DEPART.res }, argent: DEPART.argent,
      nferm: FERMENTEURS_DEPART, ferms: [], cuve: 0, stock: ZS(), upg: [], tournees: [],
      rep: 0, styles: [], livr: {}, torr: 0, salle: 0, collabs: 0, offersOn: true,
    })),
    phase: 'setup',
    setup: { k: 0, step: 'hex', ordre: [...ordre0].reverse() },
    ordre: ordre0,
    cur: 0, idx: 0, turn: 0,
    pending: null, trade: null, tradeSeq: 0, tradesThisTurn: 0, turnActions: 0,
    winner: null, scores: null,
    log: [],
  };
  state.rng = s.rng;
  state.cur = state.setup.ordre[0];
  log(state, { k: 'start' });
  return state;
}

/* ---------- lectures ---------- */

export const saisonIdx = (s) => (s.saison < 0 ? 0 : s.saison % 4);
export const annee = (s) => Math.floor(Math.max(0, s.saison) / 4);
export const carteCourante = (s) => (s.carte ? CARTE[s.carte] : null);
export const unites = (p) => total(p.stock);
export const cuveUnites = (p) => CUVE[p.cuve];
export const a = (p, u) => p.upg.includes(u);
export const clientIds = (s) => ['bar', 'cave', ...s.villages.map((_, k) => `village${k}`), ...FOIRES.map((f) => f.id)];
export const clientKind = (id) => (id === 'bar' || id === 'cave' ? id : id.startsWith('village') ? 'village' : 'foire');
export function clientPos(s, id) {
  if (id.startsWith('foire')) return id;
  if (id.startsWith('village')) return s.villages[+id.slice(7)];
  return TOPO.centre;
}
export const distance = (s, pi, client) => distClient(s.players[pi].hex, clientPos(s, client));
export const coutTournee = (s, pi, client) => distance(s, pi, client) * (a(s.players[pi], 'camion') ? TOURNEE_COUT_CAMION : TOURNEE_COUT);
export const limiteLivraison = (p) => (a(p, 'camion') ? LIVRAISON_CAMION : LIVRAISON_PAR_CLIENT);
export const enDemande = (s, st) => s.demande.includes(st);
export const prixMarche = (s, st) => s.marche[st] + (enDemande(s, st) ? DEMANDE_BONUS : 0);

// Ce qu'une livraison rapporterait : { argent, rep } ou null si ce client ne prend pas ce style maintenant
export function valeurLivraison(s, client, st) {
  const kind = clientKind(client), r = RECETTES[st];
  let argent = r.prix, rep = r.rep + (enDemande(s, st) ? DEMANDE_REP : 0);
  if (kind === 'bar') argent += CLIENTS.bar.bonus;
  else if (kind === 'cave') { if (!FONCES.includes(st)) return null; argent += CLIENTS.cave.bonus; }
  else if (kind === 'village') {
    const prefs = s.prefs[+client.slice(7)];
    if (prefs.includes(st)) argent += CLIENTS.village.bonus; else { argent += CLIENTS.village.malus; rep = 0; }
  } else {
    const f = FOIRES[+client.slice(5)];
    if (f.saison !== saisonIdx(s)) return null;
    argent += CLIENTS.foire.bonus; rep += CLIENTS.foire.rep;
  }
  return { argent, rep };
}

export const peutBrasser = (s, p, st) => {
  const r = RECETTES[st];
  if (r.exige && !a(p, r.exige)) return false;
  return RES.every((x) => p.res[x] >= r[x]);
};
// Collab : le joueur peut-il encore en faire une cette saison ?
export const collabLibre = (p) => (p.collabs ?? 0) < COLLAB_PAR_SAISON;
// Ce qui est en vente au Marché cette saison
export const stockMarche = (s, r) => s.stockMarche?.[r] ?? 0;
export const coutRecette = (st) => { const r = RECETTES[st], c = Z(); RES.forEach((x) => { c[x] = r[x]; }); return c; };

export function ameliorationsPossibles(s, p) {
  return Object.entries(AMELIORATIONS).filter(([u, d]) => {
    if (u === 'ferm') return p.nferm < FERMENTEURS_MAX;
    if (a(p, u)) return false;
    if (d.exige && !a(p, d.exige)) return false;
    return true;
  }).map(([u]) => u);
}

// Styles différents brassés → points de diversité
export const pointsDiversite = (n) => Object.entries(DIVERSITE).reduce((b, [k, v]) => (n >= +k ? v : b), 0);
export function score(s, pi) {
  const p = s.players[pi];
  const div = pointsDiversite(p.styles.length), arg = Math.floor(p.argent / ARGENT_PAR_POINT);
  return { rep: p.rep, diversite: div, argent: arg, total: p.rep + div + arg };
}

// Tout ce qu'un joueur possède, à plat (pour les échanges)
export function avoirs(p) {
  const o = ZI();
  RES.forEach((r) => { o[r] = p.res[r]; });
  STYLES.forEach((st) => { o[st] = p.stock[st]; });
  o.argent = p.argent;
  return o;
}
const possede = (p, items) => ITEMS.every((k) => avoirs(p)[k] >= (items[k] ?? 0));
function donner(from, to, items) {
  for (const k of ITEMS) {
    const n = items[k] ?? 0;
    if (!n) continue;
    if (RES.includes(k)) { from.res[k] -= n; to.res[k] += n; }
    else if (STYLES.includes(k)) { from.stock[k] -= n; to.stock[k] += n; }
    else { from.argent -= n; to.argent += n; }
  }
}

export function waitingFor(s) {
  if (s.phase === 'over') return [];
  const out = new Set();
  if (s.pending) Object.keys(s.pending.need).forEach((k) => out.add(+k));
  else out.add(s.cur);
  if (s.trade) s.trade.to.forEach((k) => { if (!s.trade.resp[k]) out.add(k); });
  return [...out].sort((x, y) => x - y);
}
export function deciders(s) {
  if (s.phase === 'over') return [];
  if (s.pending) return Object.keys(s.pending.need).map(Number);
  return [s.cur];
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
  return { ok: true, state: s };
}

function log(s, ev) {
  for (const k of Object.keys(ev)) if (ev[k] === undefined) delete ev[k];
  s.log.push({ i: (s.log.at(-1)?.i ?? -1) + 1, turn: s.turn, saison: s.saison, ...ev });
  if (s.log.length > 160) s.log.shift();
}

const readInt = (n, max = 99) => (Number.isInteger(n) && n >= 1 && n <= max ? n : null);
function readItems(o) {
  if (!o || typeof o !== 'object') return null;
  const c = ZI();
  for (const k of Object.keys(o)) {
    if (!ITEMS.includes(k)) return null;
    const n = o[k] ?? 0;
    if (!Number.isInteger(n) || n < 0) return null;
    c[k] = n;
  }
  return c;
}

function readRes(o) {
  if (!o || typeof o !== 'object') return null;
  const c = Z();
  for (const k of Object.keys(o)) {
    if (!RES.includes(k)) return null;
    const n = o[k] ?? 0;
    if (!Number.isInteger(n) || n < 0) return null;
    c[k] = n;
  }
  return c;
}
const aLesMatieres = (p, c) => RES.every((x) => p.res[x] >= c[x]);

// Répartition d'une recette de collab : hôte + partenaire = la recette, chacun apporte au moins une matière
export function lireApport(style, apport) {
  const H = readRes(apport?.hote), P = readRes(apport?.part);
  if (!H || !P) return { error: 'Répartition illisible.' };
  const r = RECETTES[style];
  if (RES.some((x) => H[x] + P[x] !== r[x])) return { error: 'La répartition doit couvrir exactement la recette.' };
  if (!total(H) || !total(P)) return { error: 'Chacun apporte au moins une matière.' };
  return { hote: H, part: P };
}
// Répartition par défaut : l'hôte apporte ce qu'il a, le partenaire complète (au moins une matière chacun).
// null si le partenaire n'a pas de quoi compléter.
export function apportParDefaut(s, hote, w, style) {
  const r = RECETTES[style], H = s.players[hote], P = s.players[w];
  const h = Z(), part = Z();
  RES.forEach((x) => { h[x] = Math.min(r[x], H.res[x]); part[x] = r[x] - h[x]; });
  if (!total(part)) {
    const x = RES.filter((y) => h[y] > 0 && P.res[y] > 0).sort((y, z) => P.res[z] - P.res[y])[0];
    if (!x) return null;
    h[x]--; part[x]++;
  }
  if (!total(h) || RES.some((x) => P.res[x] < part[x])) return null;
  return { hote: h, part };
}

// La collab peut-elle se brasser chez l'hôte maintenant ? Renvoie la raison sinon.
function collabImpossible(s, hote, w, style) {
  const H = s.players[hote], P = s.players[w], r = RECETTES[style];
  if (H.ferms.length >= H.nferm) return `${H.name} n'a plus de fermenteur libre.`;
  if (r.exige && !a(H, r.exige)) return `Ce style demande : ${AMELIORATIONS[r.exige].nom}, chez celui qui prête le fermenteur.`;
  if (!collabLibre(H)) return `${H.name} a déjà fait une collab cette saison.`;
  if (!collabLibre(P)) return `${P.name} a déjà fait une collab cette saison.`;
  return null;
}

/* ---------- saisons ---------- */

function ordreSaison(s) {
  // Le moins réputé commence ; égalité : le moins d'Argent, puis le hasard. Puis on tourne à gauche.
  const n = s.players.length;
  const cle = s.players.map((p, i) => [p.rep, p.argent, next(s), i]);
  cle.sort((x, y) => x[0] - y[0] || x[1] - y[1] || x[2] - y[2]);
  const first = cle[0][3];
  return s.players.map((_, i) => (first + i) % n);
}

function startSaison(s) {
  s.saison++;
  const si = saisonIdx(s), an = annee(s), nom = SAISONS[si];
  const carte = CARTE[s.deck[nom][an]];
  s.carte = carte.id;
  s.demande = [...carte.demande];
  s.pending = null; s.trade = null;
  // Le Marché se réapprovisionne : ce qui n'a pas été acheté disparaît
  s.stockMarche = { ...MARCHE_STOCK[s.players.length] };
  // Capacités des clients
  s.capa = {};
  for (const id of clientIds(s)) {
    const kind = clientKind(id);
    if (kind === 'foire') s.capa[id] = FOIRES[+id.slice(5)].saison === si ? CLIENTS.foire.cap : 0;
    else if (kind === 'village') s.capa[id] = CLIENTS.village.cap * (carte.evt === 'fete' ? FETE_MULT : 1);
    else s.capa[id] = CLIENTS[kind].cap;
  }
  // Production, brassins terminés
  const gains = [], finis = [];
  s.players.forEach((p, i) => {
    p.livr = {}; p.torr = 0; p.salle = 0; p.collabs = 0;
    const g = Z();
    for (const h of [p.hex, ...TOPO.hexes[p.hex].near]) {
      const t = s.tiles[h];
      if (!PRODUCTION[t]) continue;
      const m = carte.meteo?.[t];
      const q = m === 'zero' ? 0 : Math.max(0, PRODUCTION[t][si] + (m ?? 0));
      g[PRODUIT[t]] += q;
    }
    g.eau += PUITS;
    if (a(p, 'labo')) { g.lev += LABO_LEV; g.houb += LABO_HOUB; }
    RES.forEach((r) => { p.res[r] += g[r]; });
    gains.push({ p: i, res: g });
    const done = p.ferms.filter((f) => f.left <= 0);
    p.ferms = p.ferms.filter((f) => f.left > 0);
    for (const f of done) {
      p.res.lev += LEV_REPIQUAGE;
      if (f.collab === undefined) { p.stock[f.st] += f.u; finis.push({ p: i, st: f.st, u: f.u }); continue; }
      // Collab : partage en deux, l'unité impaire à l'hôte ; la part du partenaire arrive dans son stock
      const part = Math.floor(f.u / 2);
      p.stock[f.st] += f.u - part;
      s.players[f.collab].stock[f.st] += part;
      finis.push({ p: i, st: f.st, u: f.u - part, collab: f.collab, part });
    }
  });
  log(s, { k: 'saison', carte: carte.id, gains, finis });
  // Événement
  if (carte.evt === 'douanes') {
    const paie = s.players.map((p, i) => { const n = Math.min(p.argent, Math.floor(unites(p) / DOUANES_PAR)); p.argent -= n; return { p: i, n }; });
    log(s, { k: 'douanes', paie });
  } else if (carte.evt === 'fete') {
    log(s, { k: 'fete' });
  } else if (carte.evt === 'contamination' || carte.evt === 'canicule') {
    const protege = carte.evt === 'contamination' ? 'labo' : 'froide';
    const need = {};
    s.players.forEach((p, i) => { if (!a(p, protege) && p.ferms.some((f) => f.u > 0)) need[i] = true; });
    log(s, { k: 'evenement', evt: carte.evt, touches: Object.keys(need).map(Number) });
    if (Object.keys(need).length) s.pending = { type: 'saison', kind: carte.evt, need, resp: {} };
  } else if (carte.evt === 'concours') {
    const need = {};
    s.players.forEach((p, i) => { if (unites(p) > 0) need[i] = true; });
    log(s, { k: 'evenement', evt: 'concours', touches: Object.keys(need).map(Number) });
    if (Object.keys(need).length) s.pending = { type: 'saison', kind: 'concours', need, resp: {} };
  }
  if (!s.pending) beginTurns(s);
}

function beginTurns(s) {
  s.ordre = s.saison === 0 ? s.ordre : ordreSaison(s);
  s.idx = 0;
  s.cur = s.ordre[0];
  s.turn++;
  s.tradesThisTurn = 0; s.turnActions = 0;
  log(s, { k: 'ordre', ordre: [...s.ordre] });
}

function resoudreConcours(s) {
  const pend = s.pending;
  const notes = Object.entries(pend.resp).map(([k, st]) => ({ p: +k, st, n: RECETTES[st].rep + (enDemande(s, st) ? DEMANDE_REP : 0) }));
  const vals = [...new Set(notes.map((x) => x.n))].sort((x, y) => y - x);
  const gains = notes.map((x) => ({ ...x, rep: x.n === vals[0] ? CONCOURS[0] : vals.length > 1 && x.n === vals[1] ? CONCOURS[1] : 0 }));
  gains.forEach((g) => { s.players[g.p].rep += g.rep; });
  log(s, { k: 'concours', gains });
}

function endSaison(s) {
  s.players.forEach((p, i) => {
    p.ferms.forEach((f) => { f.left--; });
    if (a(p, 'salle') && saisonIdx(s) === 3) { p.rep += SALLE_REP_HIVER; log(s, { k: 'salleRep', p: i, n: SALLE_REP_HIVER }); }
  });
  STYLES.forEach((st) => { s.marche[st] = Math.min(RECETTES[st].prix, s.marche[st] + PRIX_REMONTEE); });
  if (s.saison + 1 >= NB_SAISONS) return finir(s);
  startSaison(s);
}

function finir(s) {
  s.phase = 'over';
  s.pending = null; s.trade = null;
  s.scores = s.players.map((_, i) => score(s, i));
  const cle = (i) => [s.scores[i].total, s.players[i].argent, unites(s.players[i])];
  const ordre = s.players.map((_, i) => i).sort((x, y) => { const cx = cle(x), cy = cle(y); return cy[0] - cx[0] || cy[1] - cx[1] || cy[2] - cx[2]; });
  s.winner = ordre[0];
  log(s, { k: 'fin', p: s.winner, scores: s.scores.map((x) => x.total) });
}

/* ---------- actions ---------- */

function monTour(s, pi) {
  if (s.phase === 'setup') return 'Pas encore : la mise en place est en cours.';
  if (s.pending) return 'Une décision est en attente.';
  if (s.cur !== pi) return "Ce n'est pas ton tour.";
  return null;
}
function endTradeIfAny(s, why) {
  if (!s.trade) return;
  log(s, { k: 'tradeClosed', p: s.trade.from, why });
  s.trade = null;
}

function conclureCollab(s, pi, w, r) {
  const t = s.trade, ap = r.s === 'counter' ? r.apport : t.apport;
  const H = s.players[pi], P = s.players[w];
  const why = collabImpossible(s, pi, w, t.style);
  if (why) return why;
  if (!aLesMatieres(H, ap.hote)) return "Tu n'as plus les matières que tu apportais.";
  if (!aLesMatieres(P, ap.part)) {
    t.resp[w] = { s: 'refuse' };
    log(s, { k: 'tradeResp', p: w, from: t.from, s: 'refuse', collab: t.style, lacking: true });
    return null;
  }
  RES.forEach((x) => { H.res[x] -= ap.hote[x]; P.res[x] -= ap.part[x]; });
  const rec = RECETTES[t.style], u = cuveUnites(H) + COLLAB_UNITE_BONUS;
  H.ferms.push({ st: t.style, left: rec.ferm, u, collab: w });
  const premiere = [];
  for (const [i, q] of [[pi, H], [w, P]]) {
    q.rep += COLLAB_REP;
    q.collabs = (q.collabs ?? 0) + 1;
    if (!q.styles.includes(t.style)) { q.styles.push(t.style); q.rep += REP_PREMIERE; premiere.push(i); }
  }
  s.trade = null;
  log(s, { k: 'collab', p: pi, with: w, style: t.style, u, ferm: rec.ferm, apport: ap, premiere });
  return null;
}

const HANDLERS = {
  placer(s, pi, { hex }) {
    if (s.phase !== 'setup' || s.setup.step !== 'hex') return 'Les brasseries sont déjà placées.';
    if (s.cur !== pi) return "Ce n'est pas ton tour.";
    if (!Number.isInteger(hex) || hex < 0 || hex >= s.tiles.length) return 'Case inconnue.';
    if (!PRODUCTION[s.tiles[hex]]) return 'Une brasserie se pose sur un terroir.';
    if (s.players.some((p) => p.hex === hex)) return 'Cette case est déjà prise.';
    s.players[pi].hex = hex;
    log(s, { k: 'placer', p: pi, hex });
    s.setup.step = 'tournee';
    return null;
  },

  tournee(s, pi, { client }) {
    if (typeof client !== 'string' || !clientIds(s).includes(client)) return 'Client inconnu.';
    const p = s.players[pi];
    if (p.tournees.includes(client)) return 'Cette tournée est déjà ouverte.';
    if (s.phase === 'setup') {
      if (s.setup.step !== 'tournee' || s.cur !== pi) return "Ce n'est pas à toi d'ouvrir une tournée.";
      if (distance(s, pi, client) > TOURNEE_GRATUITE_DIST) return `La tournée gratuite va à un client à ${TOURNEE_GRATUITE_DIST} cases ou moins.`;
      p.tournees.push(client);
      log(s, { k: 'tournee', p: pi, client, cout: 0 });
      const k = s.setup.k + 1;
      if (k >= s.players.length) { s.phase = 'main'; s.setup = null; startSaison(s); }
      else { s.setup.k = k; s.setup.step = 'hex'; s.cur = s.setup.ordre[k]; }
      return null;
    }
    const g = monTour(s, pi);
    if (g) return g;
    const cout = coutTournee(s, pi, client);
    if (p.argent < cout) return `Il te faut ${cout} Argent pour cette tournée.`;
    p.argent -= cout;
    p.tournees.push(client);
    log(s, { k: 'tournee', p: pi, client, cout });
    return null;
  },

  acheter(s, pi, { r, n = 1 }) {
    const g = monTour(s, pi);
    if (g) return g;
    if (!RES.includes(r)) return 'Matière inconnue.';
    n = readInt(n, 20);
    if (!n) return 'Quantité illisible.';
    const p = s.players[pi], cout = ACHAT[r] * n, dispo = stockMarche(s, r);
    if (dispo < n) return dispo ? `Le Marché n'a plus que ${dispo} ${r === 'torr' ? 'Malt torréfié' : { malt: 'Malt', houb: 'Houblon', lev: 'Levure', eau: 'Eau' }[r]} cette saison.` : 'Le Marché n’en a plus cette saison.';
    if (p.argent < cout) return `Il te faut ${cout} Argent.`;
    p.argent -= cout; p.res[r] += n; s.stockMarche[r] -= n;
    log(s, { k: 'acheter', p: pi, r, n, cout });
    return null;
  },

  vendre(s, pi, { style, n = 1 }) {
    const g = monTour(s, pi);
    if (g) return g;
    if (!STYLES.includes(style)) return 'Style inconnu.';
    n = readInt(n, 40);
    if (!n) return 'Quantité illisible.';
    const p = s.players[pi];
    if (p.stock[style] < n) return "Tu n'as pas autant d'unités de ce style.";
    let gain = 0;
    for (let k = 0; k < n; k++) {
      gain += prixMarche(s, style);
      s.marche[style] = Math.max(PRIX_PLANCHER, s.marche[style] - 1);
    }
    p.stock[style] -= n; p.argent += gain;
    log(s, { k: 'vendre', p: pi, style, n, gain });
    return null;
  },

  brasser(s, pi, { style }) {
    const g = monTour(s, pi);
    if (g) return g;
    if (!STYLES.includes(style)) return 'Style inconnu.';
    const p = s.players[pi], r = RECETTES[style];
    if (p.ferms.length >= p.nferm) return 'Tous tes fermenteurs sont occupés.';
    if (r.exige && !a(p, r.exige)) return `Ce style demande : ${AMELIORATIONS[r.exige].nom}.`;
    if (!peutBrasser(s, p, style)) return 'Il te manque des matières pour cette recette.';
    RES.forEach((x) => { p.res[x] -= r[x]; });
    const u = cuveUnites(p);
    p.ferms.push({ st: style, left: r.ferm, u });
    let premiere = false;
    if (!p.styles.includes(style)) { p.styles.push(style); p.rep += REP_PREMIERE; premiere = true; }
    log(s, { k: 'brasser', p: pi, style, u, ferm: r.ferm, premiere });
    return null;
  },

  torrefier(s, pi) {
    const g = monTour(s, pi);
    if (g) return g;
    const p = s.players[pi];
    if (!a(p, 'touraille')) return "Il te faut une Touraille.";
    if (p.torr >= TOURAILLE_PAR_SAISON) return 'La Touraille a déjà servi cette saison.';
    if (p.res.malt < TOURAILLE_MALT) return `Il te faut ${TOURAILLE_MALT} Malt.`;
    p.res.malt -= TOURAILLE_MALT; p.res.torr += 1; p.torr++;
    log(s, { k: 'torrefier', p: pi });
    return null;
  },

  livrer(s, pi, { client, style }) {
    const g = monTour(s, pi);
    if (g) return g;
    if (typeof client !== 'string' || !clientIds(s).includes(client)) return 'Client inconnu.';
    if (!STYLES.includes(style)) return 'Style inconnu.';
    const p = s.players[pi];
    if (!p.tournees.includes(client)) return "Tu n'as pas de tournée vers ce client.";
    if (p.stock[style] < 1) return "Tu n'as pas ce style en stock.";
    if (!(s.capa[client] > 0)) return "Ce client n'achète plus cette saison.";
    if ((p.livr[client] ?? 0) >= limiteLivraison(p)) return 'Tu as déjà livré ce client cette saison.';
    const v = valeurLivraison(s, client, style);
    if (!v) return "Ce client ne prend pas ce style.";
    p.stock[style]--; s.capa[client]--; p.livr[client] = (p.livr[client] ?? 0) + 1;
    p.argent += v.argent; p.rep += v.rep;
    log(s, { k: 'livrer', p: pi, client, style, argent: v.argent, rep: v.rep });
    return null;
  },

  ameliorer(s, pi, { u }) {
    const g = monTour(s, pi);
    if (g) return g;
    const d = AMELIORATIONS[u];
    if (!d) return 'Amélioration inconnue.';
    const p = s.players[pi];
    if (!ameliorationsPossibles(s, p).includes(u)) return u === 'ferm' ? 'Tu as déjà 5 fermenteurs.' : d.exige && !a(p, d.exige) ? `Il faut d'abord : ${AMELIORATIONS[d.exige].nom}.` : 'Tu as déjà cette amélioration.';
    if (p.argent < d.cout) return `Il te faut ${d.cout} Argent.`;
    p.argent -= d.cout;
    if (u === 'ferm') p.nferm++;
    else {
      p.upg.push(u);
      if (u === 'cuve2') p.cuve = 1;
      if (u === 'cuve3') p.cuve = 2;
    }
    log(s, { k: 'ameliorer', p: pi, u });
    return null;
  },

  salle(s, pi, { style }) {
    const g = monTour(s, pi);
    if (g) return g;
    const p = s.players[pi];
    if (!a(p, 'salle')) return "Il te faut une Salle de dégustation.";
    if (p.salle >= SALLE_UNITES) return 'La Salle a déjà vendu sa part cette saison.';
    if (!STYLES.includes(style) || p.stock[style] < 1) return "Tu n'as pas ce style en stock.";
    const gain = RECETTES[style].prix + SALLE_BONUS;
    p.stock[style]--; p.salle++; p.argent += gain;
    log(s, { k: 'salle', p: pi, style, gain });
    return null;
  },

  // Contamination ou canicule : choisir le brassin qui perd 1 unité
  evenement(s, pi, { ferm }) {
    const pend = s.pending;
    if (pend?.type !== 'saison' || !['contamination', 'canicule'].includes(pend.kind) || !pend.need[pi]) return "Tu n'as rien à décider.";
    const p = s.players[pi];
    if (!Number.isInteger(ferm) || !p.ferms[ferm] || p.ferms[ferm].u <= 0) return 'Choisis un de tes brassins en cours.';
    p.ferms[ferm].u--;
    log(s, { k: 'perte', p: pi, evt: pend.kind, style: p.ferms[ferm].st });
    delete pend.need[pi];
    if (!Object.keys(pend.need).length) { s.pending = null; beginTurns(s); }
    return null;
  },

  concours(s, pi, { style }) {
    const pend = s.pending;
    if (pend?.type !== 'saison' || pend.kind !== 'concours' || !pend.need[pi]) return "Tu n'as rien à présenter.";
    const p = s.players[pi];
    if (!STYLES.includes(style) || p.stock[style] < 1) return 'Présente un style que tu as en stock.';
    p.stock[style]--;
    pend.resp[pi] = style;
    log(s, { k: 'presente', p: pi, style });
    delete pend.need[pi];
    if (!Object.keys(pend.need).length) { resoudreConcours(s); s.pending = null; beginTurns(s); }
    return null;
  },

  // Collab : une bière brassée à deux dans un fermenteur du proposant ; l'autre accepte, refuse ou contre-propose
  proposeCollab(s, pi, { style, with: w, apport }) {
    const g = monTour(s, pi);
    if (g) return g;
    if (s.trade) return 'Une offre est déjà ouverte.';
    if (!STYLES.includes(style)) return 'Style inconnu.';
    if (!Number.isInteger(w) || w === pi || !s.players[w]) return 'Choisis une brasserie partenaire.';
    if (!s.players[w].offersOn) return `${s.players[w].name} ne reçoit pas de propositions.`;
    const why = collabImpossible(s, pi, w, style);
    if (why) return why;
    const ap = lireApport(style, apport);
    if (ap.error) return ap.error;
    if (!aLesMatieres(s.players[pi], ap.hote)) return "Tu n'as pas les matières que tu apportes.";
    s.trade = { id: ++s.tradeSeq, kind: 'collab', from: pi, to: [w], style, apport: ap, resp: {} };
    s.tradesThisTurn++;
    log(s, { k: 'collabOffer', p: pi, with: w, style, apport: ap });
    return null;
  },

  proposeTrade(s, pi, { give, get, to }) {
    const g = monTour(s, pi);
    if (g) return g;
    if (s.trade) return 'Une offre est déjà ouverte.';
    const G = readItems(give), W = readItems(get);
    if (!G || !W || !total(G) || !total(W)) return 'Indique ce que tu donnes et ce que tu demandes.';
    if (ITEMS.some((k) => G[k] && W[k])) return 'Tu ne peux pas donner et demander la même chose.';
    if (!possede(s.players[pi], G)) return "Tu n'as pas ce que tu proposes.";
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
    if (t.kind === 'collab') {
      const p = s.players[pi];
      if (counter) {
        const ap = lireApport(t.style, counter.apport);
        if (ap.error) return ap.error;
        if (!aLesMatieres(p, ap.part)) return "Tu n'as pas les matières que tu apportes.";
        if (!collabLibre(p)) return 'Tu as déjà fait une collab cette saison.';
        t.resp[pi] = { s: 'counter', apport: ap };
      } else if (accept) {
        if (!aLesMatieres(p, t.apport.part)) return "Tu n'as pas les matières demandées.";
        if (!collabLibre(p)) return 'Tu as déjà fait une collab cette saison.';
        t.resp[pi] = { s: 'accept' };
      } else t.resp[pi] = { s: 'refuse' };
      log(s, { k: 'tradeResp', p: pi, from: t.from, s: t.resp[pi].s, collab: t.style, apport: t.resp[pi].apport });
      return null;
    }
    if (counter) {
      const G = readItems(counter.give), W = readItems(counter.get);
      if (!G || !W || !total(G) || !total(W)) return 'Contre-proposition illisible.';
      if (!possede(s.players[pi], W)) return "Tu n'as pas ce que demande ta contre-proposition.";
      t.resp[pi] = { s: 'counter', give: G, get: W };
    } else if (accept) {
      if (!possede(s.players[pi], t.get)) return "Tu n'as pas ce qui est demandé.";
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
    if (t.kind === 'collab') return conclureCollab(s, pi, w, r);
    const give = r.s === 'counter' ? r.give : t.give, get = r.s === 'counter' ? r.get : t.get;
    const A = s.players[pi], B = s.players[w];
    if (!possede(A, give)) return "Tu n'as plus ce que tu proposais.";
    if (!possede(B, get)) {
      t.resp[w] = { s: 'refuse' };
      log(s, { k: 'tradeResp', p: w, from: t.from, s: 'refuse', lacking: true });
      return null;
    }
    donner(A, B, give);
    donner(B, A, get);
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
    const g = monTour(s, pi);
    if (g) return g;
    const p = s.players[pi];
    if (unites(p) > STOCK_MAX) return `Ton stock dépasse ${STOCK_MAX} unités : vends ou livre avant de passer.`;
    endTradeIfAny(s, 'end');
    log(s, { k: 'endTurn', p: pi });
    s.idx++;
    s.tradesThisTurn = 0; s.turnActions = 0;
    if (s.idx < s.players.length) { s.cur = s.ordre[s.idx]; s.turn++; return null; }
    endSaison(s);
    return null;
  },
};

/* ---------- actions légales ---------- */

// Gabarits d'actions : type + cibles possibles. Les quantités libres (achat, vente, échange) sont décrites, pas énumérées.
export function legalActions(s, pi) {
  if (s.phase === 'over') return [];
  const out = [], p = s.players[pi];
  if (s.trade && s.trade.to.includes(pi) && !s.trade.resp[pi]) {
    const t = s.trade;
    out.push({ type: 'respondTrade', kind: t.kind ?? 'echange', canAccept: t.kind === 'collab' ? aLesMatieres(p, t.apport.part) && collabLibre(p) : possede(p, t.get) });
  }
  if (s.phase === 'setup') {
    if (s.cur !== pi) return out;
    if (s.setup.step === 'hex') out.push({ type: 'placer', targets: s.tiles.map((t, i) => (PRODUCTION[t] && !s.players.some((q) => q.hex === i) ? i : -1)).filter((i) => i >= 0) });
    else out.push({ type: 'tournee', free: true, targets: clientIds(s).filter((c) => distance(s, pi, c) <= TOURNEE_GRATUITE_DIST).map((client) => ({ client, cout: 0 })) });
    return out;
  }
  const pend = s.pending;
  if (pend) {
    if (!pend.need[pi]) return out;
    if (pend.kind === 'concours') out.push({ type: 'concours', styles: STYLES.filter((st) => p.stock[st] > 0) });
    else out.push({ type: 'evenement', kind: pend.kind, targets: p.ferms.map((f, i) => (f.u > 0 ? i : -1)).filter((i) => i >= 0) });
    return out;
  }
  if (s.cur !== pi) return out;
  if (s.trade?.from === pi) {
    const ok = Object.entries(s.trade.resp).filter(([, r]) => r.s !== 'refuse').map(([k]) => +k);
    if (ok.length) out.push({ type: 'concludeTrade', targets: ok });
    out.push({ type: 'cancelTrade' });
  }
  const brassables = STYLES.filter((st) => peutBrasser(s, p, st));
  if (p.ferms.length < p.nferm && brassables.length) out.push({ type: 'brasser', styles: brassables });
  const achats = RES.filter((r) => p.argent >= ACHAT[r] && stockMarche(s, r) > 0);
  if (achats.length) out.push({ type: 'acheter', res: achats, stock: { ...s.stockMarche } });
  const enStock = STYLES.filter((st) => p.stock[st] > 0);
  if (enStock.length) out.push({ type: 'vendre', styles: enStock });
  const livr = [];
  for (const c of p.tournees) {
    if (!(s.capa[c] > 0) || (p.livr[c] ?? 0) >= limiteLivraison(p)) continue;
    const styles = enStock.filter((st) => valeurLivraison(s, c, st));
    if (styles.length) livr.push({ client: c, styles });
  }
  if (livr.length) out.push({ type: 'livrer', targets: livr });
  const tournees = clientIds(s).filter((c) => !p.tournees.includes(c)).map((client) => ({ client, cout: coutTournee(s, pi, client) })).filter((t) => t.cout <= p.argent);
  if (tournees.length) out.push({ type: 'tournee', targets: tournees });
  const am = ameliorationsPossibles(s, p).filter((u) => AMELIORATIONS[u].cout <= p.argent);
  if (am.length) out.push({ type: 'ameliorer', targets: am });
  if (a(p, 'touraille') && p.torr < TOURAILLE_PAR_SAISON && p.res.malt >= TOURAILLE_MALT) out.push({ type: 'torrefier' });
  if (a(p, 'salle') && p.salle < SALLE_UNITES && enStock.length) out.push({ type: 'salle', styles: enStock });
  if (!s.trade && total(avoirs(p)) > 0) out.push({ type: 'proposeTrade' });
  if (!s.trade && p.ferms.length < p.nferm && collabLibre(p)) {
    const partenaires = s.players.map((_, i) => i).filter((i) => i !== pi && s.players[i].offersOn && collabLibre(s.players[i]));
    const styles = STYLES.filter((st) => !RECETTES[st].exige || a(p, RECETTES[st].exige));
    if (partenaires.length) out.push({ type: 'proposeCollab', partenaires, styles });
  }
  if (unites(p) <= STOCK_MAX) out.push({ type: 'endTurn' });
  return out;
}

/* ---------- vue filtrée ---------- */

// Presque tout est public. On masque la graine, le générateur, et l'ordre des cartes restantes
// (on sait seulement lesquelles peuvent encore sortir).
export function viewFor(s, pi) {
  const v = structuredClone(s);
  delete v.seed; delete v.rng;
  const an = Math.max(0, annee(s)), si = s.saison;
  v.deck = Object.fromEntries(SAISONS.map((k, j) => {
    // cartes déjà révélées pour cette saison : celles des années passées, plus celle de cette année si la saison est passée ou en cours
    const revelees = s.deck[k].slice(0, an + (si >= 0 && j <= saisonIdx(s) ? 1 : 0));
    return [k, { revelees, restantes: s.deck[k].filter((id) => !revelees.includes(id)).sort() }];
  }));
  v.me = pi;
  v.waiting = waitingFor(s);
  v.players = s.players.map((p, i) => ({ ...p, score: score(s, i) }));
  return v;
}
