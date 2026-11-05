// Une salle = une partie sur le serveur. Le serveur est l'arbitre : il détient l'état, fait tourner les saisons
// (par le moteur), fait jouer l'IA, surveille les délais et envoie à chacun sa vue.
//
// Places (meta.sieges[i].type) :
//   humain  : tenue par un joueur (jeton) ;
//   ouvert  : place humaine pas encore prise, jouée par l'IA, que quelqu'un peut reprendre avec le code ;
//   ia      : tenue par l'IA pour toute la partie.
// Un humain absent (délai dépassé) est joué par l'IA : en direct pour la décision en attente puis, après
// deux délais de suite, jusqu'à son retour ; en différé pour le reste de son tour.

import { randomBytes } from 'node:crypto';
import { createGame, applyAction, viewFor, aiStep, aiAction, waitingFor, deciders, NIVEAUX, SAISONS } from '../moteur/index.js';
import { CONFIG as DEFAULT_CONFIG } from './config.js';
import { emailValide } from './notifications.js';

const AI_NAMES = ['Brasserie du Moulin', 'La Mousse Noire', 'Les Fûts Joyeux', 'La Cuve Dorée'];
const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export const nouveauJeton = () => randomBytes(18).toString('base64url');
export function nouveauCode(existe) {
  for (;;) {
    const b = randomBytes(5);
    const code = Array.from(b, (x) => CODE_CHARS[x % CODE_CHARS.length]).join('');
    if (!existe(code)) return code;
  }
}
const cleanName = (n) => String(n ?? '').replace(/\s+/g, ' ').trim().slice(0, 28);
// Adresse facultative : vide → null ; invalide → erreur
function readEmail(e) {
  const v = String(e ?? '').trim();
  if (!v) return { email: null };
  return emailValide(v) ? { email: v } : { error: 'Adresse e-mail invalide.' };
}

// Joueurs dont une décision fait avancer la partie (les réponses d'échange sont bornées à part)
const decideurs = deciders;

function delayAfter(action, state) {
  if (action.type === 'respondTrade') return 250;
  if (action.type === 'endTurn') return 650;
  if (action.type === 'poser') return 700;
  return 420;
}
const SAISON_NOM = { printemps: 'Printemps', ete: 'Été', automne: 'Automne', hiver: 'Hiver' };

export class Salle {
  // deps : { base, now, setTimeout, clearTimeout, onTour(salle, siege), log }
  constructor({ code, statut, meta, etat }, deps) {
    this.code = code;
    this.statut = statut;
    this.meta = meta;
    this.etat = etat;
    this.deps = deps;
    this.sockets = new Set();
    this.aiTimer = null;
    this.dlTimer = null;
  }

  get config() { return this.deps.config ?? DEFAULT_CONFIG; }

  static creer({ nom, humains, mode, delai, email, niveau }, deps) {
    nom = cleanName(nom);
    if (!nom) return { error: 'Donne un nom à ta brasserie.' };
    const em = readEmail(email);
    if (em.error) return em;
    humains = Math.round(+humains);
    if (!(humains >= 1 && humains <= 4)) return { error: 'De 1 à 4 places humaines.' };
    if (!['direct', 'differe'].includes(mode)) return { error: 'Mode inconnu.' };
    niveau = NIVEAUX[niveau] ? niveau : 'compagnon';
    const CONFIG = deps.config ?? DEFAULT_CONFIG;
    const b = CONFIG.delays[mode];
    delai = Math.round(+delai || b.def);
    delai = Math.min(b.max, Math.max(b.min, delai));
    const code = nouveauCode(deps.base.codeExiste);
    const sieges = [0, 1, 2, 3].map((i) => (i === 0 ? { type: 'humain', nom, email: em.email } : i < humains ? { type: 'ouvert', nom: null } : { type: 'ia', nom: null }));
    const meta = { v: 1, mode, delai, humains, niveau, hote: 0, sieges, echeances: {}, echange: null, cree: deps.now() };
    deps.base.creerPartie(code, 'salle', meta, null);
    const jeton = nouveauJeton();
    deps.base.ajouterPlace(jeton, code, 0);
    return { salle: new Salle({ code, statut: 'salle', meta, etat: null }, deps), jeton, siege: 0 };
  }

  /* ---------- places ---------- */

