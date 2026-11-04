// IA des brasseries gérées par l'ordinateur : lit l'état et renvoie une action, sans rien modifier.
//
//   aiAction(state, playerId) → action à jouer, ou null s'il n'y a rien à décider pour ce joueur
//
// Trois niveaux (state.opts.niveau) :
//   apprenti  : brasse ce qu'il peut, vend au Marché, s'équipe peu, ne négocie pas ;
//   compagnon : raisonne par saison (valeur d'un brassin ramenée à sa durée), s'équipe selon le temps qui reste,
//               ouvre des tournées, négocie quand il lui manque une matière ;
//   maître    : en plus, anticipe les cartes qui peuvent encore sortir (styles en demande, foires) et garde
//               ses meilleures bières pour les clients qui paient la réputation.
// Collabs : le compagnon et le maître en proposent quand elles valent mieux qu'un brassin seul, et les
// évaluent quand on leur en propose ; l'apprenti n'en propose pas et n'accepte que les plus avantageuses.
//
// Le hasard de l'IA vient d'un générateur dérivé de l'état : la même position donne toujours la même décision.
// Tout ce qu'elle lit est public (l'état de Brassins l'est presque entièrement).

import {
  SAISONS, NB_SAISONS, RES, STYLES, ITEMS, RECETTES, ACHAT, AMELIORATIONS, CLIENTS, FOIRES, STOCK_MAX, FERMENTEURS_MAX, CUVE,
  TOURAILLE_MALT, TOURAILLE_PAR_SAISON, SALLE_UNITES, CARTE, DEMANDE_BONUS, PRODUCTION, PRODUIT, COLLAB_UNITE_BONUS, COLLAB_REP, Z, ZI, total,
} from './constantes.js';
import { local, next } from './alea.js';
import { TOPO, distClient } from './plateau.js';
import {
  saisonIdx, annee, unites, cuveUnites, a, clientIds, clientKind, clientPos, distance, coutTournee, limiteLivraison, enDemande, prixMarche,
  valeurLivraison, peutBrasser, ameliorationsPossibles, avoirs, legalActions, collabLibre, stockMarche, apportParDefaut,
} from './regles.js';

export const NIVEAUX = {
  apprenti: { nom: 'Apprenti', txt: 'Brasse ce qu’il peut et vend au Marché.' },
  compagnon: { nom: 'Compagnon', txt: 'Gère sa brasserie avec méthode et négocie.' },
  maitre: { nom: 'Maître brasseur', txt: 'Anticipe les saisons et vise les clients qui comptent.' },
};

const restantes = (s) => NB_SAISONS - s.saison; // saisons restantes, celle-ci comprise
const niveau = (s) => s.opts?.niveau ?? 'compagnon';
const W = (s) => ({ apprenti: 1.0, compagnon: 2.4, maitre: 2.8 }[niveau(s)]); // poids d'un point de réputation en Argent
const rnd = (s, pi, k) => next(local(`${s.seed ?? s.seq}:${s.seq}:${pi}:${k}`));

// Production annuelle potentielle d'une case de brasserie, et ses atouts
function valeurCase(s, hex, pi) {
  let prod = 0;
  const kinds = new Set();
  for (const h of [hex, ...TOPO.hexes[hex].near]) {
    const t = s.tiles[h];
    if (!PRODUCTION[t]) continue;
    kinds.add(t);
    prod += PRODUCTION[t].reduce((x, y) => x + y, 0) * (t === 'source' ? 0.5 : 1);
  }
  let v = prod + 2 * kinds.size;
  // proximité des clients
  for (const c of clientIds(s)) v += (clientKind(c) === 'foire' ? 0.5 : 1) / (1 + distClient(hex, clientPos(s, c)));
  return v;
}

/* ---------- styles en demande, maintenant et plus tard ---------- */

