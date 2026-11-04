const { chromium } = require('playwright');
const OUT = process.env.CAPTURES || require('node:os').tmpdir();
const URL = process.env.URL || 'http://localhost:8642/';
// Une interaction possible sur la page, ou false s'il n'y a rien à faire
async function step(page, c) {
  const bump = (k) => (c[k] = (c[k] || 0) + 1);
  if (await page.locator('#modal:not([hidden])').count()) {
    const box = page.locator('#modalBox'), title = (await box.locator('h2').textContent()) || '';
    if (/emporte/.test(title)) { bump('fin vue'); return 'fini'; }
    if (/Contamination|Canicule/.test(title)) { bump('perte'); await box.locator('[data-ferm]').first().click(); return true; }
    if (/Concours/.test(title)) { bump('concours'); await box.locator('[data-style]').first().click(); return true; }
    if (/Offre de/.test(title)) { bump('offre reçue'); const acc = box.locator('[data-y]:not(:disabled)'); try { if (await acc.count() && c['offre reçue'] % 2) { await acc.click({ timeout: 1500 }); bump('offre acceptée'); } else await box.locator('[data-n]').click({ timeout: 1500 }); } catch { bump('offre disparue'); } return true; }
    if (/Réponses/.test(title)) {
      const k = box.locator('[data-k]:not([data-k="-1"])');
      if (await k.count()) { bump('échange conclu'); await k.first().click(); return true; }
      if (/Fermer|Annuler/.test(await box.locator('[data-k="-1"]').textContent())) { await box.locator('[data-k="-1"]').click(); return true; }
      return false; // on attend les réponses
    }
    if (/Contre-proposition/.test(title)) { await box.locator('[data-cback]').click(); return true; }
    // Collabs : accepter une fois sur deux celle qu'on reçoit, brasser la sienne dès qu'elle est acceptée
    if (/Collab avec/.test(title)) { bump('collab reçue'); const acc = box.locator('[data-y]:not(:disabled)'); try { if (await acc.count() && c['collab reçue'] % 2) { await acc.click({ timeout: 1500 }); bump('collab acceptée'); } else await box.locator('[data-n]').click({ timeout: 1500 }); } catch { bump('collab disparue'); } return true; }
    if (/Ta collab/.test(title)) {
      const k = box.locator('[data-k]:not([data-k="-1"])');
      if (await k.count()) { bump('collab brassée'); await k.first().click(); return true; }
      if (/Fermer|Renoncer/.test(await box.locator('[data-k="-1"]').textContent())) { await box.locator('[data-k="-1"]').click(); return true; }
      return false;
    }
    if (/Autre répartition/.test(title)) { await box.locator('[data-ccback]').click(); return true; }
    throw new Error('fenêtre inconnue : ' + title);
  }
  const spot = page.locator('#board .hpick, #board .cpick');
  if (await spot.count()) { bump('plateau'); await spot.first().dispatchEvent('click'); return true; }
  if (!(await page.locator('[data-act="end"]:not(:disabled)').count()) && !(await page.locator('[data-act="vendre"]:not(:disabled)').count())) return false;
  const click = async (sel, k) => { const b = page.locator(`${sel}:not(:disabled)`); if (await b.count()) { bump(k); await b.first().click(); return true; } return false; };
  if (await click('[data-act="livrer"]', 'livraison')) return true;
  if (await click('[data-act="ameliorer"]', 'amélioration')) return true;
  if (await click('[data-act="brasser"]', 'brassin')) return true;
  const stock = (await page.locator('#brasserie .stk b').allTextContents()).reduce((n, t) => n + +t, 0);
  if (stock > 4 && await click('[data-act="vendre"]', 'vente')) return true;
  bump('tours');
  if (c.tours % 5 === 3 && c.dernierePropo !== c.tours && await page.locator('[data-act="og"][data-d="1"]:not(:disabled)').count()) {
    c.dernierePropo = c.tours;
    await page.locator('[data-act="og"][data-d="1"]:not(:disabled)').first().click();
    await page.locator('[data-act="ow"][data-d="1"]:not(:disabled)').last().click();
    if (await page.locator('[data-act="propose"]:not(:disabled)').count()) { bump('proposition'); await page.locator('[data-act="propose"]').click(); return true; }
  }
  if (await click('[data-act="end"]', 'fin de tour')) return true;
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
  await bob.waitForFunction(() => document.querySelector('#jErr').textContent);
  console.log('nom en double :', await bob.locator('#jErr').textContent());
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
    if (!reloaded && (cb.tours || 0) >= 4) {
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
