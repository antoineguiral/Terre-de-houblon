// Copie cohérente de la base, même pendant que le serveur tourne (VACUUM INTO), et rotation.
//   node outils/sauvegarde.js <base.sqlite> <dossier> [jours gardés]
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readdirSync, unlinkSync, statSync } from 'node:fs';
import { join } from 'node:path';

const [src, dir, keep = '14'] = process.argv.slice(2);
if (!src || !dir) { console.error('usage : node outils/sauvegarde.js <base.sqlite> <dossier> [jours]'); process.exit(1); }
mkdirSync(dir, { recursive: true });
const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
const dest = join(dir, `parties-${stamp}.sqlite`);
const db = new DatabaseSync(src, { readOnly: true });
db.exec(`VACUUM INTO '${dest.replace(/'/g, "''")}'`);
db.close();
const limit = Date.now() - +keep * 86400e3;
for (const f of readdirSync(dir)) {
  const p = join(dir, f);
  if (/^parties-.*\.sqlite$/.test(f) && statSync(p).mtimeMs < limit) unlinkSync(p);
}
console.log(`sauvegarde : ${dest}`);
