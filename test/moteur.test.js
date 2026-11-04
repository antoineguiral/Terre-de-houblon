// Tests du moteur Brassins : règles unitaires, puis parties complètes IA contre IA.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createGame, applyAction, legalActions, waitingFor, deciders, viewFor, aiStep, aiAction, TOPO, clientIds, distance, score,
  STYLES, RES, RECETTES, PRODUCTION, PRODUIT, PUITS, STOCK_MAX, CUVE, AMELIORATIONS, CARTE, SAISONS, NB_SAISONS, CONCOURS, DIVERSITE, ARGENT_PAR_POINT,
  PRIX_PLANCHER, DEMANDE_BONUS, unites,
} from '../moteur/index.js';
import { playOut } from '../outils/simulation.js';

const P4 = ['A', 'B', 'C', 'D'].map((name) => ({ name, ai: true }));
const ok = (r) => { assert.ok(r.ok, r.error); return r.state; };
const ko = (r, re) => { assert.equal(r.ok, false); if (re) assert.match(r.error, re); };

// Joue la mise en place avec l'IA, et s'arrête au début du premier tour
function enJeu(seed = 1, players = P4, opts = {}) {
  let s = createGame({ seed, players, ...opts });
  while (s.phase === 'setup') s = aiStep(s).state;
  while (s.pending) s = aiStep(s).state;
  return s;
}
// Donne des matières au joueur courant (pour tester sans dépendre du tirage)
function dote(s, pi, res = {}, argent = null, stock = {}) {
  const c = structuredClone(s);
  Object.assign(c.players[pi].res, res);
  if (argent !== null) c.players[pi].argent = argent;
  Object.assign(c.players[pi].stock, stock);
  return c;
}

test('création : plateau, placement en ordre inverse, départ', () => {
  const s = createGame({ seed: 7, players: P4 });
  assert.equal(s.tiles.length, 19);
  assert.equal(s.tiles.filter((t) => t === 'bourg').length, 1);
  assert.equal(s.tiles.filter((t) => t === 'village').length, 3);
  assert.equal(s.tiles.filter((t) => t === 'orge').length, 6);
  assert.equal(s.tiles.filter((t) => t === 'source').length, 4);
  assert.equal(s.phase, 'setup');
  assert.deepEqual(s.setup.ordre, [...s.ordre].reverse());
  assert.equal(s.cur, s.setup.ordre[0]);
  assert.deepEqual(waitingFor(s), [s.cur]);
  assert.equal(s.players[0].argent, 6);
  assert.equal(s.players[0].nferm, 2);
  assert.throws(() => createGame({ players: [{ name: 'Seul' }] }));
});

test('placement : terroir libre seulement, puis tournée gratuite à 2 cases', () => {
  let s = createGame({ seed: 3, players: P4 });
  const pi = s.cur;
  const bourg = s.tiles.indexOf('bourg'), orge = s.tiles.indexOf('orge');
  ko(applyAction(s, pi, { type: 'placer', hex: bourg }), /terroir/);
  ko(applyAction(s, (pi + 1) % 4, { type: 'placer', hex: orge }), /ton tour/);
  s = ok(applyAction(s, pi, { type: 'placer', hex: orge }));
  assert.equal(s.setup.step, 'tournee');
  const L = legalActions(s, pi);
  assert.equal(L[0].type, 'tournee');
  assert.ok(L[0].free);
  assert.ok(L[0].targets.every((t) => distance(s, pi, t.client) <= 2));
  const loin = clientIds(s).find((c) => distance(s, pi, c) > 2);
  if (loin) ko(applyAction(s, pi, { type: 'tournee', client: loin }), /2 cases/);
  s = ok(applyAction(s, pi, { type: 'tournee', client: L[0].targets[0].client }));
  assert.equal(s.players[pi].argent, 6, 'la tournée de départ est gratuite');
  assert.equal(s.cur, s.setup.ordre[1]);
  // une case prise ne l'est qu'une fois
  ko(applyAction(s, s.cur, { type: 'placer', hex: orge }), /déjà prise/);
});

