// Affichage et interactions. Tout se déduit de la vue du joueur (viewFor) et de ses actions légales :
// le même code sert au mode solo et au jeu en réseau.
//
//   const ui = createUi({ send, onNewGame, onHome });   send(action) → { ok, error } (ou une promesse)
//   ui.update(view, { busy, rejouer })                   busy : l'adversaire joue ; rejouer : proposer une nouvelle partie à la fin

import {
  RES, STYLES, ITEMS, RECETTES, ACHAT, AMELIORATIONS, CLIENTS, FOIRES, CARTE, SAISONS, NB_SAISONS, STOCK_MAX, FERMENTEURS_MAX, CUVE,
  TOURAILLE_MALT, SALLE_UNITES, SALLE_BONUS, DEMANDE_BONUS, PRODUCTION, PRODUIT, PUITS, TOPO, ZI, total, legalActions, saisonIdx, unites,
  clientIds, clientKind, clientPos, coutTournee, limiteLivraison, prixMarche, valeurLivraison, cuveUnites, pointsDiversite,
} from '../moteur/index.js';
import { RN, RI, SN, SI, TILE, SAISON_NOM, EVT, nomClient, nomSaison, meteoTexte, fmt, logLines, nomItem } from './textes.js';

export const RCOL = { malt: '#d8af40', houb: '#5d9638', lev: '#d2c9a8', eau: '#3d86aa', torr: '#4a2d1c', argent: '#d38b46' };
export const RTXT = { malt: '#2a1d15', houb: '#f1f7ea', lev: '#2a1d15', eau: '#f2f8fb', torr: '#f6eadb', argent: '#1a120d' };
export const SCOL = { blonde: '#e8c15a', blanche: '#f1e8d2', ipa: '#d98b3a', ambree: '#b5582e', stout: '#2b1b14', lager: '#f3d58a', garde: '#8a4b2a' };
export const STXT = { blonde: '#2a1d15', blanche: '#2a1d15', ipa: '#1a120d', ambree: '#f6eadb', stout: '#f6eadb', lager: '#2a1d15', garde: '#f6eadb' };
export const TCOL = { orge: '#d8af40', houb: '#5d9638', source: '#3d86aa', bourg: '#8f7f6d', village: '#b07a4a' };
export const PCOL = ['#d9473a', '#4b87d6', '#e6ad2e', '#ece4d4'];

const $ = (s) => document.querySelector(s);
const esc = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const ICON = {
  orge: '<g stroke="rgba(60,40,10,.55)" stroke-width="2" fill="rgba(60,40,10,.4)"><path d="M0,13V-12" fill="none"/><ellipse cx="-4" cy="-6" rx="2.6" ry="4.5" transform="rotate(-30 -4 -6)"/><ellipse cx="4" cy="-6" rx="2.6" ry="4.5" transform="rotate(30 4 -6)"/><ellipse cx="-4" cy="2" rx="2.6" ry="4.5" transform="rotate(-30 -4 2)"/><ellipse cx="4" cy="2" rx="2.6" ry="4.5" transform="rotate(30 4 2)"/></g>',
  houb: '<g fill="rgba(230,250,200,.5)"><path d="M0,-13L7,-4L5,6L0,13L-5,6L-7,-4Z"/></g><g stroke="rgba(30,60,20,.5)" stroke-width="1.6" fill="none"><path d="M-6,-3L0,1L6,-3M-5,5L0,9L5,5"/></g>',
  source: '<path fill="rgba(255,255,255,.55)" d="M0,-12C6,-4 9,0 9,4A9,9 0 0 1 -9,4C-9,0 -6,-4 0,-12Z"/>',
  bourg: '<g fill="rgba(30,20,14,.45)"><path d="M-14,10V-2L-8,-8L-2,-2V10Z"/><path d="M0,10V-6L7,-13L14,-6V10Z"/><rect x="-4" y="2" width="4" height="8"/></g>',
  village: '<g fill="rgba(30,20,14,.45)"><path d="M-12,10V0L-5,-7L2,0V10Z"/><path d="M4,10V2L9,-3L14,2V10Z"/></g>',
};
const BREWERY = '<g><path d="M-13,10V-4L-6,-10L1,-4V10Z"/><rect x="2" y="-2" width="10" height="12"/><rect x="4" y="-9" width="3" height="8"/><circle cx="-6" cy="2" r="2" fill="rgba(0,0,0,.35)"/></g>';
const poly = (pts) => pts.map((p) => p.join(',')).join(' ');
const chip = (r) => `<span class="cst" title="${RN[r]}" style="--rc:${RCOL[r]};--rt:${RTXT[r]}">${RI[r]}</span>`;
const schip = (st) => `<span class="cst sty" title="${SN[st]}" style="--rc:${SCOL[st]};--rt:${STXT[st]}">${SI[st]}</span>`;
const ichip = (k) => (RES.includes(k) || k === 'argent' ? chip(k) : schip(k));
const chips = (c) => `<span class="costs">${RES.flatMap((r) => Array(c[r] ?? 0).fill(chip(r))).join('')}</span>`;
const sw = (i) => `<span class="sw" style="background:${PCOL[i]}"></span>`;
const plural = (n, s) => `${n} ${s}${n > 1 ? 's' : ''}`;

