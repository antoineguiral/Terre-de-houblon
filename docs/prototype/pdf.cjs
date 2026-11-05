// Génère le PDF du prototype papier depuis fiche.html : node docs/prototype/pdf.cjs
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch(); const p = await b.newPage();
  await p.goto('file://' + __dirname + '/fiche.html'); await p.waitForTimeout(300);
  await p.pdf({ path: __dirname + '/brassins-prototype.pdf', format: 'A4', printBackground: true, margin: { top: '10mm', bottom: '10mm', left: '10mm', right: '10mm' } });
  await b.close();
})();
