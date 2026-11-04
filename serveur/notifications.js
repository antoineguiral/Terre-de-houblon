// Notifications par e-mail des parties en différé (Brevo, API transactionnelle).
//
// Quand une place humaine doit jouer (son tour, une défausse) et que le joueur n'est pas connecté, on attend
// une minute (il est peut-être en train d'arriver), puis on envoie un e-mail avec son lien personnel.
// Un message au plus par place et par tour, et jamais deux à moins de 15 minutes d'écart.
// À la fin de la partie, chaque joueur absent avec une adresse reçoit le résultat.
// Sans BREVO_API_KEY, rien n'est envoyé (journalisé une fois).

import { waitingFor } from '../moteur/index.js';

const GRACE_MS = 60 * 1000;
const ESPACEMENT_MS = 15 * 60 * 1000;

export const emailValide = (e) => typeof e === 'string' && e.length <= 200 && /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]{2,}$/.test(e);
const esc = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function dateLimite(ms) {
  return new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris' })
    .format(new Date(ms)).replace(':', ' h ');
}

// Envoi par l'API Brevo. Renvoie { ok } ou { ok: false, error }.
export function envoyeurBrevo({ apiKey, from, fromName = 'Brassins' }) {
  return async ({ to, subject, html, text, unsubscribe }) => {
    const r = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'api-key': apiKey, 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({
        sender: { name: fromName, email: from },
        to: [{ email: to }],
        subject, htmlContent: html, textContent: text,
        headers: { 'List-Unsubscribe': `<${unsubscribe}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' },
        tags: ['brassins'],
      }),
    });
    if (r.ok) return { ok: true };
    return { ok: false, error: `Brevo ${r.status} : ${(await r.text()).slice(0, 300)}` };
  };
}

function gabarit({ titre, lignes, bouton, lien, desabo, code }) {
  const html = `<!doctype html><html lang="fr"><body style="margin:0;background:#211915;padding:24px 12px;font-family:Helvetica,Arial,sans-serif;color:#f2e6d0">
  <div style="max-width:520px;margin:0 auto;background:#2c221c;border:1px solid #4b3b30;border-radius:8px;padding:24px">
    <div style="font-family:Georgia,serif;font-size:26px;color:#d38b46;margin-bottom:6px">Brassins</div>
    <h1 style="font-size:20px;margin:0 0 14px;color:#f2e6d0">${esc(titre)}</h1>
    ${lignes.map((l) => `<p style="margin:0 0 12px;font-size:15px;line-height:1.5">${l}</p>`).join('')}
    <p style="margin:20px 0"><a href="${esc(lien)}" style="background:#d38b46;color:#1a120d;text-decoration:none;font-weight:bold;padding:12px 20px;border-radius:5px;display:inline-block">${esc(bouton)}</a></p>
    <p style="margin:18px 0 0;font-size:12px;color:#b5a289;line-height:1.5">Tu reçois ce message parce que tu as laissé ton adresse dans la partie ${esc(code)}.
    <a href="${esc(desabo)}" style="color:#b5a289">Ne plus recevoir de messages pour cette partie</a>.</p>
  </div></body></html>`;
  const strip = (s) => s.replace(/<[^>]+>/g, '');
  const text = `${titre}\n\n${lignes.map(strip).join('\n\n')}\n\n${bouton} : ${lien}\n\nNe plus recevoir de messages pour cette partie : ${desabo}\n`;
  return { html, text };
}

export function creerNotifier({ publicUrl, envoyer, base, now, setTimeout, clearTimeout, log }) {
  const timers = new Map(); // `${code}:${siege}` → minuteur en attente
  let averti = false;

  const liens = (jeton) => ({
    lien: `${publicUrl}#p=${encodeURIComponent(jeton)}`,
    desabo: `${publicUrl.replace(/\/$/, '')}/desabonner?jeton=${encodeURIComponent(jeton)}`,
  });

  async function poster(salle, siege, message) {
    const seat = salle.meta.sieges[siege];
    if (!envoyer) { if (!averti) { averti = true; log('notifications e-mail désactivées (pas de BREVO_API_KEY)'); } return; }
    const jeton = base.jetonDe(salle.code, siege);
    if (!jeton) return;
    const { lien, desabo } = liens(jeton);
    const { html, text } = gabarit({ ...message, lien, desabo, code: salle.code });
    try {
      const r = await envoyer({ to: seat.email, subject: message.sujet, html, text, unsubscribe: desabo });
      if (!r.ok) throw new Error(r.error);
      log(`[${salle.code}] e-mail envoyé à la place ${siege} (${message.sujet})`);
    } catch (e) {
      log(`[${salle.code}] e-mail NON envoyé à la place ${siege} : ${e.message}`);
    }
  }

  function messageTour(salle, siege) {
    const s = salle.etat, nom = s.players[siege].name, echeance = salle.meta.echeances[siege];
    const limite = echeance ? `Tu as jusqu'à ${dateLimite(echeance)} ; ensuite, l'ordinateur jouera ce tour à ta place.` : '';
    const evt = s.pending?.need?.[siege] ? s.pending.kind : null;
    if (evt) {
      const EVT = { contamination: ['Contamination', 'une levure sauvage s’est invitée : choisis le brassin qui perd 1 unité'], canicule: ['Canicule', 'il fait trop chaud : choisis le brassin qui perd 1 unité'], concours: ['Concours régional', 'présente une unité de ton stock'] };
      const [titre, txt] = EVT[evt];
      return { sujet: `${titre} : à toi de décider (partie ${salle.code})`, titre, bouton: 'Décider',
        lignes: [`${esc(nom)}, ${txt}.`, limite] };
    }
    if (s.phase === 'setup') {
      return { sujet: `À toi de t'installer (partie ${salle.code})`, titre: 'La partie commence', bouton: 'Installer ma brasserie',
        lignes: [`${esc(nom)}, c'est à toi de choisir l'emplacement de ta brasserie et ta première tournée.`, limite] };
    }
    const SAISON_NOM = ['Printemps', 'Été', 'Automne', 'Hiver'];
    const saison = `${SAISON_NOM[s.saison % 4]} an ${Math.floor(s.saison / 4) + 1}`;
    const prev = s.log.filter((e) => e.k === 'endTurn').at(-1);
    const avant = prev && prev.p !== siege ? `${esc(s.players[prev.p].name)} a passé la main : ` : '';
    return { sujet: `À toi de jouer (partie ${salle.code}, ${saison})`, titre: 'À toi de jouer', bouton: 'Jouer mon tour',
      lignes: [`${avant}c'est ton tour, ${esc(nom)}, ${saison.toLowerCase()}.`, limite] };
  }

  function doitPrevenir(salle, siege) {
    const seat = salle.meta.sieges[siege];
    if (salle.meta.mode !== 'differe' || salle.statut !== 'jeu' || !seat?.email || seat.type !== 'humain') return false;
    if (salle.isAi(siege) || !waitingFor(salle.etat).includes(siege)) return false;
    if ([...salle.sockets].some((c) => c.siege === siege)) return false;
    const n = seat.notif || {};
    if (n.tour === salle.etat.turn && n.phase === salle.etat.phase && !salle.etat.pending) return false;
    if (n.at && now() - n.at < ESPACEMENT_MS) return false;
    return true;
  }

  return {
    // Appelé par la salle quand une place humaine doit décider
    onTour(salle, siege) {
      if (salle.meta.mode !== 'differe' || !salle.meta.sieges[siege]?.email) return;
      const k = `${salle.code}:${siege}`;
      if (timers.has(k)) clearTimeout(timers.get(k));
      timers.set(k, setTimeout(() => {
        timers.delete(k);
        if (!doitPrevenir(salle, siege)) return;
        salle.meta.sieges[siege].notif = { tour: salle.etat.turn, phase: salle.etat.phase, at: now() };
        salle.sauver();
        poster(salle, siege, messageTour(salle, siege));
      }, GRACE_MS));
    },
    // Appelé à la fin d'une partie en différé
    onFin(salle) {
      if (salle.meta.mode !== 'differe') return;
      const s = salle.etat, w = s.winner;
      salle.meta.sieges.forEach((seat, i) => {
        if (seat.type !== 'humain' || !seat.email || [...salle.sockets].some((c) => c.siege === i)) return;
        poster(salle, i, {
          sujet: w === i ? `Tu l'emportes (partie ${salle.code})` : `${s.players[w].name} l'emporte (partie ${salle.code})`,
          titre: w === i ? 'Trois ans ont passé : tu l’emportes !' : `${s.players[w].name} l'emporte`,
          bouton: 'Voir le décompte',
          lignes: [w === i ? 'Ta brasserie est la plus réputée du terroir.' : `Sa brasserie est la plus réputée du terroir. Ta brasserie, ${esc(s.players[i].name)}, finit avec ${s.scores[i].total} points.`],
        });
      });
    },
    arreter() { for (const t of timers.values()) clearTimeout(t); timers.clear(); },
  };
}