export function createUi({ send, onNewGame, onHome }) {
  let view = null, opts = {}, L = [];
  const ui = { mode: null, offer: { give: ZI(), get: ZI() }, counter: null, counterFor: null, modalKey: null, error: '', errorTimer: null, winClosed: false, qty: 1 };

  const me = () => view.me;
  const P = () => view.players;
  const mine = () => view.me !== null && view.me !== undefined;
  const legal = (type, f = () => true) => L.find((a) => a.type === type && f(a));
  const you = (i) => i === view.me;
  const my = () => (mine() ? P()[me()] : null);
  const free = () => mine() && !opts.busy && view.phase === 'main' && view.cur === me() && !view.pending;

  async function act(action) {
    const r = await send(action);
    if (r && !r.ok) showError(r.error);
    return r;
  }
  function showError(msg) {
    ui.error = msg;
    clearTimeout(ui.errorTimer);
    ui.errorTimer = setTimeout(() => { ui.error = ''; render(); }, 3500);
    render();
  }

  /* ---------- sélection sur le plateau ---------- */

  function boardMode() {
    if (!mine() || opts.busy) return null;
    const pl = legal('placer');
    if (pl) return { kind: 'hex', targets: pl.targets, hint: 'Installe ta brasserie sur un terroir : la case et ses six voisines l’approvisionnent.', pick: (hex) => act({ type: 'placer', hex }) };
    const tf = legal('tournee', (a) => a.free);
    if (tf) return { kind: 'client', targets: tf.targets, hint: 'Ouvre ta première tournée, gratuite, vers un client à 2 cases ou moins.', pick: (client) => act({ type: 'tournee', client }) };
    if (ui.mode === 'tournee') {
      const t = legal('tournee', (a) => !a.free);
      if (t) return { kind: 'client', targets: t.targets, hint: 'Choisis le client : la tournée coûte 2 Argent par case (1 avec le Camion), une fois pour toutes.', pick: (client) => { ui.mode = null; return act({ type: 'tournee', client }); }, cancel: true };
      ui.mode = null;
    }
    return null;
  }

  function renderBoard(mode) {
    const v = view;
    let s = '';
    const R = 318;
    s += `<polygon points="${poly([0, 1, 2, 3, 4, 5].map((i) => [R * Math.cos(Math.PI / 3 * i), R * Math.sin(Math.PI / 3 * i)]))}" fill="var(--sea)" stroke="var(--sea2)" stroke-width="10" stroke-linejoin="round"/>`;
    const si = v.saison >= 0 ? saisonIdx(v) : null, carte = v.carte ? CARTE[v.carte] : null;
    const targets = mode?.kind === 'client' ? new Map(mode.targets.map((t) => [t.client, t.cout])) : null;
    const posOf = (c) => (c.startsWith('foire') ? TOPO.foires[+c.slice(5)] : TOPO.hexes[clientPos(v, c)]);
    // cases
    TOPO.hexes.forEach((h, i) => {
      const t = v.tiles[i];
      const pts = h.verts.map(([x, y]) => [h.x + (x - h.x) * 0.965, h.y + (y - h.y) * 0.965]);
      let title = TILE[t];
      if (t === 'village') title += ` ${'ABC'[v.villages.indexOf(i)]} : aime ${v.prefs[v.villages.indexOf(i)].map((x) => SN[x]).join(' et ')}`;
      if (PRODUCTION[t]) title += ` → ${RN[PRODUIT[t]]} (${PRODUCTION[t].join(' / ')} par saison)`;
      s += `<polygon class="tile" points="${poly(pts)}" fill="${TCOL[t]}"><title>${esc(title)}</title></polygon>`;
      s += `<g transform="translate(${h.x},${h.y - 22})">${ICON[t]}</g>`;
      // production de la saison
      if (PRODUCTION[t] && si !== null) {
        const m = carte?.meteo?.[t];
        const q = m === 'zero' ? 0 : Math.max(0, PRODUCTION[t][si] + (m ?? 0));
        s += `<g transform="translate(${h.x},${h.y + 18})"><rect x="-15" y="-10" width="30" height="20" rx="4" fill="rgba(20,14,10,${q ? '.55' : '.25'})"/><text y="5" text-anchor="middle" font-size="14" font-weight="700" fill="${q ? '#f2e6d0' : 'rgba(242,230,208,.5)'}">+${q}</text></g>`;
      }
      if ((t === 'village' || t === 'bourg') && v.phase !== 'setup') {
        const cl = t === 'bourg' ? ['bar', 'cave'] : [`village${v.villages.indexOf(i)}`];
        cl.forEach((c, k) => {
          const cap = v.capa?.[c] ?? 0, x = h.x + (cl.length === 2 ? (k ? 16 : -16) : 0), y = h.y + 20;
          s += `<g transform="translate(${x},${y})"><title>${esc(nomClient(v, c))} : ${cap} à livrer cette saison</title><circle r="11" fill="var(--panel)" stroke="var(--ink)" stroke-width="1.5"/><text y="4.5" text-anchor="middle" font-size="12" font-weight="700" fill="var(--ink)">${cap}</text></g>`;
        });
      }
    });
    // tournées
    v.players.forEach((p, i) => {
      if (p.hex === null) return;
      const h = TOPO.hexes[p.hex];
      p.tournees.forEach((c) => {
        const t = posOf(c), dx = t.x - h.x, dy = t.y - h.y, l = Math.hypot(dx, dy) || 1, o = (i - (v.players.length - 1) / 2) * 4;
        const ox = -dy / l * o, oy = dx / l * o;
        s += `<line x1="${h.x + ox}" y1="${h.y + oy}" x2="${t.x + ox}" y2="${t.y + oy}" stroke="var(--dark)" stroke-width="5" stroke-dasharray="7 5" opacity=".6"/><line x1="${h.x + ox}" y1="${h.y + oy}" x2="${t.x + ox}" y2="${t.y + oy}" stroke="${PCOL[i]}" stroke-width="2.5" stroke-dasharray="7 5"/>`;
      });
    });
    // brasseries
    v.players.forEach((p, i) => {
      if (p.hex === null) return;
      const h = TOPO.hexes[p.hex];
      s += `<g transform="translate(${h.x},${h.y + 2}) scale(1.15)" fill="${PCOL[i]}" stroke="var(--dark)" stroke-width="1.6" stroke-linejoin="round"><title>${esc(p.name)}</title>${BREWERY}</g>`;
    });
    // foires
    TOPO.foires.forEach((f, k) => {
      const id = `foire${k}`, active = v.phase !== 'setup' && si === f.saison, cap = v.capa?.[id] ?? 0;
      s += `<g transform="translate(${f.x},${f.y})"><title>${esc(f.nom)} (${SAISON_NOM[SAISONS[f.saison]].toLowerCase()})${active ? ` : ${cap} à livrer cette saison` : ''}</title>
        <circle r="19" fill="${active ? 'var(--copper)' : 'var(--panel)'}" stroke="${active ? 'var(--ink)' : '#7d6b58'}" stroke-width="2.5"/>
        <text y="-2" text-anchor="middle" font-size="11" font-weight="700" fill="${active ? 'var(--dark)' : 'var(--muted)'}">${SAISON_NOM[SAISONS[f.saison]].slice(0, 3).toUpperCase()}</text>
        <text y="11" text-anchor="middle" font-size="11" font-weight="600" fill="${active ? 'var(--dark)' : 'var(--muted)'}">${active ? cap : 'foire'}</text></g>`;
    });
    // cibles
    if (mode?.kind === 'hex') mode.targets.forEach((i) => {
      const h = TOPO.hexes[i];
      s += `<polygon class="hpick" data-k="hex" data-id="${i}" tabindex="0" points="${poly(h.verts.map(([x, y]) => [h.x + (x - h.x) * 0.86, h.y + (y - h.y) * 0.86]))}"><title>${esc(TILE[v.tiles[i]])}</title></polygon>`;
    });
    if (targets) for (const [c, cout] of targets) {
      const t = posOf(c), off = c === 'cave' ? 16 : c === 'bar' ? -16 : 0, y = c.startsWith('foire') ? t.y : t.y + 20;
      s += `<g class="cpick" data-k="client" data-id="${c}" tabindex="0" transform="translate(${t.x + off},${y})"><title>${esc(nomClient(v, c))} : ${cout ? cout + ' Argent' : 'gratuit'}</title><circle r="${c.startsWith('foire') ? 24 : 15}"/>${cout ? `<text y="${c.startsWith('foire') ? 36 : 29}" text-anchor="middle" font-size="12" font-weight="700" fill="var(--ink)">${cout}</text>` : ''}</g>`;
    }
    $('#board').innerHTML = s;
  }

  /* ---------- fenêtres ---------- */

  function stepper(k, key, n, max) {
    return `<span class="stp"><button class="btn mini" data-c="${k}" data-r="${key}" data-d="-1" aria-label="Moins" ${n ? '' : 'disabled'}>−</button><b>${n}</b><button class="btn mini" data-c="${k}" data-r="${key}" data-d="1" aria-label="Plus" ${n < max ? '' : 'disabled'}>+</button></span>`;
  }
  // Lignes d'un échange : tout ce que l'un ou l'autre possède ou demande
  function itemRows(give, get, maxGive, maxGet) {
    const keys = ITEMS.filter((k) => maxGive(k) > 0 || maxGet(k) > 0 || give[k] || get[k]);
    return keys.map((k) => `<span class="rl">${ichip(k)}${nomItem(k)}</span>${stepper('give', k, give[k], maxGive(k))}${stepper('get', k, get[k], maxGet(k))}`).join('');
  }

  function currentModal() {
    const v = view, p = my();
    if (v.phase === 'over') {
      if (ui.winClosed) return null;
      const w = v.winner, P0 = P();
      const order = P0.map((_, i) => i).sort((a, b) => P0[b].score.total - P0[a].score.total || P0[b].argent - P0[a].argent);
      return {
        key: 'win',
        html: `<h2>${you(w) ? 'Trois ans ont passé : tu l’emportes !' : esc(P0[w].name) + ' l’emporte'}</h2><p>${you(w) ? 'Ta brasserie est la plus réputée du terroir.' : 'Sa brasserie est la plus réputée du terroir.'}</p>
          <div class="scores"><span></span><span>Brasserie</span><span>Rép.</span><span>Div.</span><span>Argent</span><span>Total</span>
          ${order.map((i) => `${sw(i)}<span>${esc(P0[i].name)}</span><span>${P0[i].score.rep}</span><span>${P0[i].score.diversite}</span><span>${P0[i].score.argent}</span><b>${P0[i].score.total}</b>`).join('')}</div>
          <div class="mrow">${opts.rejouer ? '<button class="btn primary" data-again>Rejouer</button>' : '<button class="btn primary" data-home>Retour à l’accueil</button>'}<button class="btn ghost" data-close>Voir le plateau</button></div>`,
      };
    }
    if (!p) return null;
    const ev = legal('evenement');
    if (ev) return {
      key: `evt-${v.saison}`,
      html: `<h2>${EVT[ev.kind].nom}</h2><p>${ev.kind === 'contamination' ? 'Une levure sauvage s’est invitée.' : 'Il fait trop chaud dans la brasserie.'} Un de tes brassins en cours perd 1 unité : lequel ?</p>
        <div class="mrow">${ev.targets.map((i) => `<button class="btn" data-ferm="${i}">${SN[p.ferms[i].st]} · ${p.ferms[i].u} unités, prête dans ${p.ferms[i].left}</button>`).join('')}</div>`,
    };
    const cc = legal('concours');
    if (cc) return {
      key: `concours-${v.saison}`,
      html: `<h2>Concours régional</h2><p>Présente une unité de ton stock. Score : réputation du style, +1 s'il est en demande. Le meilleur gagne 5 Réputation, le deuxième 2. L'unité est consommée.</p>
        <div class="mrow">${cc.styles.map((st) => `<button class="btn" data-style="${st}">${SN[st]} · ${RECETTES[st].rep + (v.demande.includes(st) ? 1 : 0)}</button>`).join('')}</div>`,
    };
    const t = v.trade;
    if (t && t.to.includes(me()) && !t.resp[me()]) {
      const from = P()[t.from];
      if (ui.counter) {
        const c = ui.counter;
        const okC = total(c.give) && total(c.get) && ITEMS.every((k) => avoir(p, k) >= c.get[k]);
        return {
          key: `counter-${t.id}`,
          html: `<h2>Contre-proposition</h2><p>Ce que ${esc(from.name)} te donnerait, et ce que tu lui donnes.</p>
            <div class="offer"><span></span><span class="oh">Tu reçois</span><span class="oh">Tu donnes</span>${itemRows(c.give, c.get, (k) => avoir(from, k), (k) => avoir(p, k))}</div>
            <div class="mrow"><button class="btn primary" data-cok ${okC ? '' : 'disabled'}>Envoyer</button><button class="btn ghost" data-cback>Retour</button></div>`,
        };
      }
      return {
        key: `offer-${t.id}`,
        html: `<h2>Offre de ${esc(from.name)}</h2><p>${esc(from.name)} te propose <b>${fmt(t.give)}</b> contre <b>${fmt(t.get)}</b>.</p>
          <div class="mrow"><button class="btn primary" data-y ${legal('respondTrade')?.canAccept ? '' : 'disabled'}>Accepter</button><button class="btn" data-n>Refuser</button><button class="btn ghost" data-ctr>Contre-proposer</button></div>`,
      };
    }
    if (t && t.from === me()) {
      const rows = t.to.map((i) => {
        const r = t.resp[i];
        const txt = !r ? 'Réfléchit…' : r.s === 'refuse' ? 'Refuse.' : r.s === 'accept' ? 'Accepte.' : `Accepte si tu donnes ${fmt(r.give)} contre ${fmt(r.get)}.`;
        const can = r && r.s !== 'refuse' && ITEMS.every((k) => avoir(p, k) >= (r.s === 'counter' ? r.give[k] : t.give[k]));
        return `<div class="resp">${sw(i)}<div><b>${esc(P()[i].name)}</b><small>${txt}</small></div>${can ? `<button class="btn ${r.s === 'counter' ? '' : 'primary'}" data-k="${i}">${r.s === 'counter' ? 'Accepter' : 'Conclure'}</button>` : ''}</div>`;
      });
      const any = Object.values(t.resp).some((r) => r.s !== 'refuse');
      return {
        key: `responses-${t.id}`,
        html: `<h2>Réponses</h2><p>Tu proposes ${fmt(t.give)} contre ${fmt(t.get)}.</p><div>${rows.join('')}</div>
          <button class="btn ghost" data-k="-1">${any ? 'Annuler' : Object.keys(t.resp).length === t.to.length ? 'Fermer' : 'Retirer l’offre'}</button>`,
      };
    }
    return null;
  }
  const avoir = (p, k) => (RES.includes(k) ? p.res[k] : k === 'argent' ? p.argent : p.stock[k]);

  let modalNow = null;
  function renderModal() {
    const m = currentModal();
    const box = $('#modalBox');
    if (!m) { modalNow = null; ui.modalKey = null; $('#modal').hidden = true; return; }
    const fresh = m.key !== ui.modalKey;
    ui.modalKey = m.key;
    modalNow = m;
    box.innerHTML = m.html;
    $('#modal').hidden = false;
    if (fresh) box.querySelector('button:not(:disabled)')?.focus();
  }

  function onModalClick(e) {
    const b = e.target.closest('button');
    if (!b || b.disabled || !modalNow) return;
    const ds = b.dataset;
    if (ds.ferm !== undefined) return act({ type: 'evenement', ferm: +ds.ferm });
    if (ds.style !== undefined) return act({ type: 'concours', style: ds.style });
    if ('again' in ds) return onNewGame?.();
    if ('home' in ds) return onHome?.();
    if ('close' in ds) { if (view.phase === 'over') ui.winClosed = true; return render(); }
    if ('y' in ds) return act({ type: 'respondTrade', accept: true });
    if ('n' in ds) return act({ type: 'respondTrade', accept: false });
    if ('ctr' in ds) { ui.counter = { give: { ...ZI(), ...view.trade.give }, get: { ...ZI(), ...view.trade.get } }; return render(); }
    if (ds.c) { const c = ui.counter[ds.c]; c[ds.r] = Math.max(0, c[ds.r] + +ds.d); return render(); }
    if ('cback' in ds) { ui.counter = null; return render(); }
    if ('cok' in ds) { const counter = ui.counter; ui.counter = null; return act({ type: 'respondTrade', counter }); }
    if (ds.k !== undefined) { const k = +ds.k; return k < 0 ? act({ type: 'cancelTrade' }) : act({ type: 'concludeTrade', with: k }); }
  }

  /* ---------- comptoir ---------- */

  function hintText(mode) {
    const v = view;
    if (ui.error) return { txt: ui.error, col: 'var(--copper)' };
    if (mode) return { txt: mode.hint, col: PCOL[me()] };
    if (v.phase === 'over') return { txt: `${you(v.winner) ? 'Tu gagnes' : esc(P()[v.winner].name) + ' gagne'} la partie.`, col: PCOL[v.winner] };
    if (v.pending) {
      const who = Object.keys(v.pending.need).map(Number);
      if (mine() && who.includes(me())) return { txt: `${EVT[v.pending.kind].nom} : à toi de décider.`, col: PCOL[me()] };
      return { txt: `${EVT[v.pending.kind].nom} : ${who.map((i) => esc(P()[i].name)).join(', ')} ${who.length > 1 ? 'décident' : 'décide'}…`, col: 'var(--muted)' };
    }
    if (v.trade && v.trade.from !== me() && !(v.trade.to.includes(me()) && !v.trade.resp[me()])) return { txt: `${esc(P()[v.trade.from].name)} attend des réponses à son offre…`, col: PCOL[v.trade.from] };
    if (v.phase === 'setup') return { txt: `${esc(P()[v.cur].name)} s'installe…`, col: PCOL[v.cur] };
    if (free()) {
      const p = my();
      if (unites(p) > STOCK_MAX) return { txt: `Ton stock dépasse ${STOCK_MAX} unités : livre ou vends avant de finir ton tour.`, col: 'var(--copper)' };
      return { txt: 'À toi : brasse, livre, vends, équipe-toi, négocie. Puis fin du tour.', col: PCOL[me()] };
    }
    return { txt: `Tour de ${esc(P()[v.cur].name)}…`, col: PCOL[v.cur] };
  }

  function renderSaison() {
    const v = view;
    if (v.saison < 0) { $('#saison').innerHTML = '<p class="empty">La saison commence quand les brasseries sont installées.</p>'; return; }
    const c = CARTE[v.carte];
    const cal = Array.from({ length: NB_SAISONS }, (_, t) => {
      const k = SAISONS[t % 4], an = Math.floor(t / 4), d = v.deck[k];
      const id = t < v.saison || t === v.saison ? d.revelees[an] : null;
      const cls = t === v.saison ? 'now' : t < v.saison ? 'past' : '';
      const txt = id ? CARTE[id].nom : d.restantes.map((x) => CARTE[x].nom).join(' ou ');
      return `<span class="cal ${cls}" title="${esc(nomSaison(t))} : ${esc(txt)}">${SAISON_NOM[k].slice(0, 1)}</span>`;
    }).join('');
    $('#saison').innerHTML = `<div class="season"><b>${nomSaison(v.saison)}</b><span class="cardname">${esc(c.nom)}</span>
      <small>${meteoTexte(c.meteo)}. En demande : ${c.demande.map((s) => `<span class="dem">${SN[s]}</span>`).join(' et ')}${c.evt ? ` · <span class="evt" title="${esc(EVT[c.evt].txt)}">${EVT[c.evt].nom}</span>` : ''}.</small>
      <div class="calrow" title="Les 12 saisons ; passe la souris pour voir les cartes possibles">${cal}</div>
      <small>Saison suivante : ${v.saison + 1 < NB_SAISONS ? v.deck[SAISONS[(v.saison + 1) % 4]].restantes.map((x) => `${esc(CARTE[x].nom)} (${CARTE[x].demande.map((s) => SN[s]).join(', ')})`).join(' · ') : 'fin de la partie'}</small></div>`;
  }

  function renderPlayers() {
    const v = view;
    $('#players').innerHTML = P().map((p, i) => `<div class="pl ${v.cur === i && v.phase !== 'over' && !v.pending ? 'cur' : ''}">${sw(i)}
      <div class="pn"><b>${esc(p.name)}${you(i) && p.name !== 'Toi' ? ' (toi)' : ''}</b><small>${p.argent} Argent · ${plural(unites(p), 'unité')} · ${p.ferms.length}/${p.nferm} ferm.${p.status ? ' · ' + esc(p.status) : ''}</small></div>
      <div class="badges">${p.tournees.length ? `<span class="bdg" title="Tournées ouvertes">${p.tournees.length} tourn.</span>` : ''}</div>
      <div class="vp" title="Réputation (diversité et Argent comptent au décompte final)">${p.rep}<small>rép.</small></div></div>`).join('');
  }

  function renderTurn() {
    const v = view, p = my();
    const end = free() && legal('endTurn');
    const over = p && unites(p) > STOCK_MAX;
    $('#turn').innerHTML = `<div class="turninfo">${v.phase === 'main' ? `<b>${nomSaison(v.saison)}</b><small>${v.ordre.map((i) => esc(P()[i].name)).join(' → ')}</small>` : ''}</div>
      <button class="btn primary" data-act="end" ${end ? '' : 'disabled'} title="${over ? 'Stock trop plein' : ''}">Fin du tour</button>`;
  }

  function renderBrasserie() {
    const p = my();
    if (!p) { $('#brasserie').innerHTML = ''; return; }
    const slots = Array.from({ length: FERMENTEURS_MAX }, (_, i) => {
      if (i >= p.nferm) return '<div class="ferm none" title="Fermenteur à acheter">—</div>';
      const f = p.ferms[i];
      if (!f) return '<div class="ferm empty">libre</div>';
      return `<div class="ferm" style="--rc:${SCOL[f.st]};--rt:${STXT[f.st]}" title="${SN[f.st]} : ${f.u} unités, prête dans ${plural(f.left, 'saison')}"><b>${SN[f.st]}</b><span>${f.u} u · ${f.left} sais.</span></div>`;
    }).join('');
    const stock = STYLES.filter((st) => p.stock[st] > 0);
    $('#brasserie').innerHTML = `<div class="hand">${RES.map((r) => `<div class="res ${p.res[r] ? '' : 'zero'}" style="--rc:${RCOL[r]};--rt:${RTXT[r]}"><b>${p.res[r]}</b><span>${r === 'torr' ? 'Torréfié' : RN[r]}</span></div>`).join('')}
      <div class="res" style="--rc:${RCOL.argent};--rt:${RTXT.argent}"><b>${p.argent}</b><span>Argent</span></div></div>
      <div class="sub2">Fermenteurs · cuve de ${cuveUnites(p)} unités</div><div class="ferms">${slots}</div>
      <div class="sub2">Stock ${unites(p)}/${STOCK_MAX}${unites(p) > STOCK_MAX ? ' · trop plein' : ''}</div>
      <div class="stock">${stock.length ? stock.map((st) => `<span class="stk" style="--rc:${SCOL[st]};--rt:${STXT[st]}"><b>${p.stock[st]}</b> ${SN[st]}</span>`).join('') : '<span class="empty">Rien en stock.</span>'}</div>
      <div class="sub2">Équipement</div><div class="stock">${p.upg.length || p.nferm > 2 ? [...p.upg.map((u) => AMELIORATIONS[u].nom), ...(p.nferm > 2 ? [`${p.nferm} fermenteurs`] : [])].map((n) => `<span class="eq">${esc(n)}</span>`).join('') : '<span class="empty">Le strict nécessaire.</span>'}</div>
      <div class="sub2">Styles brassés : ${p.styles.length}/7 (diversité ${pointsDiversite(p.styles.length)} pt${pointsDiversite(p.styles.length) > 1 ? 's' : ''})</div>`;
  }

  function renderBrasser() {
    const v = view, p = my();
    if (!p) { $('#brasser').innerHTML = ''; return; }
    const b = free() && legal('brasser'), tor = free() && legal('torrefier');
    const plein = p.ferms.length >= p.nferm;
    $('#brasser').innerHTML = STYLES.map((st) => {
      const r = RECETTES[st], can = b && b.styles.includes(st);
      const why = plein ? 'Fermenteurs pleins' : r.exige && !p.upg.includes(r.exige) ? AMELIORATIONS[r.exige].nom + ' requise' : '';
      return `<div class="bname"><b>${schip(st)} ${SN[st]}${v.demande.includes(st) ? ' <span class="dem">en demande</span>' : ''}</b><small>${plural(r.ferm, 'saison')} · ${r.prix} Argent · ${r.rep} rép.${why && free() ? ' · ' + why : ''}</small>${chips(r)}</div>
        <button class="btn" data-act="brasser" data-style="${st}" ${can ? '' : 'disabled'}>Brasser</button>`;
    }).join('') + `<div class="bname"><b>Torréfier</b><small>Touraille : ${TOURAILLE_MALT} Malt → 1 Malt torréfié, une fois par saison</small></div><button class="btn" data-act="torrefier" ${tor ? '' : 'disabled'}>Torréfier</button>`;
  }

  function renderMarche() {
    const v = view, p = my();
    if (!p) { $('#marche').innerHTML = ''; return; }
    const ach = free() && legal('acheter'), ven = free() && legal('vendre'), sal = free() && legal('salle');
    $('#marche').innerHTML = `<div class="sub2">Acheter</div><div class="buyrow">${RES.map((r) => `<button class="btn buy" data-act="acheter" data-r="${r}" ${ach && ach.res.includes(r) ? '' : 'disabled'} title="${RN[r]} : ${ACHAT[r]} Argent">${chip(r)} ${ACHAT[r]}</button>`).join('')}</div>
      <div class="sub2">Vendre · prix courant (base)</div>
      <div class="sellgrid ${p.upg.includes('salle') ? 'with-salle' : ''}">${STYLES.map((st) => {
        const cur = prixMarche(v, st), can = ven && ven.styles.includes(st), canS = sal && sal.styles.includes(st);
        return `<span class="rl">${schip(st)} ${SN[st]}${v.demande.includes(st) ? ' <span class="dem">+2</span>' : ''}</span><span class="pr">${cur} <small>(${RECETTES[st].prix})</small></span>
          <button class="btn" data-act="vendre" data-style="${st}" ${can ? '' : 'disabled'}>Vendre 1</button>${p.upg.includes('salle') ? `<button class="btn" data-act="salle" data-style="${st}" ${canS ? '' : 'disabled'} title="Salle de dégustation : prix de base +1, ${SALLE_UNITES} par saison">Salle ${RECETTES[st].prix + SALLE_BONUS}</button>` : ''}`;
      }).join('')}</div>
      <p class="hintsmall">Chaque unité vendue fait baisser le prix de 1 ; il remonte de 1 par saison. Un style en demande se vend ${DEMANDE_BONUS} de plus.</p>`;
  }

  function renderClients() {
    const v = view, p = my();
    if (!p) { $('#clients').innerHTML = ''; return; }
    const liv = free() && legal('livrer'), tour = free() && legal('tournee', (a) => !a.free);
    const rows = p.tournees.map((c) => {
      const kind = clientKind(c), t = liv ? liv.targets.find((x) => x.client === c) : null;
      const cap = v.capa[c] ?? 0, done = p.livr[c] ?? 0, lim = limiteLivraison(p);
      let desc = kind === 'bar' ? 'Tous styles · prix +1' : kind === 'cave' ? 'Styles foncés · prix +3' : kind === 'village' ? `Aime ${v.prefs[+c.slice(7)].map((x) => SN[x]).join(' et ')} · sinon prix −1, 0 rép.` : `${SAISON_NOM[SAISONS[FOIRES[+c.slice(5)].saison]]} · prix +2, rép. +1`;
      desc += ` · ${cap} à livrer · toi ${done}/${lim}`;
      const btns = STYLES.filter((st) => p.stock[st] > 0).map((st) => {
        const val = valeurLivraison(v, c, st), can = t && t.styles.includes(st);
        return `<button class="btn mini2" data-act="livrer" data-client="${c}" data-style="${st}" ${can ? '' : 'disabled'} title="${val ? `${val.argent} Argent, ${val.rep} Réputation` : 'Pas ce style'}">${SN[st]}${val ? ` <small>${val.argent}€ ${val.rep}r</small>` : ''}</button>`;
      }).join('');
      return `<div class="client"><b>${esc(nomClient(v, c))}</b><small>${desc}</small><div class="mrow">${btns || '<span class="empty">Rien à livrer.</span>'}</div></div>`;
    }).join('');
    $('#clients').innerHTML = `${rows || '<p class="empty">Aucune tournée ouverte.</p>'}<button class="btn" data-act="tournee" ${tour ? '' : 'disabled'}>Ouvrir une tournée…</button>`;
  }

  function renderAmeliorer() {
    const p = my();
    if (!p) { $('#ameliorer').innerHTML = ''; return; }
    const am = free() && legal('ameliorer');
    $('#ameliorer').innerHTML = Object.entries(AMELIORATIONS).map(([u, d]) => {
      const owned = u === 'ferm' ? p.nferm >= FERMENTEURS_MAX : p.upg.includes(u);
      const can = am && am.targets.includes(u);
      return `<div class="bname ${owned ? 'owned' : ''}"><b>${esc(d.nom)}${u === 'ferm' ? ` (${p.nferm}/${FERMENTEURS_MAX})` : ''}</b><small>${esc(d.txt)}${d.exige && !p.upg.includes(d.exige) ? ` Exige ${AMELIORATIONS[d.exige].nom}.` : ''}</small></div>
        <button class="btn" data-act="ameliorer" data-u="${u}" ${can ? '' : 'disabled'}>${owned ? 'Acquis' : d.cout + ' €'}</button>`;
    }).join('');
  }

  function renderTrade() {
    const p = my();
    if (!p) { $('#trade').innerHTML = ''; return; }
    const o = ui.offer;
    const okOffer = free() && legal('proposeTrade') && total(o.give) && total(o.get) && ITEMS.every((k) => avoir(p, k) >= o.give[k]) && !ITEMS.some((k) => o.give[k] && o.get[k]);
    const stp = (k, key, n, max) => `<span class="stp"><button class="btn mini" data-act="${k}" data-r="${key}" data-d="-1" aria-label="Moins" ${n ? '' : 'disabled'}>−</button><b>${n}</b><button class="btn mini" data-act="${k}" data-r="${key}" data-d="1" aria-label="Plus" ${n < max ? '' : 'disabled'}>+</button></span>`;
    const keys = ITEMS.filter((k) => avoir(p, k) > 0 || o.get[k] || o.give[k] || RES.includes(k) || k === 'argent');
    $('#trade').innerHTML = `<div class="offer"><span></span><span class="oh">Tu donnes</span><span class="oh">Tu demandes</span>
      ${keys.map((k) => `<span class="rl">${ichip(k)}${nomItem(k)}</span>${stp('og', k, o.give[k], avoir(p, k))}${stp('ow', k, o.get[k], 20)}`).join('')}</div>
      <button class="btn" data-act="propose" ${okOffer ? '' : 'disabled'}>Proposer l'échange</button>
      <label class="chk"><input type="checkbox" id="offersOn" ${p.offersOn ? 'checked' : ''}>Recevoir les offres des autres brasseries</label>`;
  }

  function renderHint(mode) {
    const h = hintText(mode);
    $('#hint').innerHTML = `<span class="dot" style="background:${h.col}"></span><span class="grow">${h.txt}</span>${mode?.cancel ? '<button class="btn ghost" data-act="cancel">Annuler</button>' : ''}`;
  }

  function renderLog() {
    const lines = view.log.flatMap((e) => logLines(e, view)).reverse().slice(0, 50);
    $('#log').innerHTML = lines.map((l) => `<li><i style="background:${l.p === null || l.p === undefined ? 'var(--muted)' : PCOL[l.p]}"></i><span>${esc(l.txt)}</span></li>`).join('');
  }

  // Une offre qui m'était adressée disparaît avant ma réponse : on le dit
  let offreVue = null;
  function suivreOffre() {
    const t = view.trade, waitingMe = t && mine() && t.to.includes(me()) && !t.resp[me()];
    if (offreVue && (!t || t.id !== offreVue.id) && !ui.error) {
      const done = view.log.some((e) => e.k === 'tradeDone' && e.p === offreVue.from && e.with === me());
      if (!done) showError(`L'offre de ${P()[offreVue.from].name} n'est plus disponible : conclue avec quelqu'un d'autre, ou retirée.`);
    }
    offreVue = waitingMe ? { id: t.id, from: t.from } : null;
  }

  let lastMode = null;
  function render() {
    if (!view) return;
    suivreOffre();
    L = mine() ? legalActions(view, me()) : [];
    if (view.trade?.id !== ui.counterFor) { ui.counter = null; ui.counterFor = view.trade?.id; }
    const mode = boardMode();
    lastMode = mode;
    renderBoard(mode);
    renderSaison(); renderPlayers(); renderTurn(); renderBrasserie(); renderBrasser(); renderMarche(); renderClients(); renderAmeliorer(); renderTrade();
    renderHint(mode);
    renderLog();
    renderModal();
  }

  /* ---------- événements ---------- */

  const ACTS = {
    end: () => act({ type: 'endTurn' }),
    cancel: () => { ui.mode = null; render(); },
    tournee: () => { ui.mode = 'tournee'; render(); },
    brasser: (b) => act({ type: 'brasser', style: b.dataset.style }),
    torrefier: () => act({ type: 'torrefier' }),
    acheter: (b) => act({ type: 'acheter', r: b.dataset.r, n: 1 }),
    vendre: (b) => act({ type: 'vendre', style: b.dataset.style, n: 1 }),
    salle: (b) => act({ type: 'salle', style: b.dataset.style }),
    livrer: (b) => act({ type: 'livrer', client: b.dataset.client, style: b.dataset.style }),
    ameliorer: (b) => act({ type: 'ameliorer', u: b.dataset.u }),
    og: (b) => { const r = b.dataset.r; ui.offer.give[r] = Math.max(0, ui.offer.give[r] + +b.dataset.d); render(); },
    ow: (b) => { const r = b.dataset.r; ui.offer.get[r] = Math.max(0, ui.offer.get[r] + +b.dataset.d); render(); },
    propose: async () => {
      const r = await act({ type: 'proposeTrade', give: { ...ui.offer.give }, get: { ...ui.offer.get } });
      if (r?.ok) ui.offer = { give: ZI(), get: ZI() };
    },
    new: () => onNewGame?.(),
    accueil: () => onHome?.(),
  };
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-act]');
    if (b && !b.disabled && ACTS[b.dataset.act]) ACTS[b.dataset.act](b);
  });
  document.addEventListener('change', (e) => {
    if (e.target.id === 'offersOn') act({ type: 'setOffers', on: e.target.checked });
  });
  function boardPick(e) {
    const mode = lastMode;
    if (!mode) return;
    const t = e.target.closest('[data-id]');
    if (!t || t.dataset.k !== mode.kind) return;
    const id = mode.kind === 'hex' ? +t.dataset.id : t.dataset.id;
    const okId = mode.kind === 'hex' ? mode.targets.includes(id) : mode.targets.some((x) => x.client === id);
    if (okId) mode.pick(id);
  }
  $('#board').addEventListener('click', boardPick);
  $('#board').addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); boardPick(e); } });
  $('#modalBox').addEventListener('click', onModalClick);

  return {
    update(v, o = {}) { view = v; opts = o; render(); },
    reset() { ui.mode = null; ui.offer = { give: ZI(), get: ZI() }; ui.counter = null; ui.modalKey = null; ui.winClosed = false; view = null; $('#modal').hidden = true; },
  };
}
