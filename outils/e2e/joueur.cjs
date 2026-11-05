// Joueur automatique côté page, commun aux scripts de bout en bout : une interaction par appel, ou false s'il n'y a rien à faire.
// Il joue par les boutons, comme un humain : fenêtres d'abord, puis brasser, poser un ouvrier, passer la main.
async function step(page, c) {
  const bump = (k) => (c[k] = (c[k] || 0) + 1);
  const click = async (sel, k) => { const b = page.locator(`${sel}:not(:disabled)`); if (await b.count()) { bump(k); await b.first().click(); return true; } return false; };
  if (await page.locator('#modal:not([hidden])').count()) {
    const box = page.locator('#modalBox'), title = (await box.locator('h2').textContent()) || '';
    if (/emporte/.test(title)) { bump('fin vue'); return 'fini'; }
    if (/Contamination|Canicule/.test(title)) { bump('perte'); await box.locator('[data-ferm]').first().click(); return true; }
    if (/Concours|Salon/.test(title)) { bump('concours'); await box.locator('[data-style]').first().click(); return true; }
    if (/Offre de/.test(title)) { bump('offre reçue'); const acc = box.locator('[data-y]:not(:disabled)'); try { if (await acc.count() && c['offre reçue'] % 2) { await acc.click({ timeout: 1500 }); bump('offre acceptée'); } else await box.locator('[data-n]').click({ timeout: 1500 }); } catch { bump('offre disparue'); } return true; }
    if (/Réponses/.test(title)) {
      const k = box.locator('[data-k]:not([data-k="-1"])');
      if (await k.count()) { bump('échange conclu'); await k.first().click(); return true; }
      if (/Fermer|Annuler/.test(await box.locator('[data-k="-1"]').textContent())) { await box.locator('[data-k="-1"]').click(); return true; }
      return false; // on attend les réponses
    }
    if (/Contre-proposition/.test(title)) { await box.locator('[data-cback]').click(); return true; }
    throw new Error('fenêtre inconnue : ' + title);
  }
  if (!(await page.locator('[data-act="end"]:not(:disabled)').count()) && !(await page.locator('.spot.can').count())) return false;
  // Boîte de choix ouverte : valider ou annuler
  if (await page.locator('#modebox .modebox').count()) {
    if (await click('#modebox [data-act="sel"][data-d="1"]', 'plus')) return true;
    if (await click('#modebox [data-act="poser"]', 'validation')) return true;
    return click('#modebox [data-act="cancel"]', 'annulation');
  }
  if (await page.locator('#file .client.can').count()) {
    if (await click('#file [data-act="poser"]', 'livraison')) return true;
    return click('#file [data-act="cancel"]', 'annulation');
  }
  if (await click('#brasser [data-act="brasser"]', 'brassin')) return true;
  if (await click('[data-act="salle"]', 'salle')) return true;
  if (await click('[data-mode="tournee"]', 'tournée')) return true;
  const stock = (await page.locator('#brasserie .stk b').allTextContents()).reduce((n, t) => n + +t, 0);
  if (stock > 3 && await click('[data-mode="marcheBieres"]', 'marché aux bières')) return true;
  if (await click('.spot.can [data-act="poser"]', 'récolte')) return true;
  if (await click('[data-mode="chantier"]', 'chantier')) return true;
  if (await click('[data-mode="marcheMat"]', 'marché aux matières')) return true;
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
module.exports = { step };
