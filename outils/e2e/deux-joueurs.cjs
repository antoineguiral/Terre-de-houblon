const { chromium } = require('playwright');
const OUT = process.env.CAPTURES || require('node:os').tmpdir();
const URL = process.env.URL || 'http://localhost:8642/';
const { step } = require('./joueur.cjs');
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