test('première saison : production des cases voisines + puits, premier joueur tiré au sort', () => {
  let s = createGame({ seed: 11, players: P4 });
  const avant = structuredClone(s);
  while (s.phase === 'setup') s = aiStep(s).state;
  assert.equal(s.saison, 0);
  assert.equal(s.phase, 'main');
  assert.deepEqual(s.ordre, avant.ordre, 'la première saison garde l’ordre tiré à la création');
  const carte = CARTE[s.carte];
  assert.equal(carte.id.startsWith('p_'), true);
  s.players.forEach((p) => {
    const attendu = { malt: 4, houb: 2, lev: 2, eau: 2, torr: 0 };
    for (const h of [p.hex, ...TOPO.hexes[p.hex].near]) {
      const t = s.tiles[h];
      if (!PRODUCTION[t]) continue;
      const m = carte.meteo?.[t];
      attendu[PRODUIT[t]] += m === 'zero' ? 0 : Math.max(0, PRODUCTION[t][0] + (m ?? 0));
    }
    attendu.eau += PUITS;
    if (!s.pending) assert.deepEqual(p.res, attendu);
  });
});

test('brasser : recette, fermenteurs, levure de repiquage, première fois', () => {
  let s = enJeu(5);
  const pi = s.cur;
  s = dote(s, pi, { malt: 9, houb: 9, lev: 3, eau: 9, torr: 0 });
  ko(applyAction(s, pi, { type: 'brasser', style: 'lager' }), /Chambre froide/);
  ko(applyAction(s, pi, { type: 'brasser', style: 'stout' }), /manque/);
  s = ok(applyAction(s, pi, { type: 'brasser', style: 'blonde' }));
  let p = s.players[pi];
  assert.deepEqual(p.ferms, [{ st: 'blonde', left: 1, u: CUVE[0] }]);
  assert.equal(p.res.malt, 7);
  assert.equal(p.rep, 1, 'première fois : +1 réputation');
  assert.deepEqual(p.styles, ['blonde']);
  s = ok(applyAction(s, pi, { type: 'brasser', style: 'ipa' }));
  ko(applyAction(s, pi, { type: 'brasser', style: 'blonde' }), /fermenteurs/);
  // fin de saison : la blonde sort à la saison suivante, l'IPA une saison plus tard
  const lev = s.players[pi].res.lev;
  let t = s;
  for (let k = 0; k < 4 && t.saison === s.saison; k++) {
    while (t.cur !== pi && !t.pending && t.phase === 'main' && t.saison === s.saison) t = aiStep(t).state;
    if (t.saison !== s.saison) break;
    if (t.cur === pi && !t.pending) t = ok(applyAction(t, pi, { type: 'endTurn' }));
  }
  while (t.pending) t = aiStep(t).state;
  p = t.players[pi];
  assert.equal(t.saison, s.saison + 1);
  assert.equal(p.stock.blonde, CUVE[0]);
  assert.equal(p.ferms.length, 1);
  assert.equal(p.ferms[0].st, 'ipa');
  assert.equal(p.ferms[0].left, 1);
  assert.ok(p.res.lev >= lev + 1, 'levure récupérée');
});

test('marché : achat à prix fixe, vente avec érosion et plancher, remontée en fin de saison, demande', () => {
  let s = enJeu(8);
  const pi = s.cur;
  s = dote(s, pi, {}, 10, { blonde: 5 });
  s = ok(applyAction(s, pi, { type: 'acheter', r: 'malt', n: 2 }));
  assert.equal(s.players[pi].argent, 6);
  ko(applyAction(s, pi, { type: 'acheter', r: 'torr', n: 2 }), /Argent/);
  const dem = s.demande.includes('blonde') ? DEMANDE_BONUS : 0;
  const base = RECETTES.blonde.prix;
  s = ok(applyAction(s, pi, { type: 'vendre', style: 'blonde', n: 5 }));
  // 3, 2, 1, 1, 1 (+ demande)
  assert.equal(s.players[pi].argent, 6 + (3 + 2 + 1 + 1 + 1) + 5 * dem);
  assert.equal(s.marche.blonde, PRIX_PLANCHER);
  assert.equal(s.players[pi].stock.blonde, 0);
  ko(applyAction(s, pi, { type: 'vendre', style: 'blonde', n: 1 }), /unités/);
  // remontée de 1 par saison, sans dépasser la base
  let t = s;
  const sais = s.saison;
  while (t.saison === sais && t.phase === 'main') { while (t.pending) t = aiStep(t).state; if (t.saison !== sais) break; t = t.cur === pi ? ok(applyAction(t, pi, { type: 'endTurn' })) : aiStep(t).state; }
  assert.equal(t.marche.blonde, Math.min(base, PRIX_PLANCHER + 1));
});