// Probabilité qu'un style soit en demande à une saison future (cartes restantes de cette saison)
function pDemande(s, st, t) {
  if (t === s.saison) return enDemande(s, st) ? 1 : 0;
  const j = t % 4, k = SAISONS[j];
  // cartes de cette saison déjà révélées : une par année passée, plus celle de cette année si la saison est passée ou en cours
  const nRev = annee(s) + (j <= saisonIdx(s) ? 1 : 0);
  const pool = Array.isArray(s.deck[k]) ? s.deck[k].slice(nRev) : s.deck[k].restantes;
  if (!pool.length) return 0;
  return pool.filter((id) => CARTE[id].demande.includes(st)).length / pool.length;
}

/* ---------- brassage ---------- */

// Valeur d'une unité d'un style pour ce joueur, selon ce qu'il pourra en faire
function valeurUnite(s, pi, st, quand) {
  const p = s.players[pi], r = RECETTES[st], w = W(s);
  let best = r.prix * 0.8; // Marché, prix érodé
  for (const c of p.tournees) {
    const kind = clientKind(c);
    if (kind === 'foire' && FOIRES[+c.slice(5)].saison !== quand % 4) continue;
    const v = valeurLivraison({ ...s, demande: [] , saison: quand }, c, st);
    if (v) best = Math.max(best, v.argent + w * v.rep);
  }
  if (niveau(s) === 'maitre' && quand < NB_SAISONS) best += pDemande(s, st, quand) * (DEMANDE_BONUS + w) * 0.6;
  return best;
}

// Plan de brassage : style, matières à acheter, valeur nette
function planBrassage(s, pi) {
  const p = s.players[pi], rem = restantes(s), lvl = niveau(s);
  let best = null;
  for (const st of STYLES) {
    const r = RECETTES[st];
    if (r.ferm > rem - 1) continue; // doit être en stock avant la fin
    if (r.exige && !a(p, r.exige)) continue;
    const achats = Z();
    let cout = 0, torrefier = 0;
    for (const x of RES) {
      let miss = Math.max(0, r[x] - p.res[x]);
      if (x === 'torr' && miss && a(p, 'touraille') && p.torr < TOURAILLE_PAR_SAISON && p.res.malt - r.malt >= TOURAILLE_MALT) { torrefier = 1; miss--; }
      achats[x] = miss;
      cout += miss * ACHAT[x];
    }
    if (RES.some((x) => achats[x] > stockMarche(s, x))) continue; // le Marché n'en a pas assez cette saison
    if (lvl === 'apprenti' && cout > 0) continue; // l'apprenti n'achète pas pour brasser
    const reserve = lvl === 'apprenti' ? 0 : 2;
    if (cout > p.argent - reserve) continue;
    const quand = s.saison + r.ferm;
    let val = cuveUnites(p) * valeurUnite(s, pi, st, quand) - cout - 0.6 * RES.reduce((n, x) => n + r[x], 0);
    if (!p.styles.includes(st)) val += 2 + W(s);
    val = val / Math.pow(r.ferm, 0.65);
    val += rnd(s, pi, 'brew' + st) * (lvl === 'apprenti' ? 3 : 0.5);
    if (best === null || val > best.val) best = { st, achats, cout, torrefier, val };
  }
  return best;
}

/* ---------- ventes ---------- */

function meilleureLivraison(s, pi) {
  const p = s.players[pi], w = W(s);
  let best = null;
  for (const c of p.tournees) {
    if (!(s.capa[c] > 0) || (p.livr[c] ?? 0) >= limiteLivraison(p)) continue;
    for (const st of STYLES) {
      if (p.stock[st] < 1) continue;
      const v = valeurLivraison(s, c, st);
      if (!v) continue;
      const val = v.argent + w * v.rep;
      if (best === null || val > best.val) best = { client: c, style: st, val };
    }
  }
  return best;
}

// Unités à garder pour les clients des prochaines saisons
function reserveStock(s, pi) {
  const p = s.players[pi];
  if (niveau(s) === 'apprenti') return 0;
  if (restantes(s) <= 1) return 0;
  const capProchaine = p.tournees.reduce((n, c) => n + (clientKind(c) === 'foire' ? (FOIRES[+c.slice(5)].saison === (s.saison + 1) % 4 ? limiteLivraison(p) : 0) : limiteLivraison(p)), 0);
  return Math.min(capProchaine, STOCK_MAX - 2);
}

