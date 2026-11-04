import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { openBase } from '../serveur/base.js';
import { Salle } from '../serveur/salle.js';
import { waitingFor } from '../moteur/index.js';
import { fakeClock, botAction, TEST_CONFIG } from './aide.js';

function setup() {
  const clock = fakeClock(), base = openBase(':memory:'), tours = [];
  const deps = { base, config: TEST_CONFIG, now: clock.now, setTimeout: clock.setTimeout, clearTimeout: clock.clearTimeout, onTour: (s, i) => tours.push(i), log: () => {} };
  return { clock, base, deps, tours };
}
// Fait jouer la place humaine `siege` avec le bot, en laissant tourner les IA
function playHuman(salle, clock, siege, until) {
  for (let n = 0; n < 5000 && !until(); n++) {
    clock.advance(50);
    if (salle.statut !== 'jeu') return;
    if (!waitingFor(salle.etat).includes(siege) || salle.isAi(siege)) continue;
    const a = botAction(salle.vue(siege).view, siege);
    if (!a) continue;
    const r = salle.agir(siege, a);
    assert.equal(r.ok, true, r.error);
  }
}

describe('salle', () => {
  test('création, places, nom unique, lancement par le créateur seulement', () => {
    const { deps } = setup();
    assert.match(Salle.creer({ nom: ' ', humains: 2, mode: 'direct' }, deps).error, /nom/);
    assert.match(Salle.creer({ nom: 'A', humains: 5, mode: 'direct' }, deps).error, /1 à 4/);
    const { salle, jeton } = Salle.creer({ nom: 'Brasserie Antoine', humains: 2, mode: 'direct', delai: 5 }, deps);
    assert.match(salle.code, /^[A-Z2-9]{5}$/);
    assert.ok(jeton.length >= 20);
    assert.equal(salle.meta.delai, 30, 'délai borné au minimum');
    assert.match(salle.rejoindre('Brasserie Antoine').error, /déjà pris/);
    const b = salle.rejoindre('Chez Bob');
    assert.equal(b.siege, 1);
    assert.match(salle.rejoindre('Carla').error, /prises/);
    assert.match(salle.demarrer(1).error, /créateur/);
    assert.equal(salle.vue(0).view, null);
    assert.deepEqual(salle.vue(0).sieges.map((s) => s.type), ['humain', 'humain', 'ia', 'ia']);
    assert.equal(salle.demarrer(0).ok, true);
    assert.deepEqual(salle.etat.players.map((p) => p.ai), [false, false, true, true]);
    assert.equal(salle.etat.players[1].name, 'Chez Bob');
    assert.match(salle.demarrer(0).error, /déjà/);
    assert.equal(deps.base.place(b.jeton).siege, 1);
  });

  test('une place libre est jouée par l’IA, puis reprise en cours de partie', () => {
    const { deps, clock } = setup();
    const { salle } = Salle.creer({ nom: 'Hôte', humains: 3, mode: 'direct' }, deps);
    salle.demarrer(0);
    assert.equal(salle.isAi(1), true);
    playHuman(salle, clock, 0, () => salle.etat.turn >= 6);
    const r = salle.rejoindre('Arrivée tardive');
    assert.equal(r.siege, 1);
    assert.equal(salle.isAi(1), false);
    assert.equal(salle.etat.players[1].name, 'Arrivée tardive');
    assert.equal(salle.isAi(2), true);
  });

  test('direct : l’IA joue la décision en retard, puis tient la place après deux délais, jusqu’au retour', () => {
    const { deps, clock, tours } = setup();
    const { salle } = Salle.creer({ nom: 'Lent', humains: 1, mode: 'direct', delai: 60 }, deps);
    salle.demarrer(0);
    // les IA qui se placent avant l'humain jouent d'abord
    for (let n = 0; n < 100 && !waitingFor(salle.etat).includes(0); n++) clock.advance(100);
    assert.deepEqual(tours, [0]);
    const deadline = salle.meta.echeances[0];
    assert.ok(deadline > clock.now() + 59000 && deadline <= clock.now() + 60000, 'échéance à 60 s');
    clock.advance(58000);
    assert.equal(salle.etat.players[0].hex, null);
    clock.advance(3000);
    assert.notEqual(salle.etat.players[0].hex, null, 'l’IA a placé la brasserie');
    assert.equal(salle.meta.sieges[0].retards, 1);
    assert.equal(salle.isAi(0), false);
    clock.advance(61000);
    assert.equal(salle.meta.sieges[0].absent, true);
    assert.equal(salle.vue(0).sieges[0].absent, true);
    clock.advance(60000);
    assert.ok(salle.etat.phase !== 'setup', 'l’IA a continué à jouer');
    salle.present(0);
    assert.equal(salle.isAi(0), false);
  });

  test('différé : l’IA finit le tour de l’absent, qui reprend la main au tour suivant', () => {
    const { deps, clock } = setup();
    const { salle } = Salle.creer({ nom: 'Dormeur', humains: 1, mode: 'differe', delai: 3600 }, deps);
    salle.demarrer(0);
    playHuman(salle, clock, 0, () => salle.etat.phase === 'main' && salle.etat.cur === 0);
    assert.equal(salle.meta.echeances[0] - clock.now() <= 3600e3, true);
    const turn = salle.etat.turn;
    clock.advance(3601e3);
    assert.ok(salle.etat.turn > turn, 'le tour est passé');
    assert.equal(salle.isAi(0), salle.etat.phase === 'over');
  });

  test('une offre d’échange se ferme à la limite de temps', () => {
    const { deps, clock } = setup();
    const { salle } = Salle.creer({ nom: 'Négociant', humains: 1, mode: 'direct', delai: 600 }, deps);
    salle.demarrer(0);
    playHuman(salle, clock, 0, () => salle.etat.phase === 'main' && salle.etat.cur === 0 && !salle.etat.pending);
    const r = salle.etat.players[0].res;
    const give = Object.keys(r).find((k) => r[k] > 0);
    const get = ['malt', 'houb', 'lev', 'eau', 'torr'].find((k) => k !== give);
    assert.equal(salle.agir(0, { type: 'proposeTrade', give: { [give]: 1 }, get: { [get]: 9 } }).ok, true);
    clock.advance(1000);
    assert.ok(salle.etat.trade, 'offre ouverte, les IA ont répondu');
    assert.equal(Object.keys(salle.etat.trade.resp).length, salle.etat.trade.to.length);
    clock.advance(45000);
    assert.equal(salle.etat.trade, null);
    assert.equal(salle.meta.echange, null);
  });

  test('l’état et les places sont sauvegardés à chaque action', () => {
    const { deps, base, clock } = setup();
    const { salle, jeton } = Salle.creer({ nom: 'Archiviste', humains: 2, mode: 'differe', niveau: 'maitre' }, deps);
    assert.equal(salle.meta.niveau, 'maitre');
    salle.demarrer(0);
    playHuman(salle, clock, 0, () => salle.etat.turn >= 3);
    const row = base.partie(salle.code);
    assert.equal(row.statut, 'jeu');
    assert.deepEqual(row.etat, salle.etat);
    assert.deepEqual(row.meta, salle.meta);
    assert.equal(base.place(jeton).code, salle.code);
    assert.equal(salle.etat.opts.niveau, 'maitre');
  });

  test('résumé : saison en cours pour la liste « mes parties »', () => {
    const { deps, clock } = setup();
    const { salle } = Salle.creer({ nom: 'Liste', humains: 1, mode: 'direct', delai: 60 }, deps);
    salle.demarrer(0);
    playHuman(salle, clock, 0, () => salle.etat.phase === 'main');
    assert.match(salle.resume(0).saison, /^Printemps an 1$/);
  });
});
