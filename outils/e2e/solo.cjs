const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.goto('http://localhost:8642/#solo');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForSelector('#board polygon');
  await page.screenshot({ path: (process.env.CAPTURES || require('node:os').tmpdir()) + '/solo-debut.png' });
  const counts = {};
  const bump = (k) => (counts[k] = (counts[k] || 0) + 1);
  let shotDone = false;
  for (let i = 0; i < 4000; i++) {
    const modalOpen = await page.locator('#modal:not([hidden])').count();
    if (modalOpen) {
      const box = page.locator('#modalBox');
      const title = (await box.locator('h2').textContent()) || '';
      if (/saison/.test(title)) { bump('victoire'); await page.screenshot({ path: (process.env.CAPTURES || require('node:os').tmpdir()) + '/solo-fin.png' }); break; }
      if (/Contrôle/.test(title)) {
        bump('défausse');
        while (await box.locator('[data-ok]:disabled').count()) { await box.locator('[data-p]:not(:disabled)').first().click(); }
        await box.locator('[data-ok]').click(); continue;
      }
      if (/piocher/.test(title)) { bump('pioche'); await box.locator('[data-v]').first().click(); continue; }
      if (/Offre de/.test(title)) {
        bump('offre reçue');
        const acc = box.locator('[data-y]:not(:disabled)');
        if ((counts['offre reçue'] % 2) && await acc.count()) { bump('offre acceptée'); await acc.click(); } else await box.locator('[data-n]').click();
        continue;
      }
      if (/Réponses/.test(title)) { bump('réponses'); const k = box.locator('[data-k]:not([data-k="-1"])'); if (await k.count()) { bump('échange conclu'); await k.first().click(); } else await box.locator('[data-k="-1"]').click(); continue; }
      if (/Livraison|exclusivité/.test(title)) { bump('carte à choix'); const okb = box.locator('[data-ok]'); if (await okb.count()) { while (await box.locator('[data-ok]:disabled').count()) await box.locator('[data-p]:not(:disabled)').first().click(); await okb.click(); } else await box.locator('[data-r]').first().click(); continue; }
      throw new Error('fenêtre inconnue : ' + title);
    }
    const spot = page.locator('#board .spot, #board .espot, #board .hpick');
    if (await spot.count()) {
      const cancel = await page.locator('#hint [data-act="cancel"]').count();
      bump(cancel ? 'construction choisie' : 'sélection plateau');
      await spot.first().dispatchEvent('click');
      if (!shotDone && counts['construction choisie']) { shotDone = true; }
      continue;
    }
    const play = page.locator('[data-act="play"]:not(:disabled)');
    if (await play.count()) { bump('carte jouée'); await play.first().click(); continue; }
    if (await page.locator('[data-act="roll"]:not(:disabled)').count()) { bump('lancer'); await page.locator('[data-act="roll"]').click(); continue; }
    for (const k of ['city', 'settle', 'road']) {
      const b = page.locator(`[data-act="${k}"]:not(:disabled)`);
      if (await b.count()) { await b.click(); break; }
    }
    if (await page.locator('#board .spot, #board .espot').count()) continue;
    if (await page.locator('[data-act="dev"]:not(:disabled)').count()) { bump('carte tirée'); await page.locator('[data-act="dev"]').click(); continue; }
    if (counts.lancer % 5 === 2 && !counts['proposé' + counts.lancer] && await page.locator('[data-act="og"][data-d="1"]:not(:disabled)').count()) {
      counts['proposé' + counts.lancer] = 1;
      await page.locator('[data-act="og"][data-d="1"]:not(:disabled)').first().click();
      const want = page.locator('[data-act="ow"][data-d="1"]').last();
      await want.click();
      if (await page.locator('[data-act="propose"]:not(:disabled)').count()) { bump('proposition'); await page.locator('[data-act="propose"]').click(); continue; }
    }
    if (await page.locator('[data-act="end"]:not(:disabled)').count()) { bump('fin de tour'); await page.locator('[data-act="end"]').click(); continue; }
    await page.waitForTimeout(150);
  }
  await page.screenshot({ path: (process.env.CAPTURES || require('node:os').tmpdir()) + '/solo-milieu.png' });
  // Rechargement : la partie reprend là où elle en était
  const before = await page.locator('#log li').first().textContent();
  await page.reload(); await page.waitForSelector('#board polygon');
  const after = await page.locator('#log li').first().textContent();
  console.log(JSON.stringify(counts));
  console.log('reprise après rechargement :', before === after ? 'OK' : `différent (${before} / ${after})`);
  console.log('erreurs :', errors.length ? errors : 'aucune');
  await browser.close();
})().catch((e) => { console.error('ÉCHEC', e); process.exit(1); });
