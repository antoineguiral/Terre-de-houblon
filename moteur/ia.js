// IA des brasseries gérées par l'ordinateur : lit l'état et renvoie une action, sans rien modifier.
//
//   aiAction(state, playerId) → action à jouer, ou null s'il n'y a rien à décider pour ce joueur
//
// Trois niveaux (state.opts.niveau) :
//   apprenti  : brasse ce qu'il peut, récolte, vend au Marché, s'équipe peu, ne négocie pas ;
//   compagnon : pense un brassin à l'avance, pose là où ça lui manque, vise les clients qui paient la réputation,
//               s'équipe selon le temps qui reste, négocie quand il lui manque une matière ;
//   maître    : en plus, garde ses bières pour les clients et les festivals de la saison, et investit plus tôt.
//
// Le hasard de l'IA vient d'un générateur dérivé de l'état : la même position donne toujours la même décision.

import {
  NB_SAISONS, RES, STYLES, ITEMS, RECETTES, CASES, ACHAT, ACHAT_MAX, AMELIORATIONS, STOCK_MAX, FERMENTEURS_MAX, OUVRIERS_MAX, Z, ZI, total,
} from './constantes.js';
import { local, next } from './alea.js';
import { saisonIdx, unites, cuveUnites, a, enDemande, prixMarche, valeurLivraison, stylesPour, peutBrasser, ameliorationsPossibles, avoirs, legalActions, posesPossibles, recolte } from './regles.js';

export const NIVEAUX = {
  apprenti: { nom: 'Apprenti', txt: 'Brasse ce qu’il peut et vend au Marché.' },
  compagnon: { nom: 'Compagnon', txt: 'Pense un brassin à l’avance et vise les bons clients.' },
  maitre: { nom: 'Maître brasseur', txt: 'Garde ses bières pour les clients qui comptent et investit tôt.' },
};

const restantes = (s) => NB_SAISONS - s.saison; // saisons restantes, celle-ci comprise
const niveau = (s) => s.opts?.niveau ?? 'compagnon';
const W = (s) => ({ apprenti: 1.2, compagnon: 2.2, maitre: 2.6 }[niveau(s)]); // valeur d'un point de réputation en Argent
const rnd = (s, pi, k) => next(local(`${s.seed ?? s.seq}:${s.seq}:${pi}:${k}`));

/* ---------- brassage ---------- */

// Le style qu'on voudrait brasser ensuite, et ce qui manque pour ça
function plan(s, pi) {
  const p = s.players[pi], rem = restantes(s), lvl = niveau(s);
  let best = null;
  for (const st of STYLES) {
    const r = RECETTES[st];
    if (r.ferm > rem - 1) continue;
    if (r.exige && !a(p, r.exige) && !(s.invite && st === 'stout')) continue;
    const manque = Z();
    let miss = 0;
    RES.forEach((x) => { manque[x] = Math.max(0, r[x] - p.res[x]); miss += manque[x]; });
    const demandeFile = s.file.filter((c) => c.style === st || c.style === null).length;
    let val = cuveUnites(p) * (r.prix + W(s) * r.rep) + 1.5 * demandeFile + (p.styles.includes(st) ? 0 : 2 + W(s));
    if (lvl === 'maitre' && enDemande(s, st)) val += 2;
    val = val / Math.pow(r.ferm, 0.65) - 1.5 * miss + rnd(s, pi, 'plan' + st) * (lvl === 'apprenti' ? 3 : 0.4);
    if (best === null || val > best.val) best = { st, manque, miss, val };
  }
  return best;
}

/* ---------- ventes ---------- */

function meilleurClient(s, pi) {
  const w = W(s);
  let best = null;
  for (const cl of s.file) {
    for (const st of stylesPour(s, pi, cl)) {
      const v = valeurLivraison(s, pi, cl, st);
      const val = v.argent + w * v.rep;
      if (best === null || val > best.val) best = { client: cl.id, style: st, val };
    }
  }
  return best;
}

// Unités à garder pour les clients, plutôt que de les brader au Marché
function reserve(s, pi) {
  const lvl = niveau(s);
  if (lvl === 'apprenti' || restantes(s) <= 1) return 0;
  const livrables = s.file.filter((c) => stylesPour(s, pi, c).length).length;
  return Math.min(lvl === 'maitre' ? 3 : 2, Math.max(1, livrables));
}
function ventes(s, pi, force) {
  const p = s.players[pi];
  const arrivent = p.ferms.filter((f) => f.left <= 1).reduce((n, f) => n + f.u, 0);
  const keep = force ? 0 : Math.min(reserve(s, pi), Math.max(0, STOCK_MAX - arrivent));
  const v = Object.fromEntries(STYLES.map((st) => [st, 0]));
  const prix = { ...s.prix };
  let u = unites(p), n = 0;
  while (u > keep) {
    const st = STYLES.filter((x) => p.stock[x] - v[x] > 0).reduce((b, x) => (b === null || prix[x] + (enDemande(s, x) ? 2 : 0) > prix[b] + (enDemande(s, b) ? 2 : 0) ? x : b), null);
    if (st === null) break;
    if (!force && prix[st] + (enDemande(s, st) ? 2 : 0) + s.prixBonus < 2 && u + arrivent <= STOCK_MAX) break;
    v[st]++; prix[st] = Math.max(1, prix[st] - 1); u--; n++;
  }
  return n ? v : null;
}

