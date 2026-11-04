// Partie solo complète jouée dans Chrome, par les boutons de la page : node outils/e2e/solo.cjs
// Prérequis : la page servie sur http://localhost:8642 (npm run page). Captures dans $CAPTURES (ou le dossier temporaire).
const { chromium } = require('playwright');
const dir = process.env.CAPTURES || require('node:os').tmpdir();
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1300, height: 1000 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/ERR_TUNNEL|net::/.test(m.text())) errors.push('console: ' + m.text()); });
  await page.goto('http://localhost:8642/#solo');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForSelector('#board polygon');
  const counts = {};
  const bump = (k) => (counts[k] = (counts[k] || 0) + 1);
  let shots = 0, lastSeason = '';
  for (let i = 0; i < 6000; i++) {
    if (await page.locator('#modal:not([hidden])').count()) {
      const box = page.locator('#modalBox');
      const title = (await box.locator('h2').textContent()) || '';
      if (/emporte/.test(title)) { bump('fin'); await page.screenshot({ path: `${dir}/solo-fin.png` }); break; }
      if (/Offre de/.test(title)) { bump('offre reçue'); const acc = box.locator('[data-y]:not(:disabled)'); if (await acc.count() && i % 2) await acc.click(); else await box.locator('[data-n]').click(); }
      else if (/Réponses/.test(title)) { bump('réponses'); const c = box.locator('[data-k]:not([data-k="-1"])'); if (await c.count()) await c.first().click(); else await box.locator('[data-k="-1"]').click(); }
      else if (/Contamination|Canicule/.test(title)) { bump('perte'); await box.locator('[data-ferm]').first().click(); }
      else if (/Concours/.test(title)) { bump('concours'); await box.locator('[data-style]').first().click(); }
      else { bump('autre fenêtre ' + title); await box.locator('button:not(:disabled)').first().click(); }
      await page.waitForTimeout(150);
      continue;
    }
    const hp = page.locator('.hpick');
    if (await hp.count()) { bump('placement'); await hp.first().click({ force: true }); await page.waitForTimeout(200); continue; }
    const cp = page.locator('.cpick');
    if (await cp.count()) { bump('tournée'); await cp.first().click({ force: true }); await page.waitForTimeout(200); continue; }
    const end = page.locator('[data-act="end"]:not(:disabled)');
    if (!(await end.count())) { await page.waitForTimeout(250); continue; }
    // mon tour : livrer, s'équiper, brasser, vendre le surplus, puis passer
    const season = await page.locator('#saison b').first().textContent().catch(() => '');
    if (season && season !== lastSeason && shots < 3 && /an 2/.test(season)) { lastSeason = season; shots++; await page.screenshot({ path: `${dir}/solo-${shots}.png`, fullPage: true }); }
    const tryClick = async (sel, k) => { const b = page.locator(`${sel}:not(:disabled)`); if (await b.count()) { bump(k); await b.first().click(); await page.waitForTimeout(80); return true; } return false; };
    if (await tryClick('[data-act="livrer"]', 'livraison')) continue;
    if (await tryClick('[data-act="ameliorer"]', 'amélioration')) continue;
    if (await tryClick('[data-act="brasser"]', 'brassin')) continue;
    if (await tryClick('[data-act="torrefier"]', 'torréfaction')) continue;
    const stock = await page.locator('#brasserie .stk b').allTextContents();
    const units = stock.reduce((n, t) => n + +t, 0);
    if (units > 4 && await tryClick('[data-act="salle"]', 'salle')) continue;
    if (units > 4 && await tryClick('[data-act="vendre"]', 'vente')) continue;
    if (i % 5 === 0 && await tryClick('[data-act="acheter"]', 'achat')) continue;
    bump('fin de tour'); await end.click(); await page.waitForTimeout(120);
  }
  console.log(JSON.stringify(counts));
  console.log('scores :', await page.locator('.scores b').allTextContents());
  if (errors.length) { console.log('ERREURS', errors.slice(0, 5)); process.exitCode = 1; }
  await browser.close();
})();
