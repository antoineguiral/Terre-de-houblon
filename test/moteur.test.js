// Tests du moteur Brassins (version table) : règles unitaires, puis parties complètes IA contre IA.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createGame, applyAction, legalActions, waitingFor, deciders, viewFor, aiStep, aiAction, score, unites,
  STYLES, RES, RECETTES, CASES, STOCK_MAX, CUVE, AMELIORATIONS, NB_SAISONS, FIN_REP, FILE, DEPART, REP_DERNIER, SAISONS, DEMANDE, CONCOURS, EVT, EVENEMENTS,
  OBJECTIFS, OUVRIERS_DEPART, CLIENTS,
} from '../moteur/index.js';
import { playOut } from '../outils/simulation.js';

const P4 = ['A', 'B', 'C', 'D'].map((name) => ({ name, ai: true }));
const ok = (r) => { assert.ok(r.ok, r.error); return r.state; };
const ko = (r, re) => { assert.equal(r.ok, false); if (re) assert.match(r.error, re); };
// Une partie au début d'une saison sans décision en attente, avec le joueur courant prêt à poser
function prete(seed = 1, opts = {}) {
  let s = createGame({ seed, players: P4, ...opts });
  while (s.pending) s = aiStep(s).state;
  return s;
}
function dote(s, pi, { res = {}, argent = null, stock = {}, upg = null } = {}) {
  const c = structuredClone(s);
  Object.assign(c.players[pi].res, res);
  if (argent !== null) c.players[pi].argent = argent;
  Object.assign(c.players[pi].stock, stock);
  if (upg) c.players[pi].upg = upg;
  return c;
}
// Force les dés de la saison courante (météo normale, pas d'événement) pour des tests déterministes
function calme(s) { const c = structuredClone(s); c.meteo = 3; c.evt = null; c.ferme = []; c.prixBonus = 0; c.critique = false; c.invite = false; c.pending = null; c.prixMatiere = null; c.bonusKind = null; c.marcheFixe = false; c.recolteBonus = {}; return c; }

test('création : objectifs à choisir, puis première saison lancée, dés, file de clients, départ, dernier joueur +1 Réputation', () => {
  let s = createGame({ seed: 7, players: P4 });
  assert.equal(s.phase, 'main');
  assert.equal(s.saison, -1, 'la saison attend le choix des objectifs');
  assert.equal(s.pending.type, 'objectif');
  assert.deepEqual(waitingFor(s), [0, 1, 2, 3]);
  s.players.forEach((p) => assert.equal(p.objectifs.length, 2));
  const v = viewFor(s, 0);
  assert.equal(typeof v.players[1].objectifs, 'number', 'les cartes des autres sont cachées');
  ko(applyAction(s, 0, { type: 'objectif', garde: 'xyz' }), /parmi/);
  ko(applyAction(s, 0, { type: 'poser', case: 'champA' }), /attente/);
  const choix = s.players[0].objectifs[1];
  s = ok(applyAction(s, 0, { type: 'objectif', garde: choix }));
  assert.equal(s.players[0].objectif, choix);
  assert.equal(viewFor(s, 1).players[0].objectif, true, 'le choix des autres reste secret');
  while (s.pending) s = aiStep(s).state;
  assert.equal(s.saison, 0);
  assert.ok(s.meteo >= 1 && s.meteo <= 6 && s.de >= 1 && s.de <= 6);
  assert.equal(s.evt, EVENEMENTS.printemps[s.de], 'une face, un événement');
  assert.deepEqual(s.demande, DEMANDE.printemps);
  assert.ok(s.file.length >= FILE);
  assert.equal(s.file.length + s.deck.length + (s.evt === 'mairie' ? -1 : 0), CLIENTS.length);
  s.players.forEach((p, i) => {
    assert.deepEqual(p.res, DEPART.res);
    assert.equal(p.argent, DEPART.argent);
    assert.equal(p.ouv, OUVRIERS_DEPART);
    assert.equal(p.rep, i === (s.first + 3) % 4 ? REP_DERNIER : 0);
  });
  assert.throws(() => createGame({ players: [{ name: 'Seul' }] }));
  // sans objectifs : la saison démarre tout de suite
  assert.equal(createGame({ seed: 7, players: P4, objectifs: false }).saison, 0);
});

