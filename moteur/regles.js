// Moteur de règles de Brassins (version table) : pur, sans DOM, sans horloge. Tout l'état est sérialisable en JSON.
//
//   createGame(options)                  → état initial
//   applyAction(state, playerId, action) → { ok: true, state } | { ok: false, error }
//   legalActions(state, playerId)        → actions possibles (avec leurs cibles)
//   waitingFor(state)                    → joueurs dont on attend une décision
//   deciders(state)                      → ceux dont la décision fait avancer la partie (sans les réponses d'échange)
//   viewFor(state, playerId)             → état filtré pour ce joueur
//
// Une saison : deux dés (météo, événement), les brassins mûrs sortent, l'événement s'applique, puis chacun
// pose ses ouvriers un par un (une pose = un tour de joueur : brasser librement, poser, passer la main).
// Fin de saison : fermentations, prix, file des clients, stock, les ouvriers reviennent.

import {
  SAISONS, NB_SAISONS, RES, STYLES, ITEMS, RECETTES, REP_PREMIERE, CUVE, DE_BRASSAGE, CASES, ACHAT, ACHAT_MAX, PRIX_PLANCHER, PRIX_PLAFOND,
  PRIX_REMONTEE, DEMANDE_BONUS, DEMANDE_REP, DEMANDE, FILE, FEST_REP, CRITIQUE_REP, CLIENTS, CLIENT_MAIRIE, METEO, EVENEMENTS, CONCOURS,
  DOUANES_PAR, OUVRIERS_DEPART, FERMENTEURS_DEPART, FERMENTEURS_MAX, OUVRIERS_MAX, STOCK_MAX, SALLE_BONUS, SALLE_REP_HIVER, AMELIORATIONS,
  DEPART, REP_DERNIER, DIVERSITE, ARGENT_PAR_POINT, Z, ZS, ZI, total,
} from './constantes.js';
import { hashSeed, int, shuffle } from './alea.js';

export const VERSION = 3;

/* ---------- création ---------- */

export function createGame({ seed = Date.now(), players, aiOffersToHumans = true, niveau = 'compagnon', ordre = 'rotation' } = {}) {
  if (!Array.isArray(players) || players.length < 2 || players.length > 4) throw new Error('Il faut de 2 à 4 places.');
  const n = players.length;
  const state = {
    v: VERSION,
    seed: String(seed),
    rng: hashSeed(seed),
    seq: 0,
    opts: { aiOffersToHumans, niveau, ordre },
    saison: -1, meteo: 0, de: 0, evt: null, demande: [], ferme: [], prixBonus: 0, critique: false, invite: false,
    deck: [], file: [], defausse: [],
    prix: Object.fromEntries(STYLES.map((st) => [st, RECETTES[st].prix])),
    players: players.map((p) => ({
      name: p.name, ai: !!p.ai,
      res: { ...DEPART.res }, argent: DEPART.argent,
      ouv: OUVRIERS_DEPART, nferm: FERMENTEURS_DEPART, ferms: [], cuve: 0, stock: ZS(), upg: [],
      rep: 0, styles: [], clients: [], salle: false, offersOn: true,
    })),
    phase: 'main',
    first: 0, cur: 0, restants: {}, tournee: [], occ: {}, place: false, turn: 0,
    pending: null, trade: null, tradeSeq: 0, tradesThisTurn: 0, turnActions: 0,
    winner: null, scores: null,
    log: [],
  };
  state.deck = shuffle(state, CLIENTS.map((c) => ({ ...c })));
  for (let k = 0; k < FILE; k++) state.file.push(state.deck.pop());
  state.first = int(state, n);
  // le dernier joueur de la première saison commence avec 1 Réputation
  state.players[(state.first + n - 1) % n].rep += REP_DERNIER;
  log(state, { k: 'start', first: state.first, dernier: (state.first + n - 1) % n });
  startSaison(state);
  return state;
}

