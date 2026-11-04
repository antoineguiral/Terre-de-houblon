// Écrans hors plateau : accueil (jouer seul, créer, rejoindre, mes parties) et salle d'attente.

import { PCOL } from './rendu.js';
import { NIVEAUX } from '../moteur/index.js';

export const esc = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const MODES = { direct: 'En direct', differe: 'En différé' };
export const DELAIS = {
  direct: [[60, '1 min'], [90, '1 min 30'], [180, '3 min'], [300, '5 min']],
  differe: [[43200, '12 h'], [86400, '24 h'], [172800, '48 h']],
};
export const DELAI_DEFAUT = { direct: 90, differe: 86400 };

export function duree(ms) {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s} s`;
  if (s < 3600) { const m = Math.floor(s / 60), r = s % 60; return r ? `${m} min ${String(r).padStart(2, '0')}` : `${m} min`; }
  if (s < 86400) { const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60); return m && h < 6 ? `${h} h ${String(m).padStart(2, '0')}` : `${h} h`; }
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600);
  return h ? `${d} j ${h} h` : `${d} j`;
}
export const delaiTexte = (mode, s) => DELAIS[mode].find(([v]) => v === s)?.[1] ?? duree(s * 1000);
export const delaiOptions = (mode, sel = DELAI_DEFAUT[mode]) => DELAIS[mode].map(([v, t]) => `<option value="${v}" ${v === sel ? 'selected' : ''}>${t}</option>`).join('');

function ligneParte(p, now) {
  const moi = p.joueurs[p.siege];
  const autres = p.joueurs.filter((_, i) => i !== p.siege).join(', ');
  let st, detail;
  if (p.statut === 'salle') { st = "Salle d'attente"; detail = 'En attente du lancement'; }
  else if (p.statut === 'fini') { st = p.gagnant === p.siege ? 'Gagnée' : 'Terminée'; detail = p.gagnant !== null ? `${esc(p.joueurs[p.gagnant])} a la brasserie la plus réputée` : 'Partie terminée'; }
  else if (p.aMoi) { st = 'À toi'; detail = p.echeance ? `Il te reste ${duree(p.echeance - now)}` : 'À toi de jouer'; }
  else { st = 'En cours'; detail = `Tour ${p.tour}`; }
  return `<button class="grow2 ${p.aMoi ? 'mine' : ''}" data-h="ouvrir" data-j="${esc(p.jeton)}">
    <b>${esc(moi)} · ${MODES[p.mode]} · ${esc(p.code)}</b><span class="st">${st}</span>
    <small>${detail} · contre ${esc(autres)}</small></button>`;
}

// Champ e-mail commun (formulaires et réglage en partie)
export const champEmail = (id, value, label = 'E-mail (facultatif)') => `<label class="field">${label}<input type="email" id="${id}" maxlength="200" autocomplete="email" value="${esc(value)}" placeholder="toi@exemple.fr"></label>`;
const AIDE_MAIL = '<p class="hintsmall">En différé, on te prévient par e-mail quand c’est ton tour. Un lien dans chaque message permet d’arrêter.</p>';

export const niveauOptions = (sel = 'compagnon') => Object.entries(NIVEAUX).map(([k, n]) => `<option value="${k}" ${k === sel ? 'selected' : ''}>${n.nom} · ${n.txt}</option>`).join('');

export function renderAccueil(el, { nom, email, parties, erreur, code, mode, solo }) {
  const now = Date.now();
  const rang = (p) => (p.aMoi ? 0 : p.statut === 'jeu' ? 1 : p.statut === 'salle' ? 2 : 3);
  const liste = parties ? [...parties].sort((a, b) => rang(a) - rang(b)) : null;
  const finies = liste ? liste.filter((p) => p.statut === 'fini').slice(0, 5) : [];
  const actives = liste ? liste.filter((p) => p.statut !== 'fini') : [];
  el.innerHTML = `
    ${erreur ? `<div class="card wide"><p class="err" role="alert">${esc(erreur)}</p></div>` : ''}
    ${liste && liste.length ? `<div class="card wide"><h2>Mes parties</h2><div class="glist">${[...actives, ...finies].map((p) => ligneParte(p, now)).join('')}</div></div>` : ''}
    <div class="card">
      <h2>Jouer seul</h2>
      <p>Contre des brasseries gérées par l'ordinateur, sans connexion. La partie en cours est gardée dans ce navigateur.</p>
      <div class="row2">
        <label class="field">Adversaires<select id="sAdv">${[1, 2, 3].map((n) => `<option value="${n}" ${n === solo.adversaires ? 'selected' : ''}>${n} brasserie${n > 1 ? 's' : ''}</option>`).join('')}</select></label>
        <label class="field">Niveau<select id="sNiv">${niveauOptions(solo.niveau)}</select></label>
      </div>
      <button class="btn primary" data-h="solo">Jouer seul</button>
    </div>
    <div class="card">
      <h2>Rejoindre une partie</h2>
      <p>Avec le code que t'a donné le créateur de la partie.</p>
      <div class="row2">
        <label class="field">Code<input type="text" id="jCode" class="code" maxlength="5" autocomplete="off" value="${esc(code)}" placeholder="ABCDE"></label>
        <label class="field">Ta brasserie<input type="text" id="jNom" maxlength="28" value="${esc(nom)}" placeholder="Nom de ta brasserie"></label>
      </div>
      ${champEmail('jMail', email)}${AIDE_MAIL}
      <button class="btn primary" data-h="rejoindre">Rejoindre</button>
      <p class="err" id="jErr" role="alert"></p>
    </div>
    <div class="card wide">
      <h2>Créer une partie</h2>
      <p>Les places sans joueur sont tenues par l'ordinateur. En différé, chacun joue quand il veut et reçoit un message quand c'est son tour.</p>
      <div class="row2">
        <label class="field">Ta brasserie<input type="text" id="fNom" maxlength="28" value="${esc(nom)}" placeholder="Nom de ta brasserie"></label>
        <label class="field">Joueurs humains<select id="fHum">${[1, 2, 3, 4].map((n) => `<option value="${n}" ${n === 2 ? 'selected' : ''}>${n} ${n > 1 ? 'joueurs' : 'joueur'} · ${4 - n} IA</option>`).join('')}</select></label>
      </div>
      <div class="row2">
        <label class="field">Niveau des IA<select id="fNiv">${niveauOptions('compagnon')}</select></label>
        <span></span>
      </div>
      <div class="row2">
        <div class="field">Rythme<div class="seg" role="radiogroup">
          <label><input type="radio" name="fMode" value="direct" ${mode === 'direct' ? 'checked' : ''}><span>En direct</span></label>
          <label><input type="radio" name="fMode" value="differe" ${mode === 'differe' ? 'checked' : ''}><span>En différé</span></label>
        </div></div>
        <label class="field">Temps pour jouer<select id="fDelai">${delaiOptions(mode)}</select></label>
      </div>
      <div id="fMailWrap" ${mode === 'differe' ? '' : 'hidden'}>${champEmail('fMail', email)}${AIDE_MAIL}</div>
      <button class="btn primary" data-h="creer">Créer la partie</button>
      <p class="err" id="fErr" role="alert"></p>
    </div>`;
}

export function renderSalle(el, m, { jeton, page }) {
  const invite = `${page}#rejoindre=${m.code}`, perso = `${page}#p=${jeton}`;
  const hote = m.sieges[0];
  const libres = m.sieges.filter((s) => s.type === 'ouvert').length;
  el.innerHTML = `
    <div class="card">
      <h2>Salle d'attente</h2>
      <div class="bigcode" aria-label="Code de la partie">${esc(m.code)}</div>
      <p>${MODES[m.mode]} · ${delaiTexte(m.mode, m.delai)} pour jouer, sinon l'ordinateur joue à la place de l'absent.</p>
      <div class="field">Lien d'invitation<div class="share"><input type="text" readonly value="${esc(invite)}"><button class="btn" data-h="copier" data-txt="${esc(invite)}">Copier</button></div></div>
      <div class="field">Ton lien personnel, pour reprendre ta place sur un autre appareil (ne le partage pas)<div class="share"><input type="text" readonly value="${esc(perso)}"><button class="btn" data-h="copier" data-txt="${esc(perso)}">Copier</button></div></div>
    </div>
    <div class="card">
      <h2>Brasseries</h2>
      ${m.sieges.map((s, i) => `<div class="seat"><span class="sw" style="background:${PCOL[i]}"></span>
        <div><b>${s.type === 'humain' ? esc(s.nom) : s.type === 'ouvert' ? 'Place libre' : "Tenue par l'ordinateur"}${i === m.siege ? ' (toi)' : ''}</b><br>
        <small>${s.type === 'humain' ? (s.connecte ? 'Connectée' : 'Hors ligne') : s.type === 'ouvert' ? "En attente d'un joueur ; l'ordinateur la tient si personne ne vient" : 'Ordinateur'}</small></div>
        <span></span></div>`).join('')}
      ${m.hote
        ? `<button class="btn primary" data-h="lancer">Lancer la partie</button>${libres ? `<p>${libres > 1 ? `${libres} places libres seront tenues` : 'La place libre sera tenue'} par l'ordinateur jusqu'à l'arrivée d'un joueur.</p>` : ''}`
        : `<p>${esc(hote.nom)} lancera la partie.</p>`}
      <p class="err" id="salleErr" role="alert"></p>
    </div>
    ${m.mode === 'differe' ? `<div class="card wide"><h2>Prévenir par e-mail</h2>${blocEmail(m.email)}</div>` : ''}`;
}

// Réglage de l'adresse de notification de sa place (salle d'attente et partie en différé)
export function blocEmail(email) {
  return `${champEmail('mEmail', email || '', 'Ton adresse')}
    <p class="hintsmall">${email ? 'Tu seras prévenu à cette adresse quand ce sera ton tour. Vide le champ pour ne plus recevoir de messages.' : 'Laisse ton adresse pour être prévenu quand c’est ton tour.'}</p>
    <div class="mrow"><button class="btn" data-h="email">Enregistrer</button></div>
    <p class="okmsg" id="mEmailMsg" role="status"></p>`;
}