function venteMarche(s, pi, force) {
  const p = s.players[pi];
  const arrivent = p.ferms.filter((f) => f.left <= 1).reduce((n, f) => n + f.u, 0);
  const keep = force ? 0 : Math.min(reserveStock(s, pi), Math.max(0, STOCK_MAX - arrivent));
  if (unites(p) <= keep) return null;
  // le style le mieux payé maintenant, en gardant de préférence ceux qui valent plus chez un client
  let best = null;
  for (const st of STYLES) {
    if (p.stock[st] < 1) continue;
    const prix = prixMarche(s, st);
    const val = prix - 0.3 * (valeurUnite(s, pi, st, s.saison + 1) - prix);
    if (best === null || val > best.val) best = { st, prix, val };
  }
  if (!best) return null;
  if (!force && best.prix < 2 && unites(p) + arrivent <= STOCK_MAX) return null;
  return { type: 'vendre', style: best.st, n: 1 };
}

/* ---------- investissements ---------- */

function meilleureAmelioration(s, pi) {
  const p = s.players[pi], rem = restantes(s) - 1, lvl = niveau(s), w = W(s);
  if (rem < 2) return null;
  const reserve = 6;
  const busy = p.ferms.length >= p.nferm;
  const uv = 4 + 0.8 * w, bps = Math.min(2, p.nferm / 1.8);
  const achatsTorr = s.log.filter((e) => e.k === 'acheter' && e.p === pi && e.r === 'torr').length;
  const lost = s.log.filter((e) => e.k === 'perte' && e.p === pi).length;
  let best = null;
  for (const u of ameliorationsPossibles(s, p)) {
    const cout = AMELIORATIONS[u].cout;
    if (cout > p.argent - reserve) continue;
    if (lvl === 'apprenti' && !['ferm', 'cuve2', 'cuve3'].includes(u)) continue;
    const gain = {
      cuve2: rem * bps * uv * 0.8, cuve3: rem * bps * uv * 0.8,
      ferm: rem * (busy ? 0.55 * (cuveUnites(p) * uv - 6) : 0.3),
      // le Malt torréfié est rare au Marché : sans Touraille, les styles foncés deviennent difficiles
      touraille: rem * 1.0 + achatsTorr * 1.5 + rem * 1.5 * Math.max(0, 1 - stockMarche(s, 'torr') / s.players.length),
      froide: rem * 1.0 + lost * 1.5,
      labo: rem * 1.3,
      camion: rem * (0.4 + 0.4 * p.tournees.length),
      salle: rem * (SALLE_UNITES * 2.4 / 2) + Math.floor(rem / 4) * w,
    }[u];
    if (gain - cout > 0 && (best === null || gain - cout > best.val)) best = { u, val: gain - cout };
  }
  return best;
}

function meilleureTournee(s, pi) {
  const p = s.players[pi], rem = restantes(s), w = W(s), lvl = niveau(s);
  if (lvl === 'apprenti' && p.argent < 10) return null;
  let best = null;
  for (const c of clientIds(s)) {
    if (p.tournees.includes(c)) continue;
    const cout = coutTournee(s, pi, c);
    if (cout > p.argent - 2) continue;
    const kind = clientKind(c);
    let val;
    if (kind === 'foire') {
      const f = FOIRES[+c.slice(5)];
      const uses = Array.from({ length: rem }, (_, k) => s.saison + k).filter((t) => t % 4 === f.saison && (t > s.saison || unites(p) > 0)).length;
      val = uses * limiteLivraison(p) * (CLIENTS.foire.bonus + w * (1.5 + CLIENTS.foire.rep));
    } else val = (rem - 1) * limiteLivraison(p) * (CLIENTS[kind].bonus + w * (kind === 'village' ? 1.2 : kind === 'cave' ? 1.8 : 1.5)) * (kind === 'cave' ? 0.6 : 1);
    if (val - cout <= 0) continue;
    if (best === null || val / cout > best.ratio) best = { client: c, cout, ratio: val / cout };
  }
  return best;
}