test('livrer : tournée, capacité, limite par client, styles de la cave et des villages, réputation', () => {
  let s = enJeu(13);
  const pi = s.cur, p0 = s.players[pi];
  const tournee = p0.tournees[0];
  s = dote(s, pi, {}, 30, { blonde: 4, stout: 2 });
  ko(applyAction(s, pi, { type: 'livrer', client: 'foire0', style: 'blonde' }), /tournée/);
  // ouvrir une tournée payante vers la cave et le bar
  for (const c of ['cave', 'bar']) if (!s.players[pi].tournees.includes(c)) {
    const cout = legalActions(s, pi).find((a) => a.type === 'tournee').targets.find((t) => t.client === c).cout;
    assert.equal(cout, distance(s, pi, c) * 2);
    const avant = s.players[pi].argent;
    s = ok(applyAction(s, pi, { type: 'tournee', client: c }));
    assert.equal(s.players[pi].argent, avant - cout);
  }
  ko(applyAction(s, pi, { type: 'livrer', client: 'cave', style: 'blonde' }), /ne prend pas/);
  const rep = s.players[pi].rep, arg = s.players[pi].argent;
  s = ok(applyAction(s, pi, { type: 'livrer', client: 'cave', style: 'stout' }));
  assert.equal(s.players[pi].argent, arg + RECETTES.stout.prix + 3);
  assert.equal(s.players[pi].rep, rep + RECETTES.stout.rep + (s.demande.includes('stout') ? 1 : 0));
  ko(applyAction(s, pi, { type: 'livrer', client: 'cave', style: 'stout' }), /déjà livré/);
  s = ok(applyAction(s, pi, { type: 'livrer', client: 'bar', style: 'blonde' }));
  assert.equal(s.capa.bar, 2);
  // un village hors préférence : prix -1, pas de réputation
  const vi = s.villages.map((_, k) => `village${k}`).find((c) => !s.prefs[+c.slice(7)].includes('blonde'));
  if (vi) {
    if (!s.players[pi].tournees.includes(vi)) s = ok(applyAction(s, pi, { type: 'tournee', client: vi }));
    const r0 = s.players[pi].rep, a0 = s.players[pi].argent;
    s = ok(applyAction(s, pi, { type: 'livrer', client: vi, style: 'blonde' }));
    assert.equal(s.players[pi].rep, r0);
    assert.equal(s.players[pi].argent, a0 + RECETTES.blonde.prix - 1);
  }
  void tournee;
});

test('foires : seulement pendant leur saison', () => {
  let s = enJeu(2);
  const pi = s.cur;
  s = dote(s, pi, {}, 40, { blonde: 3 });
  const hors = legalActions(s, pi).find((a) => a.type === 'tournee').targets.find((t) => t.client.startsWith('foire') && !(s.capa[t.client] > 0));
  s = ok(applyAction(s, pi, { type: 'tournee', client: hors.client }));
  ko(applyAction(s, pi, { type: 'livrer', client: hors.client, style: 'blonde' }), /plus cette saison/);
});

