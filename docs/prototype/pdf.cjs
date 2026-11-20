// Génère le PDF du prototype papier depuis fiche.html : node docs/prototype/pdf.cjs
// La page est un module qui importe client/dessins.js et moteur/ : on sert le dépôt en HTTP le temps du rendu.
const { chromium } = require('playwright');
const http = require('node:http'), fs = require('node:fs'), path = require('node:path');
const racine = path.resolve(__dirname, '..', '..');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.woff2': 'font/woff2', '.css': 'text/css' };
const srv = http.createServer((req, res) => {
  const f = path.join(racine, decodeURIComponent(req.url.split('?')[0]));
  if (!f.startsWith(racine) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': TYPES[path.extname(f)] ?? 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
});
srv.listen(0, '127.0.0.1', async () => {
  const b = await chromium.launch(); const p = await b.newPage();
  p.on('pageerror', (e) => console.error('erreur page :', e.message));
  await p.goto(`http://127.0.0.1:${srv.address().port}/docs/prototype/fiche.html`);
  await p.waitForFunction(() => window.pret === true, null, { timeout: 20000 });
  await p.waitForTimeout(300);
  await p.pdf({ path: path.join(__dirname, 'brassins-prototype.pdf'), format: 'A4', printBackground: true, margin: { top: '9mm', bottom: '9mm', left: '9mm', right: '9mm' } });
  await b.close(); srv.close();
  console.log('brassins-prototype.pdf écrit');
});