/* ---------- lectures ---------- */

export const saisonIdx = (s) => Math.max(0, s.saison) % 4;
export const saisonNom = (s) => SAISONS[saisonIdx(s)];
export const annee = (s) => Math.floor(Math.max(0, s.saison) / 4);
export const unites = (p) => total(p.stock);
export const cuveUnites = (p) => CUVE[p.cuve];
export const a = (p, u) => p.upg.includes(u);
export const enDemande = (s, st) => s.demande.includes(st);
export const prixMarche = (s, st) => s.prix[st] + (enDemande(s, st) ? DEMANDE_BONUS : 0) + s.prixBonus;
export const caseOuverte = (s, c) => !s.ferme.includes(c);
export const ordre = (s) => s.players.map((_, i) => (s.first + i) % s.players.length);

// Récolte d'un champ ou d'une houblonnière cette saison
export function recolte(s, c) {
  const d = CASES[c];
  if (!d.recolte) return 0;
  const base = d.recolte[saisonIdx(s)];
  if (!base) return 0;
  const deja = s.occ[c]?.length ?? 0; // un deuxième ouvrier sur la même case récolte un de moins
  return Math.max(0, base + (METEO[s.meteo] ?? 0) + (s.evt === 'recolte' ? 1 : 0) - deja * (d.moins ?? 0));
}

// Une case est-elle libre pour ce joueur ?
export function caseLibre(s, pi, c) {
  if (!CASES[c] || !caseOuverte(s, c)) return false;
  if (CASES[c].multi) return true;
  if (CASES[c].parJoueur) return !s.tournee.includes(pi);
  return (s.occ[c]?.length ?? 0) < (CASES[c].cap ?? 1);
}

export const peutBrasser = (s, p, st) => {
  const r = RECETTES[st];
  if (r.exige && !a(p, r.exige) && !(s.invite && st === 'stout')) return false;
  return RES.every((x) => p.res[x] >= r[x]);
};

// Ce qu'une livraison rapporterait : { argent, rep, style } ou null
export function valeurLivraison(s, pi, client, style) {
  const p = s.players[pi];
  const st = client.style ?? style;
  if (!st || !STYLES.includes(st)) return null;
  if (client.style && style && style !== client.style) return null;
  if (p.stock[st] < client.n) return null;
  let rep = client.rep + (enDemande(s, st) ? DEMANDE_REP : 0);
  if (client.kind === 'fest' && client.saison === saisonIdx(s)) rep += FEST_REP;
  if (client.kind === 'cave' && s.critique) rep += CRITIQUE_REP;
  const argent = client.n * (RECETTES[st].prix + client.bonus + s.prixBonus);
  return { argent, rep, style: st };
}
// Styles avec lesquels ce joueur peut livrer ce client
export const stylesPour = (s, pi, client) => (client.style ? [client.style] : STYLES).filter((st) => valeurLivraison(s, pi, client, st));

export function ameliorationsPossibles(p) {
  return Object.keys(AMELIORATIONS).filter((u) => {
    if (u === 'ferm') return p.nferm < FERMENTEURS_MAX;
    if (u === 'embauche') return p.ouv < OUVRIERS_MAX;
    return !a(p, u);
  });
}

export const pointsDiversite = (n) => Object.entries(DIVERSITE).reduce((b, [k, v]) => (n >= +k ? v : b), 0);
export function score(s, pi) {
  const p = s.players[pi];
  const div = pointsDiversite(p.styles.length), arg = Math.floor(p.argent / ARGENT_PAR_POINT);
  return { rep: p.rep, diversite: div, argent: arg, total: p.rep + div + arg };
}

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