test('poser : une case prise est prise, un deuxième ouvrier sur un champ récolte un de moins, hiver fermé', () => {
  let s = calme(prete(3));
  const a = s.cur, b = (a + 1) % 4;
  const L = legalActions(s, a);
  const pose = L.find((x) => x.type === 'poser');
  assert.ok(pose.targets.some((t) => t.case === 'champA'));
  const q = pose.targets.find((t) => t.case === 'champA').recolte;
  assert.equal(q, CASES.champA.recolte[0]);
  ko(applyAction(s, b, { type: 'poser', case: 'champA' }), /ton tour/);
  s = ok(applyAction(s, a, { type: 'poser', case: 'champA' }));
  assert.equal(s.players[a].res.malt, DEPART.res.malt + q);
  ko(applyAction(s, a, { type: 'poser', case: 'champB' }), /déjà posé/);
  s = ok(applyAction(s, a, { type: 'endTurn' }));
  assert.equal(s.cur, b);
  // deuxième ouvrier sur le même champ : un de moins
  const t2 = legalActions(s, b).find((x) => x.type === 'poser').targets.find((t) => t.case === 'champA');
  assert.equal(t2.recolte, q - 1);
  s = ok(applyAction(s, b, { type: 'poser', case: 'champA' }));
  s = ok(applyAction(s, b, { type: 'endTurn' }));
  ko(applyAction(s, s.cur, { type: 'poser', case: 'champA' }), /prise/);
  // hiver : champs fermés
  const h = structuredClone(s); h.saison = 3; h.meteo = 6;
  assert.ok(!legalActions(h, h.cur).find((x) => x.type === 'poser').targets.some((t) => CASES[t.case].recolte));
});

test('brasser : gratuit, recette, dé de brassage, fermenteur occupé, première fois, Stout sans Touraille refusé', () => {
  let s = calme(prete(5));
  const pi = s.cur;
  s = dote(s, pi, { res: { malt: 9, houb: 9 } });
  ko(applyAction(s, pi, { type: 'brasser', style: 'stout' }), /Touraille/);
  s = ok(applyAction(s, pi, { type: 'brasser', style: 'blonde' }));
  const f = s.players[pi].ferms[0];
  assert.equal(f.st, 'blonde'); assert.equal(f.left, 1);
  assert.ok([CUVE[0] - 1, CUVE[0], CUVE[0] + 1].includes(f.u), 'dé de brassage : −1, 0 ou +1');
  const e = s.log.at(-1);
  assert.equal(e.k, 'brasser'); assert.ok(e.de >= 1 && e.de <= 6);
  assert.equal(f.u, CUVE[0] + (e.de === 1 ? -1 : e.de === 6 ? 1 : 0));
  assert.equal(s.players[pi].res.malt, 7);
  assert.equal(s.players[pi].rep - (pi === (s.first + 3) % 4 ? 1 : 0), 1, 'première fois : +1');
  s = ok(applyAction(s, pi, { type: 'brasser', style: 'garde' }));
  ko(applyAction(s, pi, { type: 'brasser', style: 'blonde' }), /fermenteurs/);
  assert.equal(s.place, false, 'brasser ne consomme pas la pose');
  // brasseur invité : le Stout passe sans Touraille
  const inv = structuredClone(dote(s, pi, { res: { malt: 9, houb: 9 } })); inv.invite = true; inv.players[pi].ferms = [];
  ok(applyAction(inv, pi, { type: 'brasser', style: 'stout' }));
});

