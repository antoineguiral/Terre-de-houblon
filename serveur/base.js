// Persistance SQLite (module node:sqlite intégré à Node, aucune dépendance native).
// Une ligne par partie : l'état complet du moteur et les méta-données (places, délais) en JSON.
// Les jetons de place sont indexés à part pour retrouver sa partie.

import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export function openBase(path) {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;
    PRAGMA busy_timeout = 5000;
    CREATE TABLE IF NOT EXISTS parties (
      code TEXT PRIMARY KEY,
      statut TEXT NOT NULL,          -- salle | jeu | fini
      meta TEXT NOT NULL,
      etat TEXT,
      cree INTEGER NOT NULL,
      maj INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS places (
      jeton TEXT PRIMARY KEY,
      code TEXT NOT NULL REFERENCES parties(code) ON DELETE CASCADE,
      siege INTEGER NOT NULL,
      cree INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS places_code ON places(code);
  `);
  const q = {
    insertPartie: db.prepare('INSERT INTO parties (code, statut, meta, etat, cree, maj) VALUES (?, ?, ?, ?, ?, ?)'),
    savePartie: db.prepare('UPDATE parties SET statut = ?, meta = ?, etat = ?, maj = ? WHERE code = ?'),
    getPartie: db.prepare('SELECT * FROM parties WHERE code = ?'),
    actives: db.prepare("SELECT * FROM parties WHERE statut IN ('salle', 'jeu')"),
    insertPlace: db.prepare('INSERT INTO places (jeton, code, siege, cree) VALUES (?, ?, ?, ?)'),
    getPlace: db.prepare('SELECT * FROM places WHERE jeton = ?'),
    codeExiste: db.prepare('SELECT 1 FROM parties WHERE code = ?'),
    jetonDe: db.prepare('SELECT jeton FROM places WHERE code = ? AND siege = ? ORDER BY cree DESC LIMIT 1'),
  };
  const parse = (row) => row && { ...row, meta: JSON.parse(row.meta), etat: row.etat ? JSON.parse(row.etat) : null };
  return {
    db,
    creerPartie(code, statut, meta, etat) {
      const now = Date.now();
      q.insertPartie.run(code, statut, JSON.stringify(meta), etat ? JSON.stringify(etat) : null, now, now);
    },
    sauver(code, statut, meta, etat) {
      q.savePartie.run(statut, JSON.stringify(meta), etat ? JSON.stringify(etat) : null, Date.now(), code);
    },
    partie: (code) => parse(q.getPartie.get(code)),
    partiesActives: () => q.actives.all().map(parse),
    ajouterPlace(jeton, code, siege) { q.insertPlace.run(jeton, code, siege, Date.now()); },
    place: (jeton) => q.getPlace.get(jeton),
    codeExiste: (code) => !!q.codeExiste.get(code),
    jetonDe: (code, siege) => q.jetonDe.get(code, siege)?.jeton ?? null,
    close: () => db.close(),
  };
}