// Les cases où ce joueur pourrait poser un ouvrier maintenant, avec ce qu'il y ferait
export function posesPossibles(s, pi) {
  const p = s.players[pi], out = [];
  for (const c of Object.keys(CASES)) {
    if (!caseLibre(s, pi, c)) continue;
    if (CASES[c].recolte) { const q = recolte(s, c); if (q > 0) out.push({ case: c, recolte: q }); continue; }
    if (c === 'marcheMat') { if (p.argent >= Math.min(...Object.values(ACHAT))) out.push({ case: c, max: ACHAT_MAX }); continue; }
    if (c === 'tournee') {
      const clients = s.file.map((cl) => ({ id: cl.id, styles: stylesPour(s, pi, cl) })).filter((x) => x.styles.length);
      if (clients.length) out.push({ case: c, clients });
      continue;
    }
    if (c === 'marcheBieres') { const styles = STYLES.filter((st) => p.stock[st] > 0); if (styles.length) out.push({ case: c, styles }); continue; }
    if (c === 'chantier') { const targets = ameliorationsPossibles(p).filter((u) => AMELIORATIONS[u].cout <= p.argent); if (targets.length) out.push({ case: c, targets }); }
  }
  return out;
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

function readCounts(o, keys, max = 99) {
  if (!o || typeof o !== 'object') return null;
  const c = Object.fromEntries(keys.map((k) => [k, 0]));
  for (const k of Object.keys(o)) {
    if (!keys.includes(k)) return null;
    const n = o[k] ?? 0;
    if (!Number.isInteger(n) || n < 0 || n > max) return null;
    c[k] = n;
  }
  return c;
}
const readItems = (o) => readCounts(o, ITEMS);

/* ---------- saisons ---------- */

function piocher(s) {
  if (!s.deck.length && s.defausse.length) { s.deck = shuffle(s, s.defausse); s.defausse = []; }
  return s.deck.pop() ?? null;
}
function remplirFile(s) {
  while (s.file.length < FILE) { const c = piocher(s); if (!c) break; s.file.push(c); }
}

function startSaison(s) {
  s.saison++;
  const nom = saisonNom(s);
  s.meteo = 1 + int(s, 6);
  s.de = 1 + int(s, 6);
  s.evt = EVENEMENTS[nom][s.de] ?? null;
  s.demande = [...DEMANDE[nom]];
  s.ferme = []; s.prixBonus = 0; s.critique = false; s.invite = false;
  s.pending = null; s.trade = null; s.occ = {}; s.tournee = [];
  s.players.forEach((p) => { p.salle = false; });
  // brassins mûrs
  const finis = [];
  s.players.forEach((p, i) => {
    const done = p.ferms.filter((f) => f.left <= 0);
    p.ferms = p.ferms.filter((f) => f.left > 0);
    for (const f of done) { p.stock[f.st] += f.u; finis.push({ p: i, st: f.st, u: f.u }); }
  });
  log(s, { k: 'saison', saison: s.saison, meteo: s.meteo, de: s.de, evt: s.evt, finis });
  // événement
  const e = s.evt;
  if (e === 'mildiou') s.ferme = ['houbA', 'houbB'];
  else if (e === 'penurie') s.ferme = ['marcheMat'];
  else if (e === 'greve') s.ferme = ['tournee'];
  else if (e === 'fetePrix') s.prixBonus = 1;
  else if (e === 'feteVillage') { s.prixBonus = 1; for (let k = 0; k < 2; k++) { const c = piocher(s); if (c) s.file.push(c); } }
  else if (e === 'noel') { for (let k = 0; k < 2; k++) { const c = piocher(s); if (c) s.file.push(c); } }
  else if (e === 'critique') s.critique = true;
  else if (e === 'invite') s.invite = true;
  else if (e === 'mairie') s.file.push({ ...CLIENT_MAIRIE, id: `mairie${s.saison}`, style: STYLES[int(s, STYLES.length)] });
  else if (e === 'douanes') {
    const paie = s.players.map((p, i) => { const n = Math.min(p.argent, Math.floor(unites(p) / DOUANES_PAR)); p.argent -= n; return { p: i, n }; });
    log(s, { k: 'douanes', paie });
  } else if (e === 'inspection') {
    s.players.forEach((p, i) => p.ferms.forEach((f) => { if (f.u > 0) { f.u--; log(s, { k: 'perte', p: i, evt: e, style: f.st }); } }));
  } else if (e === 'contamination' || e === 'canicule') {
    const need = {};
    s.players.forEach((p, i) => { if (p.ferms.some((f) => f.u > 0)) need[i] = true; });
    if (Object.keys(need).length) s.pending = { type: 'saison', kind: e, need, resp: {} };
  } else if (e === 'concours' || e === 'salon') {
    const need = {};
    s.players.forEach((p, i) => { if (unites(p) > 0) need[i] = true; });
    if (Object.keys(need).length) s.pending = { type: 'saison', kind: e, need, resp: {} };
  }
  if (!s.pending) beginPoses(s);
}

function beginPoses(s) {
  const n = s.players.length, mode = s.opts.ordre ?? 'rotation';
  if (s.saison > 0) {
    if (mode === 'decale') s.first = (s.first0 + s.saison + Math.floor(s.saison / 4)) % n;
    else if (mode === 'rattrapage' || mode === 'serpent-rattrapage') { const cle = (i) => [s.players[i].rep, s.players[i].argent, i]; s.first = s.players.map((_, i) => i).sort((x, y) => cle(x)[0] - cle(y)[0] || cle(x)[1] - cle(y)[1] || ((x - s.first + n) % n) - ((y - s.first + n) % n))[0]; }
    else s.first = (s.first + 1) % n;
  } else s.first0 = s.first;
  s.restants = Object.fromEntries(s.players.map((p, i) => [i, p.ouv]));
  s.cur = s.first; s.place = false; s.turn++; s.tour = 0;
  s.tradesThisTurn = 0; s.turnActions = 0;
  log(s, { k: 'ordre', first: s.first });
}

function resoudreConcours(s) {
  const pend = s.pending, bar = CONCOURS[pend.kind];
  const notes = Object.entries(pend.resp).map(([k, st]) => ({ p: +k, st, n: RECETTES[st].rep + (enDemande(s, st) ? DEMANDE_REP : 0) }));
  const vals = [...new Set(notes.map((x) => x.n))].sort((x, y) => y - x);
  const gains = notes.map((x) => ({ ...x, rep: x.n === vals[0] ? bar[0] : vals.length > 1 && x.n === vals[1] ? bar[1] : 0 }));
  gains.forEach((g) => { s.players[g.p].rep += g.rep; });
  log(s, { k: 'concours', kind: pend.kind, gains });
}

// Joueur suivant qui a encore un ouvrier. En serpent, le sens s'inverse à chaque tour de table.
function suivant(s, after) {
  const n = s.players.length;
  if ((s.opts.ordre ?? '').startsWith('serpent')) {
    const seq = s.players.map((_, k) => (s.first + k) % n);
    const tour = s.tour ?? 0, sens = tour % 2 === 0 ? seq : [...seq].reverse();
    const pos = sens.indexOf(after);
    for (let k = pos + 1; k < n; k++) if (s.restants[sens[k]] > 0) return sens[k];
    // tour de table suivant, dans l'autre sens
    const suiv = tour % 2 === 0 ? [...seq].reverse() : seq;
    for (let k = 0; k < n; k++) if (s.restants[suiv[k]] > 0) { s.tour = tour + 1; return suiv[k]; }
    return null;
  }
  for (let k = 1; k <= n; k++) { const i = (after + k) % n; if (s.restants[i] > 0) return i; }
  return null;
}

function endSaison(s) {
  s.players.forEach((p, i) => {
    p.ferms.forEach((f) => { f.left--; });
    if (a(p, 'salle') && saisonIdx(s) === 3) { p.rep += SALLE_REP_HIVER; log(s, { k: 'salleRep', p: i, n: SALLE_REP_HIVER }); }
    // stock trop plein : vendu d'office au prix de la piste
    while (unites(p) > STOCK_MAX) {
      const st = STYLES.filter((x) => p.stock[x] > 0).reduce((b, x) => (s.prix[x] > s.prix[b] ? x : b));
      const gain = prixMarche(s, st);
      p.stock[st]--; p.argent += gain; s.prix[st] = Math.max(PRIX_PLANCHER, s.prix[st] - 1);
      log(s, { k: 'vendre', p: i, style: st, n: 1, gain, force: true });
    }
  });
  STYLES.forEach((st) => { s.prix[st] = Math.min(RECETTES[st].prix, s.prix[st] + PRIX_REMONTEE); });
  if (s.file.length) { const vieux = s.file.shift(); s.defausse.push(vieux); log(s, { k: 'clientParti', client: vieux }); }
  remplirFile(s);
  if (s.saison + 1 >= NB_SAISONS) return finir(s);
  startSaison(s);
}

function finir(s) {
  s.phase = 'over';
  s.pending = null; s.trade = null;
  s.scores = s.players.map((_, i) => score(s, i));
  const cle = (i) => [s.scores[i].total, s.players[i].argent, unites(s.players[i])];
  const classement = s.players.map((_, i) => i).sort((x, y) => { const cx = cle(x), cy = cle(y); return cy[0] - cx[0] || cy[1] - cx[1] || cy[2] - cx[2]; });
  s.winner = classement[0];
  log(s, { k: 'fin', p: s.winner, scores: s.scores.map((x) => x.total) });
}

/* ---------- actions ---------- */

function monTour(s, pi) {
  if (s.pending) return 'Une décision est en attente.';
  if (s.cur !== pi) return "Ce n'est pas ton tour.";
  return null;
}
function endTradeIfAny(s, why) {
  if (!s.trade) return;
  log(s, { k: 'tradeClosed', p: s.trade.from, why });
  s.trade = null;
}
function finPose(s, pi) {
  endTradeIfAny(s, 'end');
  const nx = suivant(s, pi);
  if (nx === null) { endSaison(s); return; }
  s.cur = nx; s.place = false; s.turn++;
  s.tradesThisTurn = 0; s.turnActions = 0;
}

const HANDLERS = {
  brasser(s, pi, { style }) {
    const g = monTour(s, pi);
    if (g) return g;
    if (!STYLES.includes(style)) return 'Style inconnu.';
    const p = s.players[pi], r = RECETTES[style];
    if (p.ferms.length >= p.nferm) return 'Tous tes fermenteurs sont occupés.';
    if (!peutBrasser(s, p, style)) return r.exige && !a(p, r.exige) && !(s.invite && style === 'stout') ? `Ce style demande : ${AMELIORATIONS[r.exige].nom}.` : 'Il te manque des matières pour cette recette.';
    RES.forEach((x) => { p.res[x] -= r[x]; });
    const de = 1 + int(s, 6);
    let u = cuveUnites(p);
    if (de === DE_BRASSAGE.rate) u--; else if (de === DE_BRASSAGE.cuvee) u++;
    p.ferms.push({ st: style, left: r.ferm, u });
    let premiere = false;
    if (!p.styles.includes(style)) { p.styles.push(style); p.rep += REP_PREMIERE; premiere = true; }
    log(s, { k: 'brasser', p: pi, style, de, u, ferm: r.ferm, premiere });
    return null;
  },

  salle(s, pi, { style }) {
    const g = monTour(s, pi);
    if (g) return g;
    const p = s.players[pi];
    if (!a(p, 'salle')) return 'Il te faut une Salle de dégustation.';
    if (p.salle) return 'La Salle a déjà servi cette saison.';
    if (!STYLES.includes(style) || p.stock[style] < 1) return "Tu n'as pas ce style en stock.";
    const gain = RECETTES[style].prix + SALLE_BONUS + s.prixBonus;
    p.stock[style]--; p.salle = true; p.argent += gain;
    log(s, { k: 'salle', p: pi, style, gain });
    return null;
  },

  poser(s, pi, act) {
    const g = monTour(s, pi);
    if (g) return g;
    if (s.place) return 'Tu as déjà posé un ouvrier ce tour-ci.';
    if (!(s.restants[pi] > 0)) return "Tu n'as plus d'ouvrier cette saison.";
    const c = act.case, p = s.players[pi];
    if (!CASES[c]) return 'Case inconnue.';
    if (!caseOuverte(s, c)) return 'Cette case est fermée cette saison.';
    if (!caseLibre(s, pi, c)) return c === 'tournee' ? 'Tu as déjà fait ta tournée cette saison.' : 'Cette case est prise.';
    const ev = { k: 'poser', p: pi, case: c };
    if (CASES[c].recolte) {
      const q = recolte(s, c);
      if (!q) return 'Rien à récolter ici cette saison.';
      p.res[CASES[c].res] += q;
      ev.res = CASES[c].res; ev.n = q;
    } else if (c === 'marcheMat') {
      const ach = readCounts(act.achats, RES, ACHAT_MAX);
      if (!ach || !total(ach)) return 'Indique ce que tu achètes.';
      if (total(ach) > ACHAT_MAX) return `Au plus ${ACHAT_MAX} matières par passage.`;
      const cout = RES.reduce((n, r) => n + ach[r] * ACHAT[r], 0);
      if (p.argent < cout) return `Il te faut ${cout} Argent.`;
      p.argent -= cout; RES.forEach((r) => { p.res[r] += ach[r]; });
      ev.achats = ach; ev.cout = cout;
    } else if (c === 'tournee') {
      const idx = s.file.findIndex((cl) => cl.id === act.client);
      if (idx < 0) return 'Ce client n’est plus dans la file.';
      const cl = s.file[idx];
      const v = valeurLivraison(s, pi, cl, act.style ?? cl.style);
      if (!v) return cl.style ? `Il te faut ${cl.n} ${cl.style} pour ce client.` : 'Choisis un style que tu as en quantité suffisante.';
      p.stock[v.style] -= cl.n; p.argent += v.argent; p.rep += v.rep; p.clients.push(cl.id);
      if (cl.kind === 'cave' && s.critique) s.critique = false;
      s.file.splice(idx, 1); remplirFile(s); s.tournee.push(pi);
      ev.client = cl; ev.style = v.style; ev.argent = v.argent; ev.rep = v.rep;
    } else if (c === 'marcheBieres') {
      const v = readCounts(act.ventes, STYLES, 40);
      if (!v || !total(v)) return 'Indique ce que tu vends.';
      if (STYLES.some((st) => p.stock[st] < v[st])) return "Tu n'as pas autant d'unités.";
      let gain = 0;
      for (const st of STYLES) for (let k = 0; k < v[st]; k++) { gain += prixMarche(s, st); s.prix[st] = Math.max(PRIX_PLANCHER, s.prix[st] - 1); p.stock[st]--; }
      p.argent += gain;
      ev.ventes = v; ev.gain = gain;
    } else if (c === 'chantier') {
      const u = act.u, d = AMELIORATIONS[u];
      if (!d) return 'Amélioration inconnue.';
      if (!ameliorationsPossibles(p).includes(u)) return 'Tu as déjà cette amélioration.';
      if (p.argent < d.cout) return `Il te faut ${d.cout} Argent.`;
      p.argent -= d.cout;
      if (u === 'ferm') p.nferm++;
      else if (u === 'embauche') { p.ouv++; p.upg.push(u); }
      else { p.upg.push(u); if (u === 'cuve') p.cuve = 1; }
      ev.u = u;
    }
    if (!CASES[c].multi && !CASES[c].parJoueur) s.occ[c] = [...(s.occ[c] ?? []), pi];
    s.place = true; s.restants[pi]--;
    log(s, ev);
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
    if (!Object.keys(pend.need).length) { s.pending = null; beginPoses(s); }
    return null;
  },

  concours(s, pi, { style }) {
    const pend = s.pending;
    if (pend?.type !== 'saison' || !CONCOURS[pend.kind] || !pend.need[pi]) return "Tu n'as rien à présenter.";
    const p = s.players[pi];
    if (!STYLES.includes(style) || p.stock[style] < 1) return 'Présente un style que tu as en stock.';
    p.stock[style]--;
    pend.resp[pi] = style;
    log(s, { k: 'presente', p: pi, style });
    delete pend.need[pi];
    if (!Object.keys(pend.need).length) { resoudreConcours(s); s.pending = null; beginPoses(s); }
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
    const give = r.s === 'counter' ? r.give : t.give, get = r.s === 'counter' ? r.get : t.get;
    const A = s.players[pi], B = s.players[w];
    if (!possede(A, give)) return "Tu n'as plus ce que tu proposais.";
    if (!possede(B, get)) { t.resp[w] = { s: 'refuse' }; log(s, { k: 'tradeResp', p: w, from: t.from, s: 'refuse', lacking: true }); return null; }
    donner(A, B, give); donner(B, A, get);
    s.trade = null;
    log(s, { k: 'tradeDone', p: pi, with: w, give, get });
    return null;
  },

  cancelTrade(s, pi) {
    if (!s.trade || s.trade.from !== pi) return "Tu n'as pas d'offre ouverte.";
    endTradeIfAny(s, 'cancel');
    return null;
  },

  setOffers(s, pi, { on }) { s.players[pi].offersOn = !!on; return null; },

  endTurn(s, pi) {
    const g = monTour(s, pi);
    if (g) return g;
    if (!s.place) {
      if (s.restants[pi] > 0 && posesPossibles(s, pi).length) return 'Pose d’abord ton ouvrier.';
      if (s.restants[pi] > 0) { s.restants[pi] = 0; log(s, { k: 'passe', p: pi }); }
    }
    log(s, { k: 'endTurn', p: pi });
    finPose(s, pi);
    return null;
  },
};

/* ---------- actions légales ---------- */

export function legalActions(s, pi) {
  if (s.phase === 'over') return [];
  const out = [], p = s.players[pi];
  if (s.trade && s.trade.to.includes(pi) && !s.trade.resp[pi]) out.push({ type: 'respondTrade', canAccept: possede(p, s.trade.get) });
  const pend = s.pending;
  if (pend) {
    if (!pend.need[pi]) return out;
    if (CONCOURS[pend.kind]) out.push({ type: 'concours', kind: pend.kind, styles: STYLES.filter((st) => p.stock[st] > 0) });
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
  if (a(p, 'salle') && !p.salle) { const styles = STYLES.filter((st) => p.stock[st] > 0); if (styles.length) out.push({ type: 'salle', styles }); }
  const poses = !s.place && s.restants[pi] > 0 ? posesPossibles(s, pi) : [];
  if (poses.length) out.push({ type: 'poser', targets: poses });
  if (!s.trade && total(avoirs(p)) > 0) out.push({ type: 'proposeTrade' });
  if (s.place || !(s.restants[pi] > 0) || !poses.length) out.push({ type: 'endTurn', passe: !s.place && s.restants[pi] > 0 });
  return out;
}

/* ---------- vue filtrée ---------- */

// Tout est public, sauf la graine, le générateur et l'ordre de la pioche des clients.
export function viewFor(s, pi) {
  const v = structuredClone(s);
  delete v.seed; delete v.rng;
  v.deck = s.deck.length;
  v.defausse = s.defausse.length;
  v.me = pi;
  v.waiting = waitingFor(s);
  v.players = s.players.map((p, i) => ({ ...p, score: score(s, i) }));
  return v;
}