  rejoindre(nom, email) {
    nom = cleanName(nom);
    if (!nom) return { error: 'Donne un nom à ta brasserie.' };
    const em = readEmail(email);
    if (em.error) return em;
    if (this.statut === 'fini') return { error: 'Cette partie est terminée.' };
    const siege = this.meta.sieges.findIndex((s) => s.type === 'ouvert');
    if (siege < 0) return { error: 'Toutes les places humaines sont prises.' };
    const taken = this.meta.sieges.some((s) => s.type === 'humain' && s.nom === nom) || this.etat?.players.some((p, i) => i !== siege && p.name === nom);
    if (taken) return { error: 'Ce nom est déjà pris dans cette partie.' };
    const seat = this.meta.sieges[siege];
    seat.type = 'humain';
    seat.nom = nom;
    seat.email = em.email;
    if (this.etat) {
      // Place reprise en cours de partie : l'IA rend la main
      this.etat = structuredClone(this.etat);
      this.etat.players[siege].name = nom;
      this.etat.players[siege].ai = false;
    }
    const jeton = nouveauJeton();
    this.deps.base.ajouterPlace(jeton, this.code, siege);
    this.changed();
    return { jeton, siege };
  }

  demarrer(siege) {
    if (this.statut !== 'salle') return { error: 'La partie a déjà commencé.' };
    if (siege !== this.meta.hote) return { error: 'Seul le créateur lance la partie.' };
    const used = new Set(this.meta.sieges.map((s) => s.nom).filter(Boolean));
    const free = AI_NAMES.filter((n) => !used.has(n));
    const players = this.meta.sieges.map((s) => (s.type === 'humain' ? { name: s.nom, ai: false } : { name: free.shift(), ai: true }));
    this.etat = createGame({ seed: nouveauJeton(), players, aiOffersToHumans: this.meta.mode === 'direct', niveau: this.meta.niveau ?? 'compagnon' });
    this.statut = 'jeu';
    this.changed();
    return { ok: true };
  }

  // Adresse de notification de sa place (vide = plus de messages)
  definirEmail(siege, email) {
    const em = readEmail(email);
    if (em.error) return em;
    this.meta.sieges[siege].email = em.email;
    this.sauver();
    this.diffuser();
    return { ok: true };
  }

  sauver() { this.deps.base.sauver(this.code, this.statut, this.meta, this.etat); }

  isAi(i) {
    const s = this.meta.sieges[i];
    return s.type !== 'humain' || !!s.absent || (s.autoTour !== undefined && s.autoTour !== null && this.etat && s.autoTour === this.etat.turn);
  }

  // Le joueur revient (message reçu) : il reprend la main
  present(siege) {
    const s = this.meta.sieges[siege];
    if (!s || s.type !== 'humain') return;
    if (s.absent || s.retards) { s.absent = false; s.retards = 0; this.changed({ acteur: siege }); }
  }

  /* ---------- jeu ---------- */

  agir(siege, action) {
    if (this.statut !== 'jeu') return { ok: false, error: this.statut === 'salle' ? "La partie n'a pas commencé." : 'La partie est terminée.' };
    if (this.meta.sieges[siege]?.type !== 'humain') return { ok: false, error: "Cette place est jouée par l'IA." };
    const r = applyAction(this.etat, siege, action);
    if (!r.ok) return r;
    this.etat = r.state;
    const s = this.meta.sieges[siege];
    s.absent = false; s.retards = 0; s.autoTour = null;
    this.changed({ acteur: siege });
    return { ok: true };
  }

  // Après tout changement : fin de partie, délais, sauvegarde, envoi des vues, IA
  changed({ acteur = null } = {}) {
    let fin = false;
    if (this.etat?.phase === 'over' && this.statut !== 'fini') { this.statut = 'fini'; fin = true; }
    if (this.statut === 'jeu') this.majEcheances(acteur);
    else { this.meta.echeances = {}; this.meta.echange = null; }
    this.sauver();
    this.diffuser();
    if (fin) this.deps.onFin?.(this);
    this.planifierIa();
    this.planifierEcheance();
  }

  majEcheances(acteur) {
    const now = this.deps.now(), m = this.meta, d = decideurs(this.etat);
    const next = {};
    for (const i of d) {
      if (this.isAi(i)) continue;
      const fresh = m.echeances[i] === undefined || i === acteur;
      next[i] = fresh ? now + m.delai * 1000 : m.echeances[i];
      if (m.echeances[i] === undefined) this.deps.onTour?.(this, i);
    }
    m.echeances = next;
    const t = this.etat.trade;
    if (!t) m.echange = null;
    else if (!m.echange || m.echange.id !== t.id) m.echange = { id: t.id, jusqua: now + this.config.tradeLimit[m.mode] * 1000 };
  }