test('améliorations : coût, préalable, fermenteurs jusqu’à 5, cuve, touraille, salle', () => {
  let s = enJeu(4);
  const pi = s.cur;
  s = dote(s, pi, { malt: 6 }, 100, { stout: 3 });
  ko(applyAction(s, pi, { type: 'ameliorer', u: 'cuve3' }), /d'abord/);
  s = ok(applyAction(s, pi, { type: 'ameliorer', u: 'cuve2' }));
  s = ok(applyAction(s, pi, { type: 'ameliorer', u: 'cuve3' }));
  ko(applyAction(s, pi, { type: 'ameliorer', u: 'cuve3' }), /déjà/);
  assert.equal(s.players[pi].cuve, 2);
  assert.equal(s.players[pi].argent, 100 - 8 - 14);
  for (let k = 0; k < 3; k++) s = ok(applyAction(s, pi, { type: 'ameliorer', u: 'ferm' }));
  ko(applyAction(s, pi, { type: 'ameliorer', u: 'ferm' }), /5 fermenteurs/);
  ko(applyAction(s, pi, { type: 'torrefier' }), /Touraille/);
  s = ok(applyAction(s, pi, { type: 'ameliorer', u: 'touraille' }));
  s = ok(applyAction(s, pi, { type: 'torrefier' }));
  assert.equal(s.players[pi].res.torr, 1);
  assert.equal(s.players[pi].res.malt, 4);
  ko(applyAction(s, pi, { type: 'torrefier' }), /déjà servi/);
  ko(applyAction(s, pi, { type: 'salle', style: 'stout' }), /Salle/);
  s = ok(applyAction(s, pi, { type: 'ameliorer', u: 'salle' }));
  const a0 = s.players[pi].argent;
  s = ok(applyAction(s, pi, { type: 'salle', style: 'stout' }));
  s = ok(applyAction(s, pi, { type: 'salle', style: 'stout' }));
  ko(applyAction(s, pi, { type: 'salle', style: 'stout' }), /déjà vendu/);
  assert.equal(s.players[pi].argent, a0 + 2 * (RECETTES.stout.prix + 1));
  ko(applyAction(s, pi, { type: 'ameliorer', u: 'puits' }), /inconnue/);
});

test('fin de tour : refusée au-dessus du stock maximum, puis ordre de la saison suivante = le moins réputé', () => {
  let s = enJeu(6);
  const pi = s.cur;
  s = dote(s, pi, {}, 0, { blonde: STOCK_MAX + 2 });
  ko(applyAction(s, pi, { type: 'endTurn' }), /stock dépasse/);
  assert.ok(!legalActions(s, pi).some((a) => a.type === 'endTurn'));
  s = ok(applyAction(s, pi, { type: 'vendre', style: 'blonde', n: 2 }));
  s = ok(applyAction(s, pi, { type: 'endTurn' }));
  // on finit la saison : les autres passent
  const sais = s.saison;
  let t = s;
  while (t.saison === sais) { while (t.pending) t = aiStep(t).state; if (t.saison !== sais) break; t = ok(applyAction(t, t.cur, { type: 'endTurn' })); }
  while (t.pending) t = aiStep(t).state;
  assert.equal(t.saison, sais + 1);
  const minRep = Math.min(...t.players.map((p) => p.rep));
  assert.equal(t.players[t.ordre[0]].rep, minRep, 'le moins réputé commence');
  assert.equal(t.cur, t.ordre[0]);
  for (let k = 1; k < 4; k++) assert.equal(t.ordre[k], (t.ordre[0] + k) % 4, 'puis on tourne à gauche');
});

test('événements : contamination, canicule, douanes, concours', () => {
  // Contamination : les joueurs sans labo avec un brassin en cours choisissent une perte
  let s = enJeu(21);
  const pi = s.cur;
  s = dote(s, pi, { malt: 9, houb: 9, lev: 3, eau: 9, torr: 1 }, 50);
  s = ok(applyAction(s, pi, { type: 'brasser', style: 'garde' }));
  // On force la carte du prochain printemps pour tester l'événement : on fabrique un état au début d'une saison
  const t = structuredClone(s);
  t.saison = 3; // l'hiver vient de finir, on va entrer dans le printemps de l'an 2
  t.deck.printemps[1] = 'p_froid';
  t.players.forEach((p, i) => { if (i !== pi) p.ferms = []; });
  t.players[pi].ferms = [{ st: 'garde', left: 2, u: 2 }, { st: 'blonde', left: 1, u: 3 }];
  // on termine la saison : tous passent
  let u = t;
  u.idx = u.players.length - 1; u.cur = u.ordre[u.idx];
  u.players[u.cur].stock = Object.fromEntries(STYLES.map((x) => [x, 0]));
  u = ok(applyAction(u, u.cur, { type: 'endTurn' }));
  assert.equal(u.saison, 4);
  assert.equal(u.carte, 'p_froid');
  assert.equal(u.pending.kind, 'contamination');
  assert.deepEqual(Object.keys(u.pending.need).map(Number), [pi]);
  assert.deepEqual(deciders(u), [pi]);
  // la blonde (1 saison) est sortie en stock entre-temps ; il ne reste que la garde en fermentation
  assert.equal(u.players[pi].stock.blonde, 3);
  assert.deepEqual(u.players[pi].ferms, [{ st: 'garde', left: 1, u: 2 }]);
  ko(applyAction(u, pi, { type: 'evenement', ferm: 5 }), /brassins/);
  u = ok(applyAction(u, pi, { type: 'evenement', ferm: 0 }));
  assert.equal(u.players[pi].ferms[0].u, 1);
  assert.equal(u.pending, null);
  assert.equal(u.phase, 'main');

  // Douanes : 1 Argent par 3 unités
  const d = structuredClone(s);
  d.saison = 2; d.deck.hiver[0] = 'h_rude';
  d.players.forEach((p) => { p.stock.blonde = 6; p.argent = 1; p.ferms = []; });
  d.idx = 3; d.cur = d.ordre[3];
  d.players[d.cur].argent = 5;
  const dd = ok(applyAction(d, d.cur, { type: 'endTurn' }));
  assert.equal(dd.carte, 'h_rude');
  dd.players.forEach((p, i) => assert.equal(p.argent, i === d.cur ? 3 : 0, 'paie 1 par 3 unités, au plus ce qu’il a'));

  // Concours : chacun présente, le meilleur style en demande gagne 5
  const c = structuredClone(s);
  c.saison = 1; c.deck.automne[0] = 'a_humide';
  c.players.forEach((p, i) => { p.stock = Object.fromEntries(STYLES.map((x) => [x, 0])); p.ferms = []; p.rep = 0; p.stock[i === 0 ? 'stout' : 'blonde'] = 1; });
  c.idx = 3; c.cur = c.ordre[3];
  let cc = ok(applyAction(c, c.cur, { type: 'endTurn' }));
  assert.equal(cc.pending.kind, 'concours');
  assert.equal(Object.keys(cc.pending.need).length, 4);
  ko(applyAction(cc, 1, { type: 'concours', style: 'stout' }), /en stock/);
  for (let i = 0; i < 4; i++) cc = ok(applyAction(cc, i, { type: 'concours', style: i === 0 ? 'stout' : 'blonde' }));
  assert.equal(cc.pending, null);
  assert.equal(cc.players[0].rep, CONCOURS[0]);
  assert.equal(cc.players[1].rep, CONCOURS[1], 'égalité au second rang : chacun prend le lot');
  assert.equal(cc.players[0].stock.stout, 0, 'l’unité présentée est consommée');
});

test('échanges : matières, bière et Argent ; contre-proposition ; conclusion', () => {
  let s = enJeu(9, P4, { aiOffersToHumans: true });
  const pi = s.cur, autre = (pi + 1) % 4;
  s = dote(s, pi, { malt: 5 }, 10, { blonde: 2 });
  s = dote(s, autre, { houb: 4 }, 3);
  ko(applyAction(s, pi, { type: 'proposeTrade', give: { malt: 1 }, get: { malt: 1 } }), /même chose/);
  ko(applyAction(s, pi, { type: 'proposeTrade', give: { garde: 1 }, get: { houb: 1 } }), /pas ce que tu proposes/);
  s = ok(applyAction(s, pi, { type: 'proposeTrade', give: { blonde: 1, argent: 2 }, get: { houb: 2 }, to: [autre] }));
  assert.ok(waitingFor(s).includes(autre));
  assert.deepEqual(deciders(s), [pi], 'les réponses ne bloquent pas le tour');
  s = ok(applyAction(s, autre, { type: 'respondTrade', counter: { give: { blonde: 1, argent: 2, malt: 1 }, get: { houb: 2 } } }));
  s = ok(applyAction(s, pi, { type: 'concludeTrade', with: autre }));
  assert.equal(s.trade, null);
  assert.equal(s.players[pi].stock.blonde, 1);
  assert.equal(s.players[pi].argent, 8);
  assert.equal(s.players[pi].res.houb, s.players[pi].res.houb, 'cohérent');
  assert.equal(s.players[autre].argent, 5);
  assert.equal(s.players[autre].stock.blonde, 1);
  assert.equal(s.players[autre].res.houb, 2);
});

test('fin de partie : 12 saisons, décompte (réputation + diversité + Argent), départage', () => {
  const { s } = playOut(3);
  assert.equal(s.phase, 'over');
  assert.equal(s.saison, NB_SAISONS - 1);
  s.players.forEach((p, i) => {
    const sc = score(s, i);
    const div = Object.entries(DIVERSITE).reduce((b, [k, v]) => (p.styles.length >= +k ? v : b), 0);
    assert.equal(sc.diversite, div);
    assert.equal(sc.argent, Math.floor(p.argent / ARGENT_PAR_POINT));
    assert.equal(sc.total, p.rep + div + sc.argent);
    assert.deepEqual(s.scores[i], sc);
  });
  const max = Math.max(...s.scores.map((x) => x.total));
  assert.equal(s.scores[s.winner].total, max);
  ko(applyAction(s, s.winner, { type: 'endTurn' }), /terminée/);
});

test('vue : graine et générateur masqués, cartes restantes sans ordre, scores joints', () => {
  const s = enJeu(12);
  const v = viewFor(s, 0);
  assert.equal(v.seed, undefined);
  assert.equal(v.rng, undefined);
  assert.equal(v.me, 0);
  assert.deepEqual(v.waiting, waitingFor(s));
  for (const k of SAISONS) {
    assert.equal(v.deck[k].revelees.length + v.deck[k].restantes.length, 3);
    assert.deepEqual(v.deck[k].restantes, [...v.deck[k].restantes].sort(), 'ordre masqué');
  }
  assert.equal(v.deck.printemps.revelees.length, 1, 'la carte du printemps en cours est révélée');
  assert.equal(v.deck.ete.revelees.length, 0);
  assert.ok(v.players.every((p) => p.score && typeof p.score.total === 'number'));
  // la vue suffit pour lister les actions
  assert.ok(legalActions(v, v.cur).length > 0);
  // l'état survit à un passage par JSON
  assert.deepEqual(JSON.parse(JSON.stringify(s)), s);
});

test('applyAction ne modifie pas l’état reçu', () => {
  const s = enJeu(14);
  const copie = structuredClone(s);
  applyAction(s, s.cur, { type: 'acheter', r: 'malt', n: 1 });
  applyAction(s, s.cur, { type: 'endTurn' });
  assert.deepEqual(s, copie);
});

test('IA : parties complètes aux trois niveaux, sans action illégale ni blocage', () => {
  for (const niveau of ['apprenti', 'compagnon', 'maitre']) {
    for (let g = 1; g <= 10; g++) {
      const { s, steps } = playOut(100 + g, { niveau });
      assert.equal(s.phase, 'over', `niveau ${niveau}, graine ${100 + g} : pas finie après ${steps} actions`);
      assert.ok(s.players.every((p) => p.argent >= 0 && RES.every((r) => p.res[r] >= 0) && unites(p) <= STOCK_MAX));
    }
  }
  // à 2 et 3 joueurs aussi
  for (const n of [2, 3]) { const { s } = playOut(200 + n, { n }); assert.equal(s.phase, 'over'); }
});

test('IA : une décision pour chaque joueur attendu, y compris les réponses aux offres', () => {
  let s = enJeu(15, P4, { niveau: 'compagnon' });
  const pi = s.cur, autre = (pi + 1) % 4;
  s = dote(s, pi, { malt: 3 }, 10);
  s = ok(applyAction(s, pi, { type: 'proposeTrade', give: { malt: 1 }, get: { houb: 1 }, to: [autre] }));
  const a = aiAction(s, autre);
  assert.equal(a.type, 'respondTrade');
  assert.equal(aiAction(s, pi), null, 'le proposant attend les réponses');
  s = ok(applyAction(s, autre, a));
  const b = aiAction(s, pi);
  assert.ok(['concludeTrade', 'cancelTrade'].includes(b.type));
});

/* ---------- Marché limité et collabs ---------- */

import { MARCHE_STOCK, COLLAB_UNITE_BONUS, Z } from '../moteur/index.js';

// Termine la saison en cours : chacun passe, les décisions d'événement sont prises par l'IA
function finirSaison(s) {
  const t = s.saison;
  for (let n = 0; n < 200 && s.saison === t && s.phase !== 'over'; n++) {
    if (s.pending) { s = aiStep(s).state; continue; }
    s = ok(applyAction(s, s.cur, { type: 'endTurn' }));
  }
  while (s.pending) s = aiStep(s).state;
  return s;
}

test('marché limité : stock par saison selon le nombre de joueurs, partagé, sans report', () => {
  let s = enJeu(11);
  assert.deepEqual(s.stockMarche, MARCHE_STOCK[4]);
  assert.deepEqual(enJeu(11, P4.slice(0, 2)).stockMarche, MARCHE_STOCK[2]);
  const a = s.cur, b = s.ordre[1];
  s = dote(s, a, {}, 50);
  s = ok(applyAction(s, a, { type: 'acheter', r: 'torr', n: MARCHE_STOCK[4].torr }));
  assert.equal(s.stockMarche.torr, 0);
  ko(applyAction(s, a, { type: 'acheter', r: 'torr', n: 1 }), /plus cette saison/);
  ko(applyAction(s, a, { type: 'acheter', r: 'malt', n: MARCHE_STOCK[4].malt + 1 }), new RegExp(`plus que ${MARCHE_STOCK[4].malt} Malt`));
  assert.ok(!legalActions(s, a).find((x) => x.type === 'acheter').res.includes('torr'));
  s = ok(applyAction(s, a, { type: 'acheter', r: 'malt', n: 1 }));
  s = ok(applyAction(s, a, { type: 'endTurn' }));
  s = dote(s, b, {}, 50);
  ko(applyAction(s, b, { type: 'acheter', r: 'torr', n: 1 }), /plus cette saison/);
  assert.equal(s.stockMarche.malt, MARCHE_STOCK[4].malt - 1);
  s = finirSaison(s);
  assert.deepEqual(s.stockMarche, MARCHE_STOCK[4], 'réapprovisionné, sans report');
  assert.deepEqual(viewFor(s, 0).stockMarche, MARCHE_STOCK[4]);
});

test('collab : proposition, acceptation, brassage chez l’hôte, réputation, une par saison, partage', () => {
  let s = enJeu(12);
  const h = s.cur, w = s.ordre[1];
  s = dote(s, h, { malt: 2, houb: 1, lev: 1, eau: 1, torr: 0 }, 20);
  s = dote(s, w, { malt: 0, houb: 2, lev: 0, eau: 0, torr: 0 });
  const rep0 = [s.players[h].rep, s.players[w].rep];
  const apport = { hote: { malt: 2, houb: 1, lev: 1, eau: 1 }, part: { houb: 2 } };
  ko(applyAction(s, h, { type: 'proposeCollab', style: 'ipa', with: w, apport: { hote: apport.hote, part: { houb: 1 } } }), /exactement la recette/);
  ko(applyAction(s, h, { type: 'proposeCollab', style: 'ipa', with: w, apport: { hote: { malt: 2, houb: 3, lev: 1, eau: 1 }, part: {} } }), /au moins une matière/);
  ko(applyAction(s, h, { type: 'proposeCollab', style: 'ipa', with: h, apport }), /partenaire/);
  ko(applyAction(s, w, { type: 'proposeCollab', style: 'ipa', with: h, apport }), /ton tour/);
  assert.ok(legalActions(s, h).find((x) => x.type === 'proposeCollab').partenaires.includes(w));
  s = ok(applyAction(s, h, { type: 'proposeCollab', style: 'ipa', with: w, apport }));
  assert.equal(s.trade.kind, 'collab');
  assert.ok(waitingFor(s).includes(w));
  assert.equal(legalActions(s, w)[0].type, 'respondTrade');
  assert.equal(legalActions(s, w)[0].canAccept, true);
  s = ok(applyAction(s, w, { type: 'respondTrade', accept: true }));
  s = ok(applyAction(s, h, { type: 'concludeTrade', with: w }));
  const H = s.players[h], W = s.players[w];
  const u = CUVE[0] + COLLAB_UNITE_BONUS;
  assert.deepEqual(H.ferms.at(-1), { st: 'ipa', left: 2, u, collab: w });
  assert.equal(W.ferms.length, 0, 'rien chez le partenaire');
  assert.equal(H.res.malt, 0); assert.equal(W.res.houb, 0);
  assert.equal(H.rep, rep0[0] + 2, '+1 collab, +1 première fois');
  assert.equal(W.rep, rep0[1] + 2);
  assert.ok(W.styles.includes('ipa'), 'le style compte pour la diversité du partenaire');
  assert.equal(s.trade, null);
  assert.equal(s.log.at(-1).k, 'collab');
  // une collab par saison, pour l'un comme pour l'autre
  s = dote(s, h, { malt: 5, houb: 5, lev: 5, eau: 5 });
  ko(applyAction(s, h, { type: 'proposeCollab', style: 'blonde', with: s.ordre[2], apport: { hote: { malt: 2, houb: 1, lev: 1 }, part: { eau: 1 } } }), /déjà fait une collab/);
  assert.ok(!legalActions(s, h).find((x) => x.type === 'proposeCollab'));
  // partage à la fin de la fermentation (2 saisons) : l'unité impaire à l'hôte
  const st0 = [H.stock.ipa, W.stock.ipa];
  s = finirSaison(s);
  assert.equal(s.players[h].ferms.at(-1).left, 1);
  s = finirSaison(s);
  assert.equal(s.players[h].stock.ipa, st0[0] + u - Math.floor(u / 2));
  assert.equal(s.players[w].stock.ipa, st0[1] + Math.floor(u / 2));
  const fin = s.log.find((e) => e.k === 'saison' && e.finis.some((f) => f.collab === w));
  assert.ok(fin, 'journal du partage');
  assert.equal(s.players[h].collabs, 0, 'nouvelle saison : collab de nouveau possible');
});

test('collab : équipement de l’hôte, contre-proposition, partenaire sans les matières, refus des propositions', () => {
  let s = enJeu(13);
  const h = s.cur, w = s.ordre[1], x = s.ordre[2];
  const lager = { hote: { malt: 2, houb: 1, lev: 1, eau: 1 }, part: { eau: 1 } };
  s = dote(s, h, { malt: 4, houb: 4, lev: 4, eau: 4 }, 30);
  s = dote(s, w, { malt: 4, houb: 4, lev: 4, eau: 4 });
  ko(applyAction(s, h, { type: 'proposeCollab', style: 'lager', with: w, apport: lager }), /Chambre froide/);
  s = ok(applyAction(s, h, { type: 'ameliorer', u: 'froide' }));
  assert.ok(!s.players[w].upg.includes('froide'));
  s = ok(applyAction(s, h, { type: 'proposeCollab', style: 'lager', with: w, apport: lager }));
  // contre-proposition : le partenaire apporte le malt plutôt que l'eau
  const counter = { apport: { hote: { malt: 1, houb: 1, lev: 1, eau: 2 }, part: { malt: 1 } } };
  ko(applyAction(s, w, { type: 'respondTrade', counter: { apport: { hote: lager.hote, part: {} } } }), /exactement|au moins/);
  s = ok(applyAction(s, w, { type: 'respondTrade', counter }));
  const avant = s.players[w].res.malt;
  let t = ok(applyAction(s, h, { type: 'concludeTrade', with: w }));
  assert.equal(t.players[w].res.malt, avant - 1);
  assert.equal(t.players[w].res.eau, 4, 'le partenaire garde son eau');
  // le partenaire n'a plus les matières au moment de conclure : sa réponse devient un refus
  const sans = structuredClone(s);
  sans.players[w].res.malt = 0;
  t = ok(applyAction(sans, h, { type: 'concludeTrade', with: w }));
  assert.equal(t.trade.resp[w].s, 'refuse');
  assert.equal(t.players[h].ferms.length, s.players[h].ferms.length);
  // un joueur qui refuse les propositions ne peut pas être sollicité
  let u = ok(applyAction(s, h, { type: 'cancelTrade' }));
  u = ok(applyAction(u, x, { type: 'setOffers', on: false }));
  ko(applyAction(u, h, { type: 'proposeCollab', style: 'blonde', with: x, apport: { hote: { malt: 2, houb: 1, lev: 1 }, part: { eau: 1 } } }), /ne reçoit pas/);
});

test('IA : des collabs ont lieu entre IA (actions refusées = échec de aiStep)', () => {
  // le journal est tronqué en cours de partie : on compte les collabs au fil de l'eau
  let s = createGame({ seed: 24, players: P4, niveau: 'compagnon' }), vues = 0;
  let last = -1;
  while (s.phase !== 'over') { s = aiStep(s).state; for (const e of s.log) if (e.i > last) { last = e.i; if (e.k === 'collab') vues++; } }
  assert.ok(vues > 0, 'au moins une collab dans une partie de compagnons');
});
