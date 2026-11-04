import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { openBase } from '../serveur/base.js';
import { Salle } from '../serveur/salle.js';
import { creerNotifier, emailValide, dateLimite } from '../serveur/notifications.js';
import { demarrerServeur } from '../serveur/serveur.js';
import { fakeClock, TEST_CONFIG } from './aide.js';

function setup() {
  const clock = fakeClock(), base = openBase(':memory:'), mails = [];
  const envoyer = async (m) => { mails.push(m); return { ok: true }; };
  const notifier = creerNotifier({ publicUrl: 'https://jeu.test/', envoyer, base, now: clock.now, setTimeout: clock.setTimeout, clearTimeout: clock.clearTimeout, log: () => {} });
  const deps = { base, config: TEST_CONFIG, now: clock.now, setTimeout: clock.setTimeout, clearTimeout: clock.clearTimeout, log: () => {}, onTour: notifier.onTour, onFin: notifier.onFin };
  return { clock, base, mails, deps };
}
const MIN = 60 * 1000;

describe('notifications e-mail', () => {
  test('adresse facultative, vérifiée, modifiable', () => {
    const { deps } = setup();
    assert.match(Salle.creer({ nom: 'A', humains: 2, mode: 'differe', email: 'pas une adresse' }, deps).error, /invalide/);
    const { salle } = Salle.creer({ nom: 'A', humains: 2, mode: 'differe', email: ' a@exemple.fr ' }, deps);
    assert.equal(salle.meta.sieges[0].email, 'a@exemple.fr');
    assert.equal(salle.vue(0).email, 'a@exemple.fr');
    assert.equal(salle.vue(1).email, null, 'on ne voit pas l’adresse des autres');
    assert.equal(salle.rejoindre('B').siege, 1);
    assert.equal(salle.meta.sieges[1].email, null);
    assert.match(salle.definirEmail(1, 'x@').error, /invalide/);
    assert.equal(salle.definirEmail(0, '').ok, true);
    assert.equal(salle.meta.sieges[0].email, null);
    assert.ok(emailValide('prenom.nom+jeu@sous.domaine.fr'));
    assert.match(dateLimite(Date.UTC(2026, 10, 5, 17, 30)), /jeudi 5 novembre .*18 h 30/);
  });

  test('différé : un e-mail une minute après, si le joueur n’est pas connecté, avec son lien et la désinscription', () => {
    const { deps, clock, mails, base } = setup();
    const { salle, jeton } = Salle.creer({ nom: 'Brasserie <b>Test</b>', humains: 1, mode: 'differe', delai: 86400, email: 'moi@exemple.fr' }, deps);
    salle.demarrer(0);
    clock.advance(30 * 1000);
    assert.equal(mails.length, 0, 'délai de grâce');
    clock.advance(31 * 1000);
    assert.equal(mails.length, 1);
    const m = mails[0];
    assert.equal(m.to, 'moi@exemple.fr');
    assert.match(m.subject, new RegExp(`installer \\(partie ${salle.code}\\)`));
    assert.ok(m.html.includes(`https://jeu.test/#p=${jeton}`));
    assert.ok(m.text.includes(`https://jeu.test/desabonner?jeton=${jeton}`));
    assert.equal(m.unsubscribe, `https://jeu.test/desabonner?jeton=${jeton}`);
    assert.ok(m.html.includes('Brasserie &lt;b&gt;Test&lt;/b&gt;'), 'nom échappé');
    assert.ok(!m.html.includes('<b>Test'));
    assert.match(m.text, /l'ordinateur jouera ce tour à ta place/);
    // Pas de second message pour la même décision
    clock.advance(60 * MIN);
    assert.equal(mails.length, 1);
    assert.equal(base.partie(salle.code).meta.sieges[0].notif.tour, 0);
  });

  test('pas d’e-mail si le joueur est connecté, ni en direct, ni sans adresse', () => {
    const a = setup();
    const r1 = Salle.creer({ nom: 'Présent', humains: 1, mode: 'differe', email: 'p@exemple.fr' }, a.deps);
    r1.salle.attacher({ siege: 0, send() {} });
    r1.salle.demarrer(0);
    a.clock.advance(5 * MIN);
    assert.equal(a.mails.length, 0);

    const b = setup();
    const r2 = Salle.creer({ nom: 'Direct', humains: 1, mode: 'direct', email: 'd@exemple.fr' }, b.deps);
    r2.salle.demarrer(0);
    b.clock.advance(5 * MIN);
    assert.equal(b.mails.length, 0);

    const c = setup();
    const r3 = Salle.creer({ nom: 'Sans adresse', humains: 1, mode: 'differe' }, c.deps);
    r3.salle.demarrer(0);
    c.clock.advance(5 * MIN);
    assert.equal(c.mails.length, 0);
  });

  test('partie entière en différé avec un absent : un message par tour au plus, puis le résultat', () => {
    const { deps, clock, mails } = setup();
    const { salle } = Salle.creer({ nom: 'Absent', humains: 1, mode: 'differe', delai: 3600, email: 'abs@exemple.fr' }, deps);
    salle.demarrer(0);
    for (let h = 0; h < 2000 && salle.statut !== 'fini'; h++) clock.advance(3600 * 1000);
    assert.equal(salle.statut, 'fini');
    const tours = mails.filter((m) => /À toi|installer|décider/.test(m.subject));
    assert.ok(tours.length >= 2, `messages de tour (${tours.length})`);
    const parTour = new Map();
    tours.forEach((m) => { const k = m.subject; parTour.set(k, (parTour.get(k) || 0) + 1); });
    assert.ok([...parTour.values()].every((n) => n === 1), 'jamais deux fois le même message');
    assert.match(mails.at(-1).subject, /emporte/);
  });

  test('désinscription par le lien, en GET comme en POST', async () => {
    const srv = await demarrerServeur({ config: { ...TEST_CONFIG, port: 0, db: ':memory:', publicUrl: 'https://jeu.test/' }, log: () => {}, envoyer: null });
    const { salle, jeton } = Salle.creer({ nom: 'Lecteur', humains: 2, mode: 'differe', email: 'l@exemple.fr' }, { ...setup().deps, base: srv.base });
    srv.salles.set(salle.code, salle);
    const get = await fetch(`http://127.0.0.1:${srv.port}/desabonner?jeton=${jeton}`);
    assert.match(await get.text(), /ne recevras plus de messages pour la partie/);
    assert.equal(salle.meta.sieges[0].email, null);
    const post = await fetch(`http://127.0.0.1:${srv.port}/desabonner?jeton=inconnu`, { method: 'POST' });
    assert.match(await post.text(), /aucune partie/);
    await srv.fermer();
  });
});