/* ---------- investissements ---------- */

function meilleureAmelioration(s, pi) {
  const p = s.players[pi], rem = restantes(s) - 1, lvl = niveau(s), w = W(s);
  if (rem < 2) return null;
  const reserveArgent = lvl === 'maitre' ? 1 : 2;
  const busy = p.ferms.length >= p.nferm;
  let best = null;
  for (const u of ameliorationsPossibles(p)) {
    const cout = AMELIORATIONS[u].cout;
    if (cout > p.argent - reserveArgent) continue;
    if (lvl === 'apprenti' && !['cuve', 'ferm'].includes(u)) continue;
    const gain = {
      cuve: rem * 2.5,
      ferm: rem * (busy ? 1.8 : 0.5),
      touraille: rem * 1.2,
      embauche: rem * (lvl === 'maitre' ? 2.4 : 2.0),
      salle: rem * 1.3 + Math.floor(rem / 4) * w,
    }[u];
    if (gain - cout > 0 && (best === null || gain - cout > best.val)) best = { u, val: gain - cout };
  }
  return best;
}

/* ---------- échanges ---------- */

function utilite(s, pi, av) {
  const p = s.players[pi];
  let u = av.argent;
  for (const r of RES) u += av[r] * ACHAT[r] * 0.6;
  for (const st of STYLES) u += av[st] * (RECETTES[st].prix + W(s) * RECETTES[st].rep) * 0.7;
  const pl = plan(s, pi);
  if (pl) {
    const r = RECETTES[pl.st];
    const avant = RES.reduce((n, x) => n + Math.max(0, r[x] - p.res[x]), 0), apres = RES.reduce((n, x) => n + Math.max(0, r[x] - av[x]), 0);
    u += (avant - apres) * 2.5;
  }
  return u;
}
function accepte(s, pi, from, recoit, donne) {
  if (niveau(s) === 'apprenti') return false;
  const p = s.players[pi], av = avoirs(p);
  if (ITEMS.some((k) => av[k] < (donne[k] ?? 0))) return false;
  if (s.players[from].rep > p.rep + 10 && restantes(s) <= 4) return false;
  const apres = { ...av };
  ITEMS.forEach((k) => { apres[k] += (recoit[k] ?? 0) - (donne[k] ?? 0); });
  return utilite(s, pi, apres) - utilite(s, pi, av) > 0.3;
}
function proposition(s, pi) {
  const p = s.players[pi];
  if (niveau(s) === 'apprenti' || s.tradesThisTurn > 0 || s.trade) return null;
  const pl = plan(s, pi);
  if (!pl || pl.miss !== 1) return null;
  const need = RES.find((x) => pl.manque[x] > 0);
  const spare = RES.filter((x) => x !== need && p.res[x] - RECETTES[pl.st][x] >= 2);
  if (!spare.length) return null;
  const to = s.players.map((_, i) => i).filter((i) => i !== pi && s.players[i].offersOn && (s.players[i].ai || s.opts.aiOffersToHumans) && s.players[i].res[need] > 0);
  if (!to.length) return null;
  const give = ZI(), get = ZI();
  give[spare[0]] = 1; get[need] = 1;
  return { type: 'proposeTrade', give, get, to };
}

/* ---------- la pose ---------- */

