const { chromium } = require('playwright');
const OUT = process.env.CAPTURES || require('node:os').tmpdir();
const URL = process.env.URL || 'http://localhost:8642/';
// Une interaction possible sur la page, ou false s'il n'y a rien à faire
async function step(page, c) {
  const bump = (k) => (c[k] = (c[k] || 0) + 1);
  if (await page.locator('#modal:not([hidden])').count()) {
    const box = page.locator('#modalBox'), title = (await box.locator('h2').textContent()) || '';
    if (/saison/.test(title)) { bump('victoire vue'); return 'fini'; }
    if (/Contrôle/.test(title)) { bump('défausse'); while (await box.locator('[data-ok]:disabled').count()) await box.locator('[data-p]:not(:disabled)').first().click(); await box.locator('[data-ok]').click(); return true; }
    if (/piocher/.test(title)) { bump('pioche'); await box.locator('[data-v]').first().click(); return true; }
    if (/Offre de/.test(title)) { bump('offre reçue'); const acc = box.locator('[data-y]:not(:disabled)'); try { if (await acc.count() && c['offre reçue'] % 2) { await acc.click({ timeout: 1500 }); bump('offre acceptée'); } else await box.locator('[data-n]').click({ timeout: 1500 }); } catch { bump('offre disparue'); } return true; }
    if (/Réponses/.test(title)) {
      const k = box.locator('[data-k]:not([data-k="-1"])');
      if (await k.count()) { bump('échange conclu'); await k.first().click(); return true; }
      if (/Fermer|Annuler/.test(await box.locator('[data-k="-1"]').textContent())) { await box.locator('[data-k="-1"]').click(); return true; }
      return false; // on attend les réponses
    }
    if (/Livraison|exclusivité/.test(title)) { const okb = box.locator('[data-ok]'); if (await okb.count()) { while (await box.locator('[data-ok]:disabled').count()) await box.locator('[data-p]:not(:disabled)').first().click(); await okb.click(); } else await box.locator('[data-r]').first().click(); return true; }
    if (/Contre-proposition/.test(title)) { await box.locator('[data-cback]').click(); return true; }
    throw new Error('fenêtre inconnue : ' + title);
  }
  const spot = page.locator('#board .spot, #board .espot, #board .hpick');
  if (await spot.count()) { bump('plateau'); await spot.first().dispatchEvent('click'); return true; }
  const play = page.locator('[data-act="play"]:not(:disabled)');
  if (await play.count()) { bump('carte jouée'); await play.first().click(); return true; }
  if (await page.locator('[data-act="roll"]:not(:disabled)').count()) { bump('lancer'); await page.locator('[data-act="roll"]').click(); return true; }
  for (const k of ['city', 'settle', 'road']) { const b = page.locator(`[data-act="${k}"]:not(:disabled)`); if (await b.count()) { bump('construction'); await b.click(); return true; } }
  if (await page.locator('[data-act="dev"]:not(:disabled)').count()) { bump('carte tirée'); await page.locator('[data-act="dev"]').click(); return true; }
  if ((c.lancer || 0) % 6 === 3 && c.dernierePropo !== c.lancer && await page.locator('[data-act="og"][data-d="1"]:not(:disabled)').count()) {
    c.dernierePropo = c.lancer;
    await page.locator('[data-act="og"][data-d="1"]:not(:disabled)').first().click();
    await page.locator('[data-act="ow"][data-d="1"]').last().click();
    if (await page.locator('[data-act="propose"]:not(:disabled)').count()) { bump('proposition'); await page.locator('[data-act="propose"]').click(); return true; }
  }
  if (await page.locator('[data-act="end"]:not(:disabled)').count()) { bump('fin de tour'); await page.locator('[data-act="end"]').click(); return true; }
  return false;
}
(async () => {
  const browser = await chromium.launch();
  const errors = [];
  const mk = async (who, width = 1280) => {
    const ctx = await browser.newContext({ viewport: { width, height: 900 } });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(`${who} pageerror: ${e.message}`));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(`${who} console: ${m.text()}`); });
    return page;
  };
  const alice = await mk('Alice'), bob = await mk('Bob', 390);
  await alice.goto(URL);
  await alice.screenshot({ path: OUT + '/m-accueil.png' });
  await alice.fill('#fNom', 'Brasserie Alice');
  await alice.selectOption('#fHum', '3');
  await alice.click('[data-h="creer"]');
  await alice.waitForSelector('.bigcode');
  const code = (await alice.locator('.bigcode').textContent()).trim();
  console.log('code', code);
  await bob.goto(URL + '#rejoindre=' + code);
  if ((await bob.inputValue('#jCode')) !== code) throw new Error('code non pré-rempli');
  await bob.fill('#jNom', 'Brasserie Alice');
  await bob.click('[data-h="rejoindre"]');
  await bob.waitForSelector('.err');
  console.log('nom en double :', await bob.locator('.err').first().textContent());
  await bob.fill('#jNom', 'Chez Bob');
  await bob.click('[data-h="rejoindre"]');
  await bob.waitForSelector('.bigcode');
  await alice.waitForFunction(() => document.querySelector('#salle').textContent.includes('Chez Bob'));
  await alice.screenshot({ path: OUT + '/m-salle.png' });
  await bob.screenshot({ path: OUT + '/m-salle-bob.png' });
  if (await bob.locator('[data-h="lancer"]').count()) throw new Error('Bob ne doit pas pouvoir lancer');
  await alice.click('[data-h="lancer"]');
  await bob.waitForSelector('#jeu:not([hidden])');
  const ca = {}, cb = {};
  let reloaded = false, it = 0, fini = 0;
  for (; it < +(process.env.MAX_IT || 6000) && fini < 2; it++) {
    fini = 0;
    for (const [p, c, who] of [[alice, ca, 'alice'], [bob, cb, 'bob']]) {
      let r;
      try { r = await step(p, c); } catch (e) {
        await alice.screenshot({ path: OUT + '/err-alice.png' }); await bob.screenshot({ path: OUT + '/err-bob.png' });
        const st = await p.evaluate(() => ({ modalHidden: document.querySelector('#modal').hidden, display: getComputedStyle(document.querySelector('#modal')).display, jeu: document.querySelector('#jeu').hidden, box: document.querySelector('#modalBox').innerHTML.slice(0, 300) }));
        console.log('ÉCHEC chez', who, JSON.stringify(st)); throw e;
      }
      if (r === 'fini') fini++;
    }
    if (!reloaded && (cb.lancer || 0) >= 4) {
      reloaded = true;
      await bob.screenshot({ path: OUT + '/m-bob-milieu.png' });
      const before = await bob.locator('#players').textContent();
      await bob.reload();
      await bob.waitForSelector('#jeu:not([hidden])');
      await bob.waitForTimeout(300);
      console.log('Bob rechargé, retrouve la partie :', (await bob.locator('#players').textContent()).includes('Chez Bob'));
      await alice.screenshot({ path: OUT + '/m-alice-milieu.png' });
    }
    await alice.waitForTimeout(40);
  }
  await alice.screenshot({ path: OUT + '/m-alice-fin.png' });
  console.log('itérations', it, 'Alice', JSON.stringify(ca), 'Bob', JSON.stringify(cb));
  await alice.goto(URL + '#accueil');
  await alice.waitForSelector('.grow2');
  console.log('mes parties (Alice) :', (await alice.locator('.glist').textContent()).replace(/\s+/g, ' ').trim());
  await alice.screenshot({ path: OUT + '/m-accueil-apres.png' });
  console.log('erreurs :', errors.length ? errors : 'aucune');
  await browser.close();
})().catch((e) => { console.error('ÉCHEC', e); process.exit(1); });