  planifierIa() {
    if (this.aiTimer || this.statut !== 'jeu') return;
    if (!waitingFor(this.etat).some((i) => this.isAi(i))) return;
    this.aiTimer = this.deps.setTimeout(() => this.tourIa(), this.rythme(400));
  }
  rythme(ms) {
    if (this.meta.mode === 'direct') return ms * this.config.aiPace.direct;
    const someone = [...this.sockets].some((c) => c.siege !== null);
    return someone ? ms * this.config.aiPace.differe : 5;
  }
  tourIa() {
    this.aiTimer = null;
    if (this.statut !== 'jeu') return;
    let r;
    try {
      r = aiStep(this.etat, (i) => this.isAi(i));
    } catch (e) {
      this.deps.log?.(`[${this.code}] IA en erreur : ${e.message}`);
      return;
    }
    if (!r) return;
    this.etat = r.state;
    this.changed();
    if (this.aiTimer) { this.deps.clearTimeout(this.aiTimer); this.aiTimer = null; }
    if (this.statut === 'jeu') this.aiTimer = this.deps.setTimeout(() => this.tourIa(), this.rythme(delayAfter(r.action, this.etat)));
  }

  planifierEcheance() {
    if (this.dlTimer) { this.deps.clearTimeout(this.dlTimer); this.dlTimer = null; }
    if (this.statut !== 'jeu') return;
    const all = [...Object.values(this.meta.echeances), this.meta.echange?.jusqua].filter((x) => x !== undefined && x !== null);
    if (!all.length) return;
    const wait = Math.max(0, Math.min(...all) - this.deps.now());
    this.dlTimer = this.deps.setTimeout(() => this.echeance(), Math.min(wait + 20, 2 ** 31 - 1));
  }

  // Un délai est dépassé : offre fermée, ou l'IA joue à la place de l'absent
  echeance() {
    this.dlTimer = null;
    if (this.statut !== 'jeu') return;
    const now = this.deps.now(), m = this.meta;
    if (m.echange && m.echange.jusqua <= now && this.etat.trade) {
      const r = applyAction(this.etat, this.etat.trade.from, { type: 'cancelTrade' });
      if (r.ok) this.etat = r.state;
      m.echange = null;
    }
    for (const [k, t] of Object.entries(m.echeances)) {
      if (t > now) continue;
      const i = +k, seat = m.sieges[i];
      delete m.echeances[k];
      if (m.mode === 'differe') {
        seat.autoTour = this.etat.turn;
      } else {
        seat.retards = (seat.retards || 0) + 1;
        if (seat.retards >= 2) seat.absent = true;
        else {
          const a = aiAction(this.etat, i);
          const r = a && applyAction(this.etat, i, a);
          if (r?.ok) this.etat = r.state;
        }
      }
      this.deps.log?.(`[${this.code}] délai dépassé pour la place ${i} (${seat.nom})`);
    }
    this.changed();
  }

  /* ---------- connexions ---------- */

  attacher(client) { this.sockets.add(client); this.diffuser(); }
  detacher(client) { this.sockets.delete(client); this.diffuser(); }

  vue(siege) {
    const m = this.meta;
    return {
      t: 'partie',
      code: this.code,
      statut: this.statut,
      mode: m.mode,
      delai: m.delai,
      niveau: m.niveau ?? 'compagnon',
      siege,
      hote: siege === m.hote,
      email: m.sieges[siege]?.email ?? null,
      now: this.deps.now(),
      sieges: m.sieges.map((s, i) => ({
        nom: this.etat ? this.etat.players[i].name : s.nom,
        type: s.type,
        ia: this.statut !== 'salle' && this.isAi(i),
        absent: !!s.absent || (s.autoTour !== null && s.autoTour !== undefined && s.autoTour === this.etat?.turn),
        connecte: [...this.sockets].some((c) => c.siege === i),
        echeance: m.echeances[i] ?? null,
      })),
      echange: m.echange,
      view: this.etat ? viewFor(this.etat, siege) : null,
    };
  }

  diffuser() {
    for (const c of this.sockets) c.send(this.vue(c.siege));
  }

  // Résumé pour la liste « mes parties »
  resume(siege) {
    const s = this.etat, mine = s ? waitingFor(s).includes(siege) && !this.isAi(siege) : false;
    return {
      code: this.code, statut: this.statut, mode: this.meta.mode, siege,
      aMoi: this.statut === 'jeu' && mine,
      echeance: this.meta.echeances[siege] ?? null,
      tour: s?.turn ?? 0,
      saison: s && s.saison >= 0 ? `${SAISON_NOM[SAISONS[s.saison % 4]]} an ${Math.floor(s.saison / 4) + 1}` : null,
      joueurs: this.meta.sieges.map((x, i) => (s ? s.players[i].name : x.nom || (x.type === 'ouvert' ? 'Place libre' : 'IA'))),
      gagnant: s?.winner ?? null,
      maj: this.deps.now(),
    };
  }

  arreter() {
    if (this.aiTimer) this.deps.clearTimeout(this.aiTimer);
    if (this.dlTimer) this.deps.clearTimeout(this.dlTimer);
    this.aiTimer = this.dlTimer = null;
  }
}
