// Démarrage et navigation : accueil, mode solo (sans serveur), partie en réseau.
//   #accueil (ou rien)   écran d'accueil
//   #solo                partie solo dans le navigateur
//   #p=<jeton>           sa place dans une partie en réseau (lien personnel, transmissible)
//   #rejoindre=<code>    accueil avec le code pré-rempli

import { createUi } from './rendu.js';
import { startSolo } from './solo.js';
import { connexion } from './reseau.js';
import { SERVEUR, PAGE } from './config.js';
import { renderAccueil, renderSalle, delaiOptions, duree, esc, blocEmail } from './accueil.js';

const $ = (s) => document.querySelector(s);
const store = {
  get(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* stockage indisponible */ } },
};
const places = () => store.get('tdh-places', []);
function addPlace(p) {
  const l = places().filter((x) => x.jeton !== p.jeton);
  l.unshift({ ...p, ajout: Date.now() });
  store.set('tdh-places', l.slice(0, 60));
}
const dropPlaces = (keep) => store.set('tdh-places', places().filter((x) => keep(x)));

let mode = null, solo = null, conn = null, current = null, last = null, offset = 0;
const home = { erreur: '', parties: null, code: '', mode: 'direct' };

const ui = createUi({
  send: (a) => (mode === 'solo' ? solo.send(a) : sendAction(a)),
  onNewGame: () => solo?.newGame(),
  onHome: () => go('#accueil'),
});

/* ---------- réseau ---------- */

function getConn() {
  if (!conn) conn = connexion(SERVEUR, { onMessage, onStatus });
  return conn;
}
function onStatus(s) {
  const el = $('#netstat');
  const txt = { connexion: mode === 'reseau' ? 'Connexion…' : '', ok: '', perdu: 'Connexion perdue, reconnexion…', injoignable: 'Serveur injoignable, nouvel essai…' }[s];
  el.hidden = !txt;
  el.textContent = txt;
  el.classList.toggle('bad', s === 'perdu' || s === 'injoignable');
}
function onMessage(m) {
  if (m.t === 'partie' && mode === 'reseau' && current) {
    last = m;
    offset = m.now - Date.now();
    current.code = m.code;
    addPlace({ jeton: current.jeton, code: m.code, mode: m.mode });
    renderReseau();
  }
  if (m.t === 'mesparties') {
    const found = new Set(m.parties.map((p) => p.jeton));
    dropPlaces((x) => found.has(x.jeton));
    home.parties = m.parties;
    if (mode === 'accueil') renderHome();
  }
}
async function sendAction(action) {
  const r = await getConn().send({ t: 'action', action });
  return r.t === 'ok' ? { ok: true } : { ok: false, error: r.error };
}

function statutPlace(s) {
  if (s.type === 'ia') return 'IA';
  if (s.type === 'ouvert') return 'place libre · IA';
  if (s.absent) return "absente · l'IA joue";
  if (!s.connecte) return 'hors ligne';
  return '';
}

function renderReseau() {
  const m = last;
  $('#codechip').textContent = m.code;
  $('#codechip').hidden = false;
  if (m.statut === 'salle') {
    show('salle');
    renderSalle($('#salle'), m, { jeton: current.jeton, page: PAGE });
    return;
  }
  show('jeu');
  // Carte « Prévenir par e-mail » (différé) : redessinée seulement si l'adresse change, pour ne pas effacer la saisie
  const notif = $('#notif');
  notif.hidden = m.mode !== 'differe';
  if (m.mode === 'differe' && notif.dataset.email !== String(m.email)) {
    notif.dataset.email = String(m.email);
    $('#notifBody').innerHTML = blocEmail(m.email);
  }
  const view = { ...m.view, players: m.view.players.map((p, i) => ({ ...p, status: statutPlace(m.sieges[i]) })) };
  ui.update(view, { busy: false, rejouer: false });
  chrono();
}

// Compte à rebours sous les dés : qui doit jouer et combien de temps avant que l'IA joue à sa place
function chrono() {
  const el = $('#chrono');
  const m = last;
  if (mode !== 'reseau' || !m || m.statut !== 'jeu') { el.hidden = true; return; }
  const now = Date.now() + offset, lines = [];
  let urgent = false;
  const mine = m.sieges[m.siege].echeance;
  if (mine) {
    const left = mine - now;
    urgent = m.mode === 'direct' && left < 20000;
    lines.push(`Il te reste ${duree(left)} pour jouer, ensuite l'ordinateur joue à ta place.`);
  } else {
    m.sieges.forEach((s, i) => {
      if (i !== m.siege && s.echeance) lines.push(`${esc(s.nom)} a encore ${duree(s.echeance - now)} pour jouer.`);
    });
  }
  if (m.echange && m.view.trade) lines.push(`Offre d'échange ouverte encore ${duree(m.echange.jusqua - now)}.`);
  el.hidden = !lines.length;
  el.innerHTML = lines.join('<br>');
  el.classList.toggle('urgent', urgent);
}
setInterval(chrono, 1000);

/* ---------- écrans ---------- */

function show(which) {
  $('#accueil').hidden = which !== 'accueil';
  $('#salle').hidden = which !== 'salle';
  if (which !== 'salle') $('#salle').innerHTML = ''; // pas d'identifiants en double avec la carte e-mail du jeu
  $('#jeu').hidden = which !== 'jeu';
  $('#btnNew').hidden = mode !== 'solo';
  $('#btnAccueil').hidden = mode === 'accueil';
  if (mode !== 'reseau') { $('#codechip').hidden = true; $('#notif').hidden = true; delete $('#notif').dataset.email; }
}

