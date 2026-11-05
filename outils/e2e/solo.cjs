// Partie solo complète jouée dans Chrome, par les boutons de la page : node outils/e2e/solo.cjs
// Prérequis : la page servie sur http://localhost:8642 (npm run page). Captures dans $CAPTURES (ou le dossier temporaire).
const { chromium } = require('playwright');
const { step } = require('./joueur.cjs');
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
  await page.waitForSelector('#cases .spot');
  const counts = {};
  let shots = 0, lastSeason = '', r = null;
  for (let i = 0; i < 8000 && r !== 'fini'; i++) {
    const season = await page.locator('#saison .stitle b').first().textContent().catch(() => '');
    if (season && season !== lastSeason && shots < 3 && /an 2/.test(season)) { lastSeason = season; shots++; await page.screenshot({ path: `${dir}/solo-${shots}.png`, fullPage: true }); }
    r = await step(page, counts);
    if (i % 300 === 0) console.log(i, season, JSON.stringify(counts), (await page.locator('#hint').textContent()).trim());
    await page.waitForTimeout(r ? 80 : 250);
  }
  await page.screenshot({ path: `${dir}/solo-fin.png` });
  console.log(JSON.stringify(counts));
  console.log('scores :', await page.locator('.scores b').allTextContents());
  if (r !== 'fini') { console.log('PARTIE NON FINIE'); process.exitCode = 1; }
  if (errors.length) { console.log('ERREURS', errors.slice(0, 5)); process.exitCode = 1; }
  await browser.close();
})();