/* ---------- échanges ---------- */

// Utilité d'un ensemble d'avoirs : matières vers le prochain brassin, bière, Argent
function utilite(s, pi, av) {
  const p = s.players[pi];
  let u = av.argent;
  for (const r of RES) u += av[r] * ACHAT[r] * 0.6;
  for (const st of STYLES) u += av[st] * valeurUnite(s, pi, st, s.saison) * 0.9;
  // bonus si le prochain brassin devient possible
  const plan = planBrassage(s, pi);
  if (plan) {
    const r = RECETTES[plan.st];
    const manqueAvant = RES.reduce((n, x) => n + Math.max(0, r[x] - p.res[x]), 0);
    const manqueApres = RES.reduce((n, x) => n + Math.max(0, r[x] - av[x]), 0);
    u += (manqueAvant - manqueApres) * 2.5;
  }
  return u;
}
function accepteEchange(s, pi, from, recoit, donne) {
  if (niveau(s) === 'apprenti') return false;
  const p = s.players[pi], av = avoirs(p);
  if (ITEMS.some((k) => av[k] < (donne[k] ?? 0))) return false;
  const scoreFrom = s.players[from].rep, mien = p.rep;
  if (scoreFrom > mien + 12 && restantes(s) <= 4) return false; // ne pas aider le leader en fin de partie
  const apres = { ...av };
  ITEMS.forEach((k) => { apres[k] += (recoit[k] ?? 0) - (donne[k] ?? 0); });
  return utilite(s, pi, apres) - utilite(s, pi, av) > 0.3;
}

function proposition(s, pi) {
  const p = s.players[pi];
  if (niveau(s) === 'apprenti' || s.tradesThisTurn > 0 || s.trade) return null;
  const plan = planBrassage(s, pi);
  if (!plan || total(plan.achats) !== 1) return null; // il manque exactement une matière
  const need = RES.find((x) => plan.achats[x] > 0);
  const spare = RES.filter((x) => x !== need && p.res[x] - RECETTES[plan.st][x] >= 2).sort((x, y) => p.res[y] - p.res[x]);
  if (!spare.length) return null;
  const to = s.players.map((_, i) => i).filter((i) => i !== pi && s.players[i].offersOn && (s.players[i].ai || s.opts.aiOffersToHumans) && s.players[i].res[need] > 0);
  if (!to.length) return null;
  const give = ZI(), get = ZI();
  give[spare[0]] = 1; get[need] = 1;
  return { type: 'proposeTrade', give, get, to };
}

/* ---------- collabs ---------- */

const coutMatieres = (c) => RES.reduce((n, x) => n + c[x] * ACHAT[x] * 0.6, 0);
const duree = (st) => Math.pow(RECETTES[st].ferm, 0.65);

// Ce que rapporte une collab à pi : sa part des unités, la réputation, un style nouveau
function gainCollab(s, pi, hote, st) {
  const p = s.players[pi], r = RECETTES[st];
  const u = cuveUnites(s.players[hote]) + COLLAB_UNITE_BONUS, half = Math.floor(u / 2);
  const part = pi === hote ? u - half : half;
  let g = part * valeurUnite(s, pi, st, s.saison + r.ferm) + W(s) * COLLAB_REP;
  if (!p.styles.includes(st)) g += 2 + W(s);
  return g;
}

// Le partenaire accepterait-il cette répartition ? (évaluation sur ce qui est public)
function accepteCollab(s, pi, hote, st, apport) {
  const p = s.players[pi];
  if (!collabLibre(p) || RES.some((x) => p.res[x] < apport.part[x])) return false;
  if (RECETTES[st].ferm > restantes(s) - 1) return false; // ne serait pas prête à temps
  if (s.players[hote].rep > p.rep + 8 && restantes(s) <= 6) return false; // ne pas pousser le meneur en fin de partie
  const av = avoirs(p), apres = { ...av };
  RES.forEach((x) => { apres[x] -= apport.part[x]; });
  const net = gainCollab(s, pi, hote, st) + utilite(s, pi, apres) - utilite(s, pi, av);
  return net > (niveau(s) === 'apprenti' ? 3 : 1);
}