function renderHome() {
  renderAccueil($('#accueil'), { nom: store.get('tdh-nom', ''), email: store.get('tdh-email', ''), parties: home.parties, erreur: home.erreur, code: home.code, mode: home.mode });
}
function refreshParties() {
  if (!places().length) { home.parties = null; return; }
  getConn().send({ t: 'mesparties', jetons: places().map((p) => p.jeton) });
}

function leaveReseau() {
  if (current && conn) { conn.setHello(null); conn.send({ t: 'quitter' }); }
  current = null; last = null;
}

async function openPlace(jeton) {
  solo?.stop();
  if (current?.jeton === jeton) return;
  leaveReseau();
  mode = 'reseau';
  current = { jeton };
  ui.reset();
  show('chargement');
  const c = getConn();
  c.setHello(() => ({ t: 'hello', jeton }));
  const r = await c.send({ t: 'hello', jeton });
  if (r.t === 'refus' && current?.jeton === jeton) {
    if (r.code === 'jeton') dropPlaces((x) => x.jeton !== jeton);
    home.erreur = r.error;
    go('#accueil');
  }
}

function openSolo() {
  leaveReseau();
  mode = 'solo';
  ui.reset();
  if (!solo) solo = startSolo(ui);
  show('jeu');
  solo.start();
}

function openHome(code) {
  leaveReseau();
  solo?.stop();
  mode = 'accueil';
  if (code) home.code = code;
  show('accueil');
  renderHome();
  home.erreur = '';
  refreshParties();
}

function route() {
  const h = location.hash;
  if (h.startsWith('#p=')) return openPlace(decodeURIComponent(h.slice(3)));
  if (h === '#solo') return openSolo();
  return openHome(h.startsWith('#rejoindre=') ? decodeURIComponent(h.slice(11)).toUpperCase().slice(0, 5) : '');
}
function go(hash) {
  if (location.hash === hash) route();
  else location.hash = hash;
}
window.addEventListener('hashchange', route);
setInterval(() => { if (mode === 'accueil' && places().length) refreshParties(); }, 30000);

/* ---------- formulaires ---------- */

// Erreur affichée sous le formulaire concerné, sans le redessiner (la saisie est conservée)
function entrer(r, nom, email, errId) {
  if (r.t !== 'place') {
    const el = $(`#${errId}`);
    if (el) el.textContent = r.error;
    return;
  }
  store.set('tdh-nom', nom);
  if (email) store.set('tdh-email', email);
  addPlace({ jeton: r.jeton, code: r.code });
  go(`#p=${encodeURIComponent(r.jeton)}`);
}

async function onHomeClick(e) {
  const b = e.target.closest('[data-h]');
  if (!b || b.disabled) return;
  const h = b.dataset.h;
  if (h === 'solo') return go('#solo');
  if (h === 'ouvrir') return go(`#p=${encodeURIComponent(b.dataset.j)}`);
  if (h === 'creer') {
    const nom = $('#fNom').value.trim();
    const m = document.querySelector('input[name=fMode]:checked').value;
    const email = m === 'differe' ? $('#fMail').value.trim() : '';
    b.disabled = true;
    const r = await getConn().send({ t: 'creer', nom, humains: +$('#fHum').value, mode: m, delai: +$('#fDelai').value, email });
    b.disabled = false;
    return entrer(r, nom, email, 'fErr');
  }
  if (h === 'rejoindre') {
    const nom = $('#jNom').value.trim(), code = $('#jCode').value.trim().toUpperCase();
    if (!code) { $('#jErr').textContent = 'Saisis le code de la partie.'; return; }
    b.disabled = true;
    const email = $('#jMail').value.trim();
    const r = await getConn().send({ t: 'rejoindre', code, nom, email });
    b.disabled = false;
    return entrer(r, nom, email, 'jErr');
  }
  if (h === 'lancer') {
    b.disabled = true;
    const r = await getConn().send({ t: 'demarrer' });
    if (r.t === 'refus') { b.disabled = false; $('#salleErr').textContent = r.error; }
    return;
  }
  if (h === 'email') {
    const zone = b.closest('#notif') ? '#notif' : '#salle', email = $(`${zone} #mEmail`).value.trim();
    b.disabled = true;
    const r = await getConn().send({ t: 'email', email });
    b.disabled = false;
    // La vue mise à jour arrive avant la réponse et peut avoir redessiné la carte : on cherche le message après
    const msg = $(`${zone} #mEmailMsg`);
    msg.className = r.t === 'ok' ? 'okmsg' : 'err';
    msg.textContent = r.t === 'ok' ? (email ? 'Adresse enregistrée.' : 'Plus de messages pour cette partie.') : r.error;
    if (r.t === 'ok' && email) store.set('tdh-email', email);
    return;
  }
  if (h === 'copier') {
    try { await navigator.clipboard.writeText(b.dataset.txt); b.textContent = 'Copié'; } catch { b.previousElementSibling?.select(); b.textContent = 'Sélectionné'; }
    setTimeout(() => { b.textContent = 'Copier'; }, 1800);
  }
}
$('#accueil').addEventListener('click', onHomeClick);
$('#salle').addEventListener('click', onHomeClick);
$('#notif').addEventListener('click', onHomeClick);
$('#accueil').addEventListener('change', (e) => {
  if (e.target.name === 'fMode') { home.mode = e.target.value; $('#fDelai').innerHTML = delaiOptions(home.mode); $('#fMailWrap').hidden = home.mode !== 'differe'; }
});
$('#accueil').addEventListener('keydown', (e) => {
  if (e.key !== 'Enter' || e.target.tagName !== 'INPUT') return;
  const act = e.target.id.startsWith('j') ? 'rejoindre' : e.target.id === 'mEmail' ? null : 'creer';
  if (!act) return;
  $(`#accueil [data-h="${act}"]`).click();
});

route();