function choixPose(s, pi) {
  const p = s.players[pi], lvl = niveau(s), w = W(s), rem = restantes(s);
  const poses = posesPossibles(s, pi);
  if (!poses.length) return null;
  const pl = plan(s, pi);
  const manque = pl ? pl.manque : Z();
  const opts = [];
  for (const t of poses) {
    const c = t.case;
    if (CASES[c].recolte) {
      const q = t.recolte;
      if (!q) continue;
      const need = manque[CASES[c].res] > 0;
      opts.push({ val: q * ACHAT[CASES[c].res] * (need ? 1.0 : 0.45) + rnd(s, pi, c) * 0.3, action: { type: 'poser', case: c } });
    } else if (c === 'marcheMat') {
      if (lvl === 'apprenti') continue;
      const ach = Z();
      let n = 0, cout = 0;
      for (const x of RES) while (manque[x] - ach[x] > 0 && n < ACHAT_MAX && p.argent - cout >= ACHAT[x]) { ach[x]++; n++; cout += ACHAT[x]; }
      if (!n) continue;
      const complet = RES.every((x) => manque[x] - ach[x] <= 0);
      opts.push({ val: n * 2.2 * (complet ? 1 : 0.5), action: { type: 'poser', case: c, achats: ach } });
    } else if (c === 'tournee') {
      const cl = meilleurClient(s, pi);
      if (cl) opts.push({ val: cl.val, action: { type: 'poser', case: c, client: cl.client, style: cl.style } });
    } else if (c === 'marcheBieres') {
      const v = ventes(s, pi, false);
      if (!v) continue;
      let val = 0;
      const prix = { ...s.prix };
      for (const st of STYLES) for (let k = 0; k < v[st]; k++) { val += prix[st] + (enDemande(s, st) ? 2 : 0); prix[st] = Math.max(1, prix[st] - 1); }
      val *= unites(p) >= 4 || p.argent < 3 ? 0.9 : 0.55;
      opts.push({ val, action: { type: 'poser', case: c, ventes: v } });
    } else if (c === 'chantier') {
      const am = meilleureAmelioration(s, pi);
      if (am) opts.push({ val: am.val, action: { type: 'poser', case: c, u: am.u } });
    }
  }
  void w; void rem;
  if (!opts.length) {
    // rien d'intéressant : on pose quand même, au plus simple, plutôt que de perdre l'ouvrier
    const t = poses[0];
    if (CASES[t.case].recolte) return { type: 'poser', case: t.case };
    if (t.case === 'marcheMat') return { type: 'poser', case: t.case, achats: { [RES.find((x) => p.argent >= ACHAT[x])]: 1 } };
    if (t.case === 'tournee') return { type: 'poser', case: t.case, client: t.clients[0].id, style: t.clients[0].styles[0] };
    if (t.case === 'marcheBieres') return { type: 'poser', case: t.case, ventes: { [t.styles[0]]: 1 } };
    return { type: 'poser', case: t.case, u: t.targets[0] };
  }
  opts.sort((x, y) => y.val - x.val);
  return opts[0].action;
}

/* ---------- décision ---------- */

export function aiAction(s, pi) {
  if (s.phase === 'over') return null;
  const p = s.players[pi];
  const L = legalActions(s, pi);
  const has = (type) => L.find((x) => x.type === type);

  const rt = has('respondTrade');
  if (rt && s.trade && s.trade.from !== pi) {
    const t = s.trade;
    if (rt.canAccept && accepte(s, pi, t.from, t.give, t.get)) return { type: 'respondTrade', accept: true };
    if (niveau(s) !== 'apprenti') {
      for (const x of RES) {
        if (!s.players[t.from].res[x] || t.get[x]) continue;
        const give = { ...t.give, [x]: (t.give[x] ?? 0) + 1 };
        if (rt.canAccept && accepte(s, pi, t.from, give, t.get)) return { type: 'respondTrade', counter: { give, get: t.get } };
      }
    }
    return { type: 'respondTrade', accept: false };
  }

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

  if (s.trade?.from === pi) {
    const t = s.trade;
    for (const [k, r] of Object.entries(t.resp).filter(([, r]) => r.s !== 'refuse')) {
      const give = r.s === 'counter' ? r.give : t.give, get = r.s === 'counter' ? r.get : t.get;
      if (r.s === 'accept' || accepte(s, pi, +k, get, give)) return { type: 'concludeTrade', with: +k };
    }
    if (Object.keys(t.resp).length < t.to.length) return null;
    return { type: 'cancelTrade' };
  }

  // 1. Brasser dès qu'on peut (gratuit)
  const br = has('brasser');
  if (br) {
    const pl = plan(s, pi);
    if (pl && pl.miss === 0 && br.styles.includes(pl.st)) return { type: 'brasser', style: pl.st };
  }
  // 2. Salle de dégustation
  const sa = has('salle');
  if (sa && unites(p) > reserve(s, pi)) return { type: 'salle', style: sa.styles.reduce((b, x) => (RECETTES[x].prix > RECETTES[b].prix ? x : b)) };
  // 3. Négocier s'il manque une matière (avant de poser)
  if (!s.place) { const prop = proposition(s, pi); if (prop) return prop; }
  // 4. Poser l'ouvrier
  if (has('poser')) { const act = choixPose(s, pi); if (act) return act; }
  // 5. Brasser encore si la pose a apporté ce qui manquait
  const br2 = has('brasser');
  if (br2 && s.place) { const pl = plan(s, pi); if (pl && pl.miss === 0 && br2.styles.includes(pl.st)) return { type: 'brasser', style: pl.st }; }
  if (has('endTurn')) return { type: 'endTurn' };
  return null;
}