test('fin de tour : refusée tant qu’une pose est possible ; passer perd l’ouvrier', () => {
  let s = calme(prete(8));
  const pi = s.cur;
  ko(applyAction(s, pi, { type: 'endTurn' }), /Pose d’abord/);
  // plus aucune case jouable : tout fermé sauf les cases qui demandent de l'argent ou du stock
  const c = structuredClone(s);
  c.ferme = ['champA', 'champB', 'houbA', 'houbB', 'marcheMat', 'tournee'];
  c.players[pi].argent = 0; c.players[pi].stock = Object.fromEntries(STYLES.map((x) => [x, 0]));
  assert.ok(legalActions(c, pi).find((x) => x.type === 'endTurn')?.passe);
  const d = ok(applyAction(c, pi, { type: 'endTurn' }));
  assert.equal(d.restants[pi], 0);
  assert.ok(d.log.some((e) => e.k === 'passe' && e.p === pi));
});

test('marché aux matières : jusqu’à 3, payées ; marché aux bières : prix érodé pour tous, plancher', () => {
  let s = calme(prete(9));
  const pi = s.cur;
  s = dote(s, pi, { argent: 10, stock: { blonde: 5 } });
  ko(applyAction(s, pi, { type: 'poser', case: 'marcheMat', achats: { malt: 4 } }), /Au plus 3|Quantité|illisible|achètes/);
  ko(applyAction(s, pi, { type: 'poser', case: 'marcheMat', achats: { malt: 3, houb: 1 } }), /Au plus 3/);
  s = ok(applyAction(s, pi, { type: 'poser', case: 'marcheMat', achats: { malt: 2, houb: 1 } }));
  assert.equal(s.players[pi].argent, 10 - 6);
  assert.equal(s.players[pi].res.malt, DEPART.res.malt + 2);
  s = ok(applyAction(s, pi, { type: 'endTurn' }));
  // le joueur suivant vend 5 blondes : 3, 2, 1, 1, 1 (+ demande)
  const q = s.cur;
  s = dote(s, q, { stock: { blonde: 5 } });
  const dem = s.demande.includes('blonde') ? 2 : 0;
  const avant = s.players[q].argent;
  s = ok(applyAction(s, q, { type: 'poser', case: 'marcheBieres', ventes: { blonde: 5 } }));
  assert.equal(s.players[q].argent, avant + 3 + 2 + 1 + 1 + 1 + 5 * dem);
  assert.equal(s.prix.blonde, 1);
  assert.equal(s.players[q].stock.blonde, 0);
  // le marché est à plusieurs places : un autre peut y aller
  s = ok(applyAction(s, q, { type: 'endTurn' }));
  const r = s.cur;
  s = dote(s, r, { stock: { ipa: 1 } });
  ok(applyAction(s, r, { type: 'poser', case: 'marcheBieres', ventes: { ipa: 1 } }));
});