function propositionCollab(s, pi) {
  const p = s.players[pi];
  if (niveau(s) === 'apprenti' || s.tradesThisTurn > 0 || s.trade || !collabLibre(p) || p.ferms.length >= p.nferm) return null;
  const plan = planBrassage(s, pi);
  const seuil = plan ? plan.val : 0;
  let best = null;
  for (const st of STYLES) {
    const r = RECETTES[st];
    if (r.ferm > restantes(s) - 1 || (r.exige && !a(p, r.exige))) continue;
    for (let w = 0; w < s.players.length; w++) {
      const q = s.players[w];
      if (w === pi || !q.offersOn || !collabLibre(q) || (!q.ai && !s.opts.aiOffersToHumans)) continue;
      if (q.rep > p.rep + 10) continue; // pas d'aide au meneur
      const ap = apportParDefaut(s, pi, w, st);
      if (!ap || (q.ai && !accepteCollab(s, w, pi, st, ap))) continue;
      const val = (gainCollab(s, pi, pi, st) - coutMatieres(ap.hote)) / duree(st) + rnd(s, pi, `col${st}${w}`) * 0.3;
      if (val > seuil + 0.5 && (best === null || val > best.val)) best = { st, w, ap, val };
    }
  }
  return best && { type: 'proposeCollab', style: best.st, with: best.w, apport: best.ap };
}

function reponseCollab(s, pi) {
  const t = s.trade;
  if (accepteCollab(s, pi, t.from, t.style, t.apport)) return { type: 'respondTrade', accept: true };
  if (niveau(s) !== 'apprenti' && collabLibre(s.players[pi])) {
    // contre-proposition : une matière de moins de mon côté, si l'hôte en a
    const H = s.players[t.from];
    for (const x of RES) {
      if (!t.apport.part[x] || H.res[x] - t.apport.hote[x] < 1 || total(t.apport.part) < 2) continue;
      const ap = { hote: { ...t.apport.hote, [x]: t.apport.hote[x] + 1 }, part: { ...t.apport.part, [x]: t.apport.part[x] - 1 } };
      if (accepteCollab(s, pi, t.from, t.style, ap)) return { type: 'respondTrade', counter: { apport: ap } };
    }
  }
  return { type: 'respondTrade', accept: false };
}

/* ---------- décision ---------- */

export function aiAction(s, pi) {
  if (s.phase === 'over') return null;
  const p = s.players[pi];
  const L = legalActions(s, pi);
  const has = (type) => L.find((x) => x.type === type);

  // Réponse à une offre
  const rt = has('respondTrade');
  if (rt && s.trade?.kind === 'collab' && s.trade.from !== pi) return reponseCollab(s, pi);
  if (rt && s.trade && s.trade.from !== pi) {
    const t = s.trade;
    if (rt.canAccept && accepteEchange(s, pi, t.from, t.give, t.get)) return { type: 'respondTrade', accept: true };
    // contre-proposition : la même chose, avec une matière de plus de l'autre côté
    if (niveau(s) !== 'apprenti') {
      for (const x of RES) {
        if (!s.players[t.from].res[x] || t.get[x]) continue;
        const give = { ...t.give, [x]: (t.give[x] ?? 0) + 1 };
        if (rt.canAccept && accepteEchange(s, pi, t.from, give, t.get)) return { type: 'respondTrade', counter: { give, get: t.get } };
      }
    }
    return { type: 'respondTrade', accept: false };
  }

  // Mise en place
  const pl = has('placer');
  if (pl) {
    let best = null;
    for (const h of pl.targets) { const v = valeurCase(s, h, pi) + rnd(s, pi, 'h' + h) * 0.5; if (best === null || v > best.v) best = { h, v }; }
    return { type: 'placer', hex: best.h };
  }
  const tf = has('tournee');
  if (tf?.free) {
    const pref = (c) => { const k = clientKind(c.client); return k === 'bar' ? 3 : k === 'village' ? 2 : k === 'cave' ? 1 : 0; };
    const best = [...tf.targets].sort((x, y) => pref(y) - pref(x))[0];
    return { type: 'tournee', client: best.client };
  }

  // Événements de saison
  const ev = has('evenement');
  if (ev) {
    const idx = ev.targets.reduce((b, i) => (b === null || p.ferms[i].u * RECETTES[p.ferms[i].st].prix < p.ferms[b].u * RECETTES[p.ferms[b].st].prix ? i : b), null);
    return { type: 'evenement', ferm: idx };
  }
  const cc = has('concours');
  if (cc) {
    const st = cc.styles.reduce((b, x) => (b === null || RECETTES[x].rep + enDemande(s, x) > RECETTES[b].rep + enDemande(s, b) ? x : b), null);
    return { type: 'concours', style: st };
  }

  if (s.cur !== pi || s.pending) return null;

  // Mon offre en cours : conclure dès qu'une réponse convient, sinon attendre les réponses, sinon retirer
  if (s.trade?.from === pi && s.trade.kind === 'collab') {
    const t = s.trade, r = t.resp[t.to[0]];
    if (!r) return null; // réponse en attente
    if (r.s === 'accept') return { type: 'concludeTrade', with: t.to[0] };
    if (r.s === 'counter' && RES.every((x) => p.res[x] >= r.apport.hote[x]) && gainCollab(s, pi, pi, t.style) - coutMatieres(r.apport.hote) > 1) return { type: 'concludeTrade', with: t.to[0] };
    return { type: 'cancelTrade' };
  }
  if (s.trade?.from === pi) {
    const t = s.trade;
    const ok = Object.entries(t.resp).filter(([, r]) => r.s !== 'refuse');
    for (const [k, r] of ok) {
      const give = r.s === 'counter' ? r.give : t.give, get = r.s === 'counter' ? r.get : t.get;
      if (r.s === 'accept' || accepteEchange(s, pi, +k, get, give)) return { type: 'concludeTrade', with: +k };
    }
    if (Object.keys(t.resp).length < t.to.length) return null; // réponses en attente
    return { type: 'cancelTrade' };
  }

  // 1. Livrer les clients
  const liv = meilleureLivraison(s, pi);
  if (liv) return { type: 'livrer', client: liv.client, style: liv.style };
  // 2. Salle de dégustation
  const sa = has('salle');
  if (sa) return { type: 'salle', style: sa.styles.reduce((b, x) => (RECETTES[x].prix > RECETTES[b].prix ? x : b)) };
  // 3. Stock qui déborde : vendre
  if (unites(p) > STOCK_MAX) return venteMarche(s, pi, true);
  // 4. S'équiper
  const am = meilleureAmelioration(s, pi);
  if (am) return { type: 'ameliorer', u: am.u };
  // 5. Ouvrir une tournée (une par tour)
  const dejaTournee = s.log.some((e) => e.k === 'tournee' && e.p === pi && e.turn === s.turn && e.cout > 0);
  if (!dejaTournee) { const t = meilleureTournee(s, pi); if (t) return { type: 'tournee', client: t.client }; }
  // 6. Brasser (en achetant ce qui manque, ou en négociant)
  if (p.ferms.length < p.nferm) {
    const col = propositionCollab(s, pi);
    if (col) return col;
    const plan = planBrassage(s, pi);
    if (plan) {
      if (total(plan.achats) === 1 && !dejaTournee) { const prop = proposition(s, pi); if (prop) return prop; }
      if (plan.torrefier && has('torrefier')) return { type: 'torrefier' };
      const x = RES.find((r) => plan.achats[r] > 0);
      if (x) return { type: 'acheter', r: x, n: plan.achats[x] };
      if (peutBrasser(s, p, plan.st)) return { type: 'brasser', style: plan.st };
    }
  }
  // 7. Vendre le surplus au Marché
  const v = venteMarche(s, pi, false);
  if (v) return v;
  if (has('endTurn')) return { type: 'endTurn' };
  return venteMarche(s, pi, true);
}