test('tournée : ouverte à tous, client pris de la file, argent et réputation, cave au choix, camion, festival en saison', () => {
  let s = calme(prete(11));
  const pi = s.cur;
  s = dote(s, pi, { stock: { blonde: 4, stout: 2, garde: 2 } });
  const bar = { id: 'b', kind: 'bar', nom: 'Test', style: null, n: 1, bonus: 0, rep: 1 };
  const cave = { id: 'c', kind: 'cave', nom: 'Cave', style: null, styles: ['stout', 'garde'], n: 1, bonus: 3, rep: 3 };
  s.file[0] = bar; s.file[1] = cave;
  const rep0 = s.players[pi].rep, arg0 = s.players[pi].argent;
  ko(applyAction(s, pi, { type: 'poser', case: 'tournee', client: bar.id }), /Choisis un style/);
  ko(applyAction(s, pi, { type: 'poser', case: 'tournee', client: cave.id, style: 'blonde' }), /Choisis un style/);
  ko(applyAction(s, pi, { type: 'poser', case: 'tournee', livraisons: [{ client: bar.id, style: 'blonde' }, { client: cave.id, style: 'garde' }] }), /Camion/);
  s = ok(applyAction(s, pi, { type: 'poser', case: 'tournee', client: bar.id, style: 'blonde' }));
  assert.equal(s.players[pi].argent, arg0 + RECETTES.blonde.prix + bar.bonus);
  assert.equal(s.players[pi].rep, rep0 + bar.rep + (s.demande.includes('blonde') ? 1 : 0));
  assert.ok(!s.file.some((c) => c.id === bar.id));
  assert.equal(s.file.length, FILE, 'la file est complétée');
  assert.equal(s.players[pi].cpt.bar, 1);
  s = ok(applyAction(s, pi, { type: 'endTurn' }));
  // le joueur suivant peut aussi faire une tournée, et avec le camion, livrer deux clients d'un coup
  const q = s.cur;
  s = dote(s, q, { stock: { stout: 1, garde: 1 }, upg: ['camion'] });
  s.file[1] = { ...cave, id: 'c2' };
  const pose = legalActions(s, q).find((x) => x.type === 'poser').targets.find((t) => t.case === 'tournee');
  assert.equal(pose.max, 2);
  assert.ok(pose.clients.find((c) => c.id === 'c').styles.includes('garde'));
  s = ok(applyAction(s, q, { type: 'poser', case: 'tournee', livraisons: [{ client: 'c', style: 'stout' }, { client: 'c2', style: 'garde' }] }));
  assert.equal(s.players[q].cpt.cave, 2);
  assert.equal(s.players[q].cpt.livre.garde, 1);
  assert.equal(s.log.at(-1).livraisons.length, 2);
  // festival : +2 pendant sa saison, pas en dehors
  const f = structuredClone(calme(prete(12)));
  const fest = { id: 'x', kind: 'fest', nom: 'Test', style: 'blonde', n: 2, bonus: 1, rep: 2, saison: 0 };
  f.file[0] = fest; f.players[f.cur].stock.blonde = 2;
  const vIn = applyAction(f, f.cur, { type: 'poser', case: 'tournee', client: 'x' });
  assert.ok(vIn.ok);
  assert.equal(vIn.state.log.at(-1).rep, 2 + 2 + (f.demande.includes('blonde') ? 1 : 0));
  f.saison = 1; f.demande = DEMANDE.ete;
  const vOut = ok(applyAction(f, f.cur, { type: 'poser', case: 'tournee', client: 'x' }));
  assert.equal(vOut.log.at(-1).rep, 2 + (f.demande.includes('blonde') ? 1 : 0));
});

test('chantier : équipements, fermenteurs jusqu’à 4, camion, salle une fois par saison', () => {
  let s = calme(prete(4));
  const pi = s.cur;
  s = dote(s, pi, { argent: 100, stock: { stout: 3 } });
  s = ok(applyAction(s, pi, { type: 'poser', case: 'chantier', u: 'cuve' }));
  assert.equal(s.players[pi].cuve, 1);
  assert.equal(s.players[pi].argent, 100 - AMELIORATIONS.cuve.cout);
  ko(applyAction(s, pi, { type: 'poser', case: 'chantier', u: 'ferm' }), /déjà posé/);
  // on simule plusieurs poses au chantier (case à plusieurs places) en remettant la pose à zéro
  const again = (st, u) => { const c = structuredClone(st); c.place = false; c.restants[pi] = 1; return ok(applyAction(c, pi, { type: 'poser', case: 'chantier', u })); };
  s = again(s, 'ferm'); s = again(s, 'ferm');
  assert.equal(s.players[pi].nferm, 4);
  const c4 = structuredClone(s); c4.place = false; c4.restants[pi] = 1;
  ko(applyAction(c4, pi, { type: 'poser', case: 'chantier', u: 'ferm' }), /déjà/);
  s = again(s, 'camion');
  assert.ok(s.players[pi].upg.includes('camion'));
  s = again(s, 'salle');
  const a0 = s.players[pi].argent;
  s = ok(applyAction(s, pi, { type: 'salle', style: 'stout' }));
  assert.equal(s.players[pi].argent, a0 + RECETTES.stout.prix + 1);
  ko(applyAction(s, pi, { type: 'salle', style: 'stout' }), /déjà servi/);
  ko(applyAction(s, pi, { type: 'poser', case: 'chantier', u: 'embauche' }), /inconnue|déjà/);
});

test('fin de saison : fermentations, prix qui remontent, client le plus ancien défaussé, stock vendu d’office, ouvriers de retour, rotation', () => {
  let s = calme(prete(6));
  const first = s.first, pi = s.cur;
  s = dote(s, pi, { res: { malt: 9, houb: 9 }, stock: { blonde: STOCK_MAX + 2 } });
  s = ok(applyAction(s, pi, { type: 'brasser', style: 'garde' }));
  s.prix.ipa = 2;
  const plusVieux = s.file[0].id;
  // tout le monde pose et passe jusqu'à la fin de la saison
  let t = s;
  while (t.saison === 0 && t.phase === 'main') {
    while (t.pending) t = aiStep(t).state;
    if (t.saison !== 0) break;
    const pose = legalActions(t, t.cur).find((x) => x.type === 'poser');
    const ch = pose?.targets.find((x) => CASES[x.case].recolte);
    const mb = pose?.targets.find((x) => x.case === 'marcheBieres');
    if (ch) t = ok(applyAction(t, t.cur, { type: 'poser', case: ch.case }));
    else if (mb) t = ok(applyAction(t, t.cur, { type: 'poser', case: 'marcheBieres', ventes: { [mb.styles[0]]: 1 } }));
    else if (pose) t = ok(applyAction(t, t.cur, { type: 'poser', case: 'chantier', u: pose.targets.find((x) => x.case === 'chantier').targets[0] }));
    t = ok(applyAction(t, t.cur, { type: 'endTurn' }));
  }
  assert.equal(t.saison, 1);
  const p = t.players[pi];
  assert.equal(p.ferms[0].left, RECETTES.garde.ferm - 1);
  assert.ok(unites(p) <= STOCK_MAX, 'stock ramené au maximum');
  assert.ok(t.log.some((e) => e.k === 'vendre' && e.force && e.p === pi));
  assert.equal(t.prix.ipa, 3, 'le prix remonte de 1');
  assert.ok(!t.file.some((c) => c.id === plusVieux), 'le plus ancien client est parti');
  assert.ok(t.log.some((e) => e.k === 'clientParti'));
  assert.equal(t.first, (first + 1) % 4, 'le premier joueur tourne');
  Object.values(t.restants).forEach((n, i) => assert.equal(n, t.players[i].ouv));
});

test('événements : contamination, inspection, douanes, concours, grève, pénurie', () => {
  // On fabrique un état à la fin d'une saison et on force les dés de la suivante par la graine du générateur :
  // plus simple, on teste les effets directement sur un état construit.
  let s = calme(prete(21));
  const pi = s.cur;
  s = dote(s, pi, { res: { malt: 9, houb: 9 } });
  s = ok(applyAction(s, pi, { type: 'brasser', style: 'blonde' }));
  // contamination : décision en attente pour ceux qui ont un brassin
  const c = structuredClone(s);
  c.pending = { type: 'saison', kind: 'contamination', need: { [pi]: true }, resp: {} };
  assert.deepEqual(deciders(c), [pi]);
  assert.deepEqual(waitingFor(c), [pi]);
  ko(applyAction(c, pi, { type: 'poser', case: 'champA' }), /attente/);
  const u0 = c.players[pi].ferms[0].u;
  const c2 = ok(applyAction(c, pi, { type: 'evenement', ferm: 0 }));
  assert.equal(c2.players[pi].ferms[0].u, u0 - 1);
  assert.equal(c2.pending, null);
  // concours : chacun présente, le meilleur gagne 5
  const k = structuredClone(s);
  k.players.forEach((p, i) => { p.stock = Object.fromEntries(STYLES.map((x) => [x, 0])); p.stock[i === 0 ? 'stout' : 'blonde'] = 1; p.rep = 0; });
  k.pending = { type: 'saison', kind: 'concours', need: { 0: true, 1: true, 2: true, 3: true }, resp: {} };
  let kk = k;
  ko(applyAction(kk, 1, { type: 'concours', style: 'stout' }), /en stock/);
  for (let i = 0; i < 4; i++) kk = ok(applyAction(kk, i, { type: 'concours', style: i === 0 ? 'stout' : 'blonde' }));
  assert.equal(kk.players[0].rep, CONCOURS.concours[0]);
  assert.equal(kk.players[1].rep, CONCOURS.concours[1]);
  assert.equal(kk.players[0].stock.stout, 0);
  // grève : la tournée est fermée ; pénurie : le marché aux matières aussi
  const g = structuredClone(s); g.ferme = ['tournee']; g.players[pi].stock.blonde = 3;
  ko(applyAction(g, pi, { type: 'poser', case: 'tournee', client: g.file[0].id, style: 'blonde' }), /fermée/);
  const pn = structuredClone(s); pn.ferme = ['marcheMat'];
  ko(applyAction(pn, pi, { type: 'poser', case: 'marcheMat', achats: { malt: 1 } }), /fermée/);
  // coopérative et gel : prix des matières ; grand marché : les prix ne bougent pas ; terrasses : les bars paient plus
  const co = structuredClone(s); co.prixMatiere = 1; co.players[pi].argent = 3;
  assert.equal(ok(applyAction(co, pi, { type: 'poser', case: 'marcheMat', achats: { malt: 3 } })).players[pi].argent, 0);
  const gm = structuredClone(s); gm.marcheFixe = true; gm.players[pi].stock.blonde = 3;
  assert.equal(ok(applyAction(gm, pi, { type: 'poser', case: 'marcheBieres', ventes: { blonde: 3 } })).prix.blonde, RECETTES.blonde.prix);
  const te = structuredClone(s); te.bonusKind = { bar: 1 }; te.players[pi].stock.blonde = 1; te.file[0] = { id: 'b', kind: 'bar', nom: 'T', style: null, n: 1, bonus: 0, rep: 1 };
  assert.equal(ok(applyAction(te, pi, { type: 'poser', case: 'tournee', client: 'b', style: 'blonde' })).log.at(-1).argent, RECETTES.blonde.prix + 1);
  // chaque saison a un événement par face
  SAISONS.forEach((n) => assert.deepEqual(Object.keys(EVENEMENTS[n]).map(Number), [1, 2, 3, 4, 5, 6]));
  assert.ok(Object.values(EVENEMENTS).flatMap(Object.values).every((e) => EVT[e]));
});

test('échanges : matières, bière et Argent ; contre-proposition ; conclusion', () => {
  let s = calme(prete(9));
  const pi = s.cur, autre = (pi + 1) % 4;
  s = dote(s, pi, { res: { malt: 5 }, argent: 10, stock: { blonde: 2 } });
  s = dote(s, autre, { res: { houb: 4 }, argent: 3 });
  ko(applyAction(s, pi, { type: 'proposeTrade', give: { malt: 1 }, get: { malt: 1 } }), /même chose/);
  s = ok(applyAction(s, pi, { type: 'proposeTrade', give: { blonde: 1, argent: 2 }, get: { houb: 2 }, to: [autre] }));
  assert.ok(waitingFor(s).includes(autre));
  assert.deepEqual(deciders(s), [pi]);
  s = ok(applyAction(s, autre, { type: 'respondTrade', counter: { give: { blonde: 1, argent: 2, malt: 1 }, get: { houb: 2 } } }));
  s = ok(applyAction(s, pi, { type: 'concludeTrade', with: autre }));
  assert.equal(s.trade, null);
  assert.equal(s.players[pi].stock.blonde, 1);
  assert.equal(s.players[pi].argent, 8);
  assert.equal(s.players[autre].res.houb, 2);
  assert.equal(s.players[autre].stock.blonde, 1);
});

test('fin de partie : à la réputation de fin ou après 12 saisons, décompte avec l’objectif, départage', () => {
  const { s } = playOut(3);
  assert.equal(s.phase, 'over');
  if (s.finie === 'reputation') assert.ok(s.players.some((p) => p.rep >= FIN_REP));
  else assert.equal(s.saison, NB_SAISONS - 1);
  s.players.forEach((p, i) => {
    const sc = score(s, i);
    assert.equal(sc.objectif, OBJECTIFS[p.objectif].test(p) ? OBJECTIFS[p.objectif].pts : 0);
    assert.equal(sc.total, p.rep + sc.objectif + Math.floor(p.argent / 8));
    assert.deepEqual(s.scores[i], sc);
    assert.equal(typeof viewFor(s, 0).players[i].objectifOk, 'boolean', 'objectifs révélés à la fin');
  });
  // durée fixe sans objectifs
  const { s: f } = playOut(4, { finRep: 0, objectifs: false });
  assert.equal(f.saison, NB_SAISONS - 1);
  assert.equal(f.scores[0].objectif, 0);
  assert.equal(s.scores[s.winner].total, Math.max(...s.scores.map((x) => x.total)));
  ko(applyAction(s, s.winner, { type: 'endTurn' }), /terminée/);
});

test('vue : graine et pioche masquées, scores joints, JSON stable', () => {
  const s = prete(12);
  const v = viewFor(s, 0);
  assert.equal(v.seed, undefined); assert.equal(v.rng, undefined);
  assert.equal(typeof v.deck, 'number');
  assert.equal(v.me, 0);
  assert.deepEqual(v.waiting, waitingFor(s));
  assert.ok(v.players.every((p) => typeof p.score.total === 'number'));
  assert.ok(legalActions(v, v.cur).length > 0);
  assert.deepEqual(JSON.parse(JSON.stringify(s)), s);
  const copie = structuredClone(s);
  applyAction(s, s.cur, { type: 'endTurn' });
  assert.deepEqual(s, copie, 'applyAction ne modifie pas l’état reçu');
});

test('IA : parties complètes aux trois niveaux et à 2, 3, 4 joueurs, sans action illégale ni blocage', () => {
  for (const niveau of ['apprenti', 'compagnon', 'maitre']) {
    for (let g = 1; g <= 8; g++) {
      const { s, steps } = playOut(100 + g, { niveau });
      assert.equal(s.phase, 'over', `niveau ${niveau}, graine ${100 + g} : pas finie après ${steps} actions`);
      assert.ok(s.players.every((p) => p.argent >= 0 && RES.every((r) => p.res[r] >= 0) && STYLES.every((st) => p.stock[st] >= 0) && unites(p) <= STOCK_MAX));
    }
  }
  for (const n of [2, 3]) { const { s } = playOut(200 + n, { n }); assert.equal(s.phase, 'over'); }
});

test('IA : répond aux offres, attend les réponses, décide pour tous les cas en attente', () => {
  let s = calme(prete(15, { niveau: 'compagnon' }));
  const pi = s.cur, autre = (pi + 1) % 4;
  s = dote(s, pi, { res: { malt: 3 }, argent: 10 });
  s = ok(applyAction(s, pi, { type: 'proposeTrade', give: { malt: 1 }, get: { houb: 1 }, to: [autre] }));
  const a = aiAction(s, autre);
  assert.equal(a.type, 'respondTrade');
  assert.equal(aiAction(s, pi), null, 'le proposant attend');
  s = ok(applyAction(s, autre, a));
  assert.ok(['concludeTrade', 'cancelTrade'].includes(aiAction(s, pi).type));
  void SAISONS;
});
