// Affichage et interactions. Tout se déduit de la vue du joueur (viewFor) et de ses actions légales :
// le même code sert au mode solo et au jeu en réseau.
//
//   const ui = createUi({ send, onNewGame });   send(action) → { ok, error } (ou une promesse)
//   ui.update(view, { busy })                    busy : l'adversaire joue, on attend

import { RES, COST, TOPO, PIPS, Z, total, legalActions, rate } from '../moteur/index.js';
import { RN, RI, TILE, DEV, fmt, logLines } from './textes.js';

export const RCOL = { fut: '#8b5b33', eau: '#3d86aa', lev: '#d2c9a8', malt: '#d8af40', houb: '#5d9638', friche: '#76685a' };
export const RTXT = { fut: '#f6eadb', eau: '#f2f8fb', lev: '#2a1d15', malt: '#2a1d15', houb: '#f1f7ea', friche: '#f2e6d0' };
export const PCOL = ['#d9473a', '#4b87d6', '#e6ad2e', '#ece4d4'];

const $ = (s) => document.querySelector(s);
const esc = (t) => String(t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const ICON = {
  fut: '<g fill="rgba(0,0,0,.35)"><ellipse rx="10" ry="12"/></g><g stroke="rgba(255,240,220,.55)" stroke-width="2" fill="none"><path d="M-9,-5H9M-9,5H9"/></g>',
  eau: '<path fill="rgba(255,255,255,.55)" d="M0,-12C6,-4 9,0 9,4A9,9 0 0 1 -9,4C-9,0 -6,-4 0,-12Z"/>',
  lev: '<g fill="rgba(60,45,30,.45)"><circle cx="-6" cy="3" r="6"/><circle cx="6" cy="1" r="5"/><circle cx="1" cy="-8" r="4"/></g>',
  malt: '<g stroke="rgba(60,40,10,.55)" stroke-width="2" fill="rgba(60,40,10,.4)"><path d="M0,13V-12" fill="none"/><ellipse cx="-4" cy="-6" rx="2.6" ry="4.5" transform="rotate(-30 -4 -6)"/><ellipse cx="4" cy="-6" rx="2.6" ry="4.5" transform="rotate(30 4 -6)"/><ellipse cx="-4" cy="2" rx="2.6" ry="4.5" transform="rotate(-30 -4 2)"/><ellipse cx="4" cy="2" rx="2.6" ry="4.5" transform="rotate(30 4 2)"/></g>',
  houb: '<g fill="rgba(230,250,200,.5)"><path d="M0,-13L7,-4L5,6L0,13L-5,6L-7,-4Z"/></g><g stroke="rgba(30,60,20,.5)" stroke-width="1.6" fill="none"><path d="M-6,-3L0,1L6,-3M-5,5L0,9L5,5"/></g>',
  friche: '<g stroke="rgba(0,0,0,.3)" stroke-width="2.5" stroke-linecap="round"><path d="M-9,8L-3,-6M0,8L2,-9M7,8L9,-4"/></g>',
};
const PAWN = '<g stroke="#e9dcc2" stroke-width="1.8"><path fill="#1c1714" d="M-10,13Q-10,-2 0,-2Q10,-2 10,13Z"/><circle fill="#1c1714" cy="-8" r="6.5"/><path fill="#1c1714" d="M-8,-13H8L6,-18H-6Z"/></g>';
const poly = (pts) => pts.map((p) => p.join(',')).join(' ');
const DIEPOS = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };
const dieHTML = (n, seven) => `<div class="die${seven ? ' seven' : ''}" aria-label="${n || '—'}">${Array.from({ length: 9 }, (_, k) => `<i class="${n && DIEPOS[n].includes(k) ? 'on' : ''}"></i>`).join('')}</div>`;
const chip = (r) => `<span class="cst" title="${RN[r]}" style="--rc:${RCOL[r]};--rt:${RTXT[r]}">${RI[r]}</span>`;
const chips = (c) => `<span class="costs">${Object.entries(c).flatMap(([r, n]) => Array(n).fill(chip(r))).join('')}</span>`;
const sw = (i) => `<span class="sw" style="background:${PCOL[i]}"></span>`;

export function createUi({ send, onNewGame }) {
  let view = null, opts = {}, L = [];
  const ui = { mode: null, give: 'fut', get: 'malt', offer: { give: Z(), get: Z() }, modal: null, sel: Z(), counter: null, modalKey: null, error: '', errorTimer: null };

  const me = () => view.me;
  const P = () => view.players;
  const mine = () => view.me !== null && view.me !== undefined;
  const legal = (type, f = () => true) => L.find((a) => a.type === type && f(a));
  const you = (i) => i === view.me;

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

  // Mode de sélection imposé par une décision en attente, sinon celui choisi par le joueur (construction)
  function boardMode() {
    if (!mine() || opts.busy) return null;
    const pend = view.pending;
    const b = legal('build');
    if (view.phase === 'setup' && b) {
      const second = view.setup.k >= P().length;
      return b.what === 'settle'
        ? { kind: 'vert', targets: b.targets, hint: second ? 'Place ta 2ᵉ microbrasserie. Elle te rapporte une carte de chaque case voisine.' : 'Place ta 1ʳᵉ microbrasserie sur un croisement libre.', pick: (at) => act({ type: 'build', what: 'settle', at }) }
        : { kind: 'edge', targets: b.targets, hint: 'Trace la tournée qui part de cette microbrasserie.', pick: (at) => act({ type: 'build', what: 'road', at }) };
    }
    const mr = legal('moveRobber');
    if (mr) return { kind: 'hex', targets: mr.targets, hint: 'Déplace le contrôleur des douanes sur une autre case.', pick: (hex) => act({ type: 'moveRobber', hex }) };
    if (pend?.type === 'roads' && b) return { kind: 'edge', targets: b.targets, hint: `Nouveau camion : pose ta tournée gratuite (il en reste ${pend.left}).`, pick: (at) => act({ type: 'build', what: 'road', at }) };
    if (ui.mode) {
      const still = legal('build', (a) => a.what === ui.mode.what && !a.free);
      if (still) return { ...ui.mode, targets: still.targets, cancel: true };
      ui.mode = null;
    }
    return null;
  }
  const BUILD_HINT = { road: 'Choisis où tracer ta tournée.', settle: 'Choisis où ouvrir ta microbrasserie.', city: 'Choisis la microbrasserie à agrandir.' };
  function chooseBuild(what) {
    const b = legal('build', (a) => a.what === what && !a.free);
    if (!b) return;
    ui.mode = { what, kind: what === 'road' ? 'edge' : 'vert', hint: BUILD_HINT[what], pick: (at) => { ui.mode = null; return act({ type: 'build', what, at }); } };
    render();
  }

  function renderBoard(mode) {
    const v = view;
    let s = '';
    const R = 318;
    s += `<polygon points="${poly([0, 1, 2, 3, 4, 5].map((i) => [R * Math.cos(Math.PI / 3 * i), R * Math.sin(Math.PI / 3 * i)]))}" fill="var(--sea)" stroke="var(--sea2)" stroke-width="10" stroke-linejoin="round"/>`;
    TOPO.ports.forEach((pt, i) => {
      const type = v.ports[i], a = TOPO.verts[pt.a], b = TOPO.verts[pt.b], col = type === '3:1' ? 'var(--ink)' : RCOL[type];
      s += `<path d="M${pt.x},${pt.y}L${a.x},${a.y}M${pt.x},${pt.y}L${b.x},${b.y}" stroke="#7d6b58" stroke-width="3" stroke-dasharray="4 4"/>`;
      s += `<g><title>${type === '3:1' ? 'Quai 3:1 (toutes ressources)' : 'Quai 2:1 ' + RN[type]}</title><circle cx="${pt.x}" cy="${pt.y}" r="16" fill="var(--panel)" stroke="${col}" stroke-width="3.5"/><text x="${pt.x}" y="${pt.y + 5}" text-anchor="middle" font-size="14" font-weight="700" fill="var(--ink)">${type === '3:1' ? '3:1' : '2:1'}</text></g>`;
    });
    TOPO.hexes.forEach((h, i) => {
      const t = v.hexes[i];
      const pts = h.verts.map((x) => [h.x + (TOPO.verts[x].x - h.x) * 0.965, h.y + (TOPO.verts[x].y - h.y) * 0.965]);
      s += `<polygon class="tile" points="${poly(pts)}" fill="${RCOL[t.res]}"><title>${TILE[t.res]}${t.num ? ' · ' + t.num : ''}</title></polygon>`;
      if (v.phase === 'main' && v.lastRoll && t.num === v.lastRoll && i !== v.robber) s += `<polygon class="hot" points="${poly(pts.map(([x, y]) => [h.x + (x - h.x) * 0.9, h.y + (y - h.y) * 0.9]))}"/>`;
      s += `<g transform="translate(${h.x},${h.y - 30})">${i === v.robber ? PAWN : ICON[t.res]}</g>`;
      if (t.num) {
        const red = t.num === 6 || t.num === 8, pc = PIPS(t.num), dim = i === v.robber ? 'opacity=".45"' : '';
        s += `<circle cx="${h.x}" cy="${h.y + 8}" r="17" fill="#efe3c8" stroke="#3b2c22" stroke-width="1.5" ${dim}/>`;
        s += `<text x="${h.x}" y="${h.y + 13}" text-anchor="middle" font-size="19" font-weight="700" fill="${red ? '#b3311d' : '#2a1d15'}" ${dim}>${t.num}</text>`;
        for (let k = 0; k < pc; k++) s += `<circle cx="${h.x + (k - (pc - 1) / 2) * 4.6}" cy="${h.y + 19}" r="1.6" fill="${red ? '#b3311d' : '#2a1d15'}"/>`;
      }
      if (i === v.robber && t.res !== 'friche') s += `<polygon points="${poly(pts)}" fill="rgba(20,14,10,.35)"/>`;
    });
    if (mode?.kind === 'hex') mode.targets.forEach((i) => {
      const h = TOPO.hexes[i];
      s += `<polygon class="hpick" data-k="hex" data-id="${i}" tabindex="0" points="${poly(h.verts.map((x) => [h.x + (TOPO.verts[x].x - h.x) * 0.86, h.y + (TOPO.verts[x].y - h.y) * 0.86]))}"><title>${TILE[v.hexes[i].res]}</title></polygon>`;
    });
    v.edges.forEach((o, i) => {
      if (o === null) return;
      const e = TOPO.edges[i], a = TOPO.verts[e.a], b = TOPO.verts[e.b], k = 0.16;
      const x1 = a.x + (b.x - a.x) * k, y1 = a.y + (b.y - a.y) * k, x2 = b.x + (a.x - b.x) * k, y2 = b.y + (a.y - b.y) * k;
      s += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="var(--dark)" stroke-width="10" stroke-linecap="round"/><line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${PCOL[o]}" stroke-width="6" stroke-linecap="round"/>`;
    });
    if (mode?.kind === 'edge') mode.targets.forEach((i) => {
      const e = TOPO.edges[i], a = TOPO.verts[e.a], b = TOPO.verts[e.b], k = 0.2;
      s += `<line class="espot" data-k="edge" data-id="${i}" tabindex="0" x1="${a.x + (b.x - a.x) * k}" y1="${a.y + (b.y - a.y) * k}" x2="${b.x + (a.x - b.x) * k}" y2="${b.y + (a.y - b.y) * k}"/>`;
    });
    v.verts.forEach((x, i) => {
      if (x.o === null) return;
      const c = PCOL[x.o], V = TOPO.verts[i];
      s += x.t === 1
        ? `<path transform="translate(${V.x},${V.y})" d="M-9,8V-2L0,-11L9,-2V8Z" fill="${c}" stroke="var(--dark)" stroke-width="2.2" stroke-linejoin="round"/>`
        : `<path transform="translate(${V.x},${V.y})" d="M-14,9V-3L-5,-10V-3H4V-16H10V-3H14V9Z" fill="${c}" stroke="var(--dark)" stroke-width="2.2" stroke-linejoin="round"/>`;
    });
    if (mode?.kind === 'vert') mode.targets.forEach((i) => {
      const V = TOPO.verts[i];
      s += `<circle class="spot" data-k="vert" data-id="${i}" tabindex="0" cx="${V.x}" cy="${V.y}" r="${v.verts[i].o !== null ? 16 : 10}"/>`;
    });
    $('#board').innerHTML = s;
  }

  /* ---------- fenêtres ---------- */

  function countsModal(key, title, text, need, maxOf, label, onOk) {
    const sum = total(ui.sel);
    return {
      key,
      html: `<h2>${title}</h2><p>${text}</p>${RES.map((r) => `<div class="prow">${chip(r)}<span>${RN[r]}</span><span class="have">${maxOf(r)}</span><button class="btn" data-m="${r}" aria-label="Retirer ${RN[r]}" ${ui.sel[r] ? '' : 'disabled'}>−</button><b>${ui.sel[r]}</b><button class="btn" data-p="${r}" aria-label="Ajouter ${RN[r]}" ${ui.sel[r] < maxOf(r) && sum < need ? '' : 'disabled'}>+</button></div>`).join('')}
        <button class="btn primary" data-ok ${sum === need ? '' : 'disabled'}>${label} (${sum}/${need})</button>`,
      ok: () => onOk({ ...ui.sel }),
    };
  }

  function currentModal() {
    const v = view;
    if (v.phase === 'over') {
      const w = v.winner, P0 = P();
      const order = P0.map((_, i) => i).sort((a, b) => P0[b].vp - P0[a].vp);
      return {
        key: 'win',
        html: `<h2>${you(w) ? 'Tu remportes la saison !' : esc(P0[w].name) + ' remporte la saison'}</h2><p>${you(w) ? 'Ta brasserie est la plus réputée du terroir.' : 'Sa brasserie est la plus réputée du terroir.'}</p>
          ${order.map((i) => `<div class="score">${sw(i)}<span>${esc(P0[i].name)}</span><b>${P0[i].vp} PV</b></div>`).join('')}
          ${onNewGame ? '<button class="btn primary" data-again>Rejouer</button>' : '<button class="btn" data-close>Fermer</button>'}`,
      };
    }
    if (!mine()) return null;
    const p = P()[me()];
    const d = legal('discard');
    if (d) return countsModal('discard', 'Contrôle des douanes', `Tu as ${total(p.res)} cartes : défausse-en ${d.count}.`, d.count, (r) => p.res[r], 'Défausser', (res) => act({ type: 'discard', res }));
    const st = legal('steal');
    if (st) return {
      key: 'steal',
      html: `<h2>Chez qui piocher ?</h2><p>Une carte au hasard dans la main du joueur choisi.</p><div class="mrow">${st.targets.map((i) => `<button class="btn" data-v="${i}"><span class="sw" style="display:inline-block;vertical-align:-2px;margin-right:6px;background:${PCOL[i]}"></span>${esc(P()[i].name)} (${P()[i].nres})</button>`).join('')}</div>`,
      pick: (i) => act({ type: 'steal', victim: i }),
    };
    const t = v.trade;
    if (t && t.to.includes(me()) && !t.resp[me()]) {
      if (ui.counter) {
        const c = ui.counter;
        const stp = (k, r, n, max) => `<span class="stp"><button class="btn mini" data-c="${k}" data-r="${r}" data-d="-1" ${n ? '' : 'disabled'}>−</button><b>${n}</b><button class="btn mini" data-c="${k}" data-r="${r}" data-d="1" ${n < max ? '' : 'disabled'}>+</button></span>`;
        const okC = total(c.give) && total(c.get) && RES.every((r) => p.res[r] >= c.get[r]);
        return {
          key: `counter-${t.id}`,
          html: `<h2>Contre-proposition</h2><p>Ce que ${esc(P()[t.from].name)} te donnerait, et ce que tu lui donnes.</p>
            <div class="offer"><span></span><span class="oh">Tu reçois</span><span class="oh">Tu donnes</span>
            ${RES.map((r) => `<span class="rl">${chip(r)}${RN[r]}</span>${stp('give', r, c.give[r], 9)}${stp('get', r, c.get[r], p.res[r])}`).join('')}</div>
            <div class="mrow"><button class="btn primary" data-cok ${okC ? '' : 'disabled'}>Envoyer</button><button class="btn ghost" data-cback>Retour</button></div>`,
        };
      }
      const canAccept = legal('respondTrade')?.canAccept;
      return {
        key: `offer-${t.id}`,
        html: `<h2>Offre de ${esc(P()[t.from].name)}</h2><p>${esc(P()[t.from].name)} te propose <b>${fmt(t.give)}</b> contre <b>${fmt(t.get)}</b>.</p>
          <p class="small">Ta main : ${RES.map((r) => `${p.res[r]} ${RN[r]}`).join(' · ')}</p>
          <div class="mrow"><button class="btn primary" data-y ${canAccept ? '' : 'disabled'}>Accepter</button><button class="btn" data-n>Refuser</button><button class="btn ghost" data-ctr>Contre-proposer</button></div>`,
      };
    }
    if (t && t.from === me()) {
      const rows = t.to.map((i) => {
        const r = t.resp[i];
        const txt = !r ? 'Réfléchit…' : r.s === 'refuse' ? 'Refuse.' : r.s === 'accept' ? 'Accepte.' : `Accepte si tu donnes ${fmt(r.give)} contre ${fmt(r.get)}.`;
        const can = r && r.s !== 'refuse' && RES.every((x) => p.res[x] >= (r.s === 'counter' ? r.give[x] : t.give[x]));
        return `<div class="resp">${sw(i)}<div><b>${esc(P()[i].name)}</b><small>${txt}</small></div>${can ? `<button class="btn ${r.s === 'counter' ? '' : 'primary'}" data-k="${i}">${r.s === 'counter' ? 'Accepter' : 'Conclure'}</button>` : ''}</div>`;
      });
      const any = Object.values(t.resp).some((r) => r.s !== 'refuse');
      return {
        key: `responses-${t.id}`,
        html: `<h2>Réponses</h2><p>Tu proposes ${fmt(t.give)} contre ${fmt(t.get)}.</p><div>${rows.join('')}</div>
          <button class="btn ghost" data-k="-1">${any ? 'Annuler' : Object.keys(t.resp).length === t.to.length ? 'Fermer' : 'Retirer l’offre'}</button>`,
      };
    }
    if (ui.modal === 'plenty') return countsModal('plenty', 'Livraison fournisseur', 'Choisis 2 ressources.', 2, () => 2, 'Recevoir', (res) => { ui.modal = null; return act({ type: 'playDev', card: 'plenty', res }); });
    if (ui.modal === 'mono') return {
      key: 'mono',
      html: `<h2>Contrat d'exclusivité</h2><p>Quelle ressource récupères-tu chez tout le monde ?</p><div class="mrow">${RES.map((r) => `<button class="btn" data-r="${r}" style="background:${RCOL[r]};color:${RTXT[r]};border-color:${RCOL[r]}">${RN[r]}</button>`).join('')}</div><button class="btn ghost" data-close>Annuler</button>`,
    };
    return null;
  }

  let modalNow = null;
  function renderModal() {
    const m = currentModal();
    const box = $('#modalBox');
    if (!m) {
      modalNow = null; ui.modalKey = null;
      $('#modal').hidden = true;
      return;
    }
    const fresh = m.key !== ui.modalKey;
    if (fresh) { ui.sel = Z(); ui.modalKey = m.key; }
    modalNow = fresh ? currentModal() : m;
    box.innerHTML = modalNow.html;
    $('#modal').hidden = false;
    if (fresh) box.querySelector('button:not(:disabled)')?.focus();
  }

  function onModalClick(e) {
    const b = e.target.closest('button');
    if (!b || b.disabled || !modalNow) return;
    const m = modalNow, ds = b.dataset;
    if (ds.m) { ui.sel[ds.m]--; return render(); }
    if (ds.p) { ui.sel[ds.p]++; return render(); }
    if ('ok' in ds) return m.ok();
    if (ds.v !== undefined) return m.pick(+ds.v);
    if ('again' in ds) return onNewGame?.();
    if ('close' in ds) { if (view.phase === 'over') { $('#modal').hidden = true; modalNow = null; return; } ui.modal = null; return render(); }
    if (ds.r && ui.modal === 'mono') { ui.modal = null; return act({ type: 'playDev', card: 'mono', r: ds.r }); }
    if ('y' in ds) return act({ type: 'respondTrade', accept: true });
    if ('n' in ds) return act({ type: 'respondTrade', accept: false });
    if ('ctr' in ds) { ui.counter = { give: { ...view.trade.give }, get: { ...view.trade.get } }; return render(); }
    if (ds.c) { const c = ui.counter[ds.c]; c[ds.r] = Math.max(0, c[ds.r] + +ds.d); return render(); }
    if ('cback' in ds) { ui.counter = null; return render(); }
    if ('cok' in ds) { const counter = ui.counter; ui.counter = null; return act({ type: 'respondTrade', counter }); }
    if (ds.k !== undefined) {
      const k = +ds.k;
      if (k < 0) return act({ type: 'cancelTrade' });
      return act({ type: 'concludeTrade', with: k });
    }
  }

  /* ---------- comptoir ---------- */

  function hintText(mode) {
    const v = view, cp = P()[v.cur];
    if (ui.error) return { txt: ui.error, col: 'var(--copper)' };
    if (mode) return { txt: mode.hint, col: PCOL[me()] };
    if (v.phase === 'over') return { txt: `${you(v.winner) ? 'Tu gagnes' : esc(P()[v.winner].name) + ' gagne'} la partie.`, col: PCOL[v.winner] };
    if (v.pending?.type === 'discard') {
      const who = Object.keys(v.pending.need).map(Number).filter((i) => !you(i)).map((i) => esc(P()[i].name));
      if (who.length && !legal('discard')) return { txt: `Contrôle des douanes : ${who.join(', ')} ${who.length > 1 ? 'défaussent' : 'défausse'}…`, col: PCOL[v.cur] };
    }
    if (v.trade && v.trade.from !== me() && !(v.trade.to.includes(me()) && !v.trade.resp[me()])) return { txt: `${esc(P()[v.trade.from].name)} attend des réponses à son offre…`, col: PCOL[v.trade.from] };
    const myTurn = mine() && v.cur === me() && !v.pending;
    if (myTurn && v.phase === 'main') return { txt: v.rolled ? 'Construis, négocie ou termine ton tour.' : 'À toi : lance les dés (ou joue un expert-comptable avant).', col: PCOL[me()] };
    if (v.phase === 'setup') return { txt: `${esc(cp.name)} choisit son emplacement…`, col: PCOL[v.cur] };
    const who = v.pending?.p ?? v.cur;
    return { txt: `Tour de ${esc(P()[who].name)}…`, col: PCOL[who] };
  }

  function renderSide(mode) {
    const v = view, players = P(), my = mine() ? players[me()] : null;
    $('#players').innerHTML = players.map((p, i) => `<div class="pl ${v.cur === i && v.phase !== 'over' ? 'cur' : ''}">${sw(i)}
      <div class="pn"><b>${esc(p.name)}${you(i) && p.name !== 'Toi' ? ' (toi)' : ''}</b><small>${p.nres} cartes · ${p.ndev} événement${p.ndev > 1 ? 's' : ''} · ${p.knights} expert${p.knights > 1 ? 's' : ''}${p.status ? ' · ' + esc(p.status) : ''}</small></div>
      <div class="badges">${v.longest === i ? '<span class="bdg" title="Plus grand réseau de livraison">Réseau</span>' : ''}${v.army === i ? '<span class="bdg" title="Meilleur dossier comptable">Dossier</span>' : ''}</div>
      <div class="vp" title="${you(i) ? 'Tes points, cartes Médaille comprises' : 'Points visibles'}">${p.vp}<small>/10</small></div></div>`).join('');

    const roll = !opts.busy && legal('roll'), end = !opts.busy && legal('endTurn');
    $('#turn').innerHTML = `<div class="dice">${dieHTML(v.dice[0], v.lastRoll === 7)}${dieHTML(v.dice[1], v.lastRoll === 7)}</div>
      <button class="btn primary grow" data-act="roll" ${roll ? '' : 'disabled'}>Lancer les dés</button>
      <button class="btn" data-act="end" ${end ? '' : 'disabled'}>Fin du tour</button>`;
    if (!my) { $('#hand').innerHTML = ''; $('#build').innerHTML = ''; $('#devs').innerHTML = ''; $('#trade').innerHTML = ''; return; }

    $('#hand').innerHTML = RES.map((r) => `<div class="res ${my.res[r] ? '' : 'zero'}" style="--rc:${RCOL[r]};--rt:${RTXT[r]}"><b>${my.res[r]}</b><span>${RN[r]}</span></div>`).join('');
    const can = (what) => !opts.busy && !mode && legal('build', (a) => a.what === what && !a.free);
    const B = [['road', 'Tournée', `Route de livraison · ${my.roads} restantes`, COST.road], ['settle', 'Microbrasserie', `1 point · ${my.settles} restantes`, COST.settle],
      ['city', 'Grande brasserie', 'Remplace une microbrasserie · 2 points', COST.city], ['dev', 'Carte Événement', `${v.deck} dans la pioche`, COST.dev]];
    $('#build').innerHTML = B.map(([k, n, sub, c]) => `<div class="bname"><b>${n}</b><small>${sub}</small>${chips(c)}</div>
      <button class="btn" data-act="${k}" ${(k === 'dev' ? !opts.busy && !mode && legal('buyDev') : can(k)) ? '' : 'disabled'}>${k === 'dev' ? 'Tirer' : 'Construire'}</button>`).join('');

    $('#devs').innerHTML = my.dev.length ? my.dev.map((c, i) => {
      const playable = c.t !== 'vp' && !opts.busy && !mode && c.turn < v.turn && legal('playDev', (a) => a.card === c.t);
      return `<div class="dev"><b>${DEV[c.t].name}</b><small>${DEV[c.t].txt}${c.t !== 'vp' && c.turn >= v.turn ? ' Jouable au prochain tour.' : ''}</small>${c.t === 'vp' ? '' : `<button class="btn" data-act="play" data-card="${c.t}" ${playable ? '' : 'disabled'}>Jouer</button>`}</div>`;
    }).join('') : '<p class="empty">Aucune carte. Tire-en une avec Levure, Malt et Houblon.</p>';

    const r = rate(v, me(), ui.give), o = ui.offer;
    const bankOk = !opts.busy && !mode && ui.give !== ui.get && legal('bankTrade', (a) => a.give === ui.give);
    const okOffer = !opts.busy && !mode && legal('proposeTrade') && total(o.give) && total(o.get) && RES.every((x) => my.res[x] >= o.give[x]) && !RES.some((x) => o.give[x] && o.get[x]);
    const stp = (k, x, n, max) => `<span class="stp"><button class="btn mini" data-act="${k}" data-r="${x}" data-d="-1" aria-label="Moins de ${RN[x]}" ${n ? '' : 'disabled'}>−</button><b>${n}</b><button class="btn mini" data-act="${k}" data-r="${x}" data-d="1" aria-label="Plus de ${RN[x]}" ${n < max ? '' : 'disabled'}>+</button></span>`;
    $('#trade').innerHTML = `<div class="tsec"><h3>Avec le grossiste</h3><div class="trade"><label>Tu donnes<select id="give">${RES.map((x) => `<option value="${x}" ${x === ui.give ? 'selected' : ''}>${rate(v, me(), x)} ${RN[x]}</option>`).join('')}</select></label>
      <label>Tu reçois<select id="get">${RES.map((x) => `<option value="${x}" ${x === ui.get ? 'selected' : ''}>1 ${RN[x]}</option>`).join('')}</select></label>
      <button class="btn" data-act="bank" ${bankOk ? '' : 'disabled'}>Échanger ${r} ${RN[ui.give]} contre 1 ${RN[ui.get]}</button></div></div>
      <div class="tsec"><h3>Avec les autres brasseries</h3>
      <div class="offer"><span></span><span class="oh">Tu donnes</span><span class="oh">Tu demandes</span>
      ${RES.map((x) => `<span class="rl">${chip(x)}${RN[x]}</span>${stp('og', x, o.give[x], my.res[x])}${stp('ow', x, o.get[x], 9)}`).join('')}</div>
      <button class="btn" data-act="propose" ${okOffer ? '' : 'disabled'}>Proposer l'échange</button>
      <label class="chk"><input type="checkbox" id="offersOn" ${my.offersOn ? 'checked' : ''}>Recevoir les offres des autres brasseries</label></div>`;
  }

  function renderHint(mode) {
    const h = hintText(mode);
    $('#hint').innerHTML = `<span class="dot" style="background:${h.col}"></span><span class="grow">${h.txt}</span>${mode?.cancel ? '<button class="btn ghost" data-act="cancel">Annuler</button>' : ''}`;
  }

  function renderLog() {
    const lines = view.log.flatMap((e) => logLines(e, view)).reverse().slice(0, 40);
    $('#log').innerHTML = lines.map((l) => `<li><i style="background:${l.p === null || l.p === undefined ? 'var(--muted)' : PCOL[l.p]}"></i><span>${esc(l.txt)}</span></li>`).join('');
  }

  let lastMode = null;
  function render() {
    if (!view) return;
    L = mine() ? legalActions(view, me()) : [];
    if (view.trade?.id !== ui.counterFor) { ui.counter = null; ui.counterFor = view.trade?.id; }
    const mode = boardMode();
    lastMode = mode;
    renderBoard(mode);
    renderSide(mode);
    renderHint(mode);
    renderLog();
    renderModal();
  }

  /* ---------- événements ---------- */

  const ACTS = {
    roll: () => act({ type: 'roll' }),
    end: () => act({ type: 'endTurn' }),
    cancel: () => { ui.mode = null; render(); },
    road: () => chooseBuild('road'),
    settle: () => chooseBuild('settle'),
    city: () => chooseBuild('city'),
    dev: () => act({ type: 'buyDev' }),
    play: (b) => {
      const card = b.dataset.card;
      if (card === 'plenty' || card === 'mono') { ui.modal = card; return render(); }
      return act({ type: 'playDev', card });
    },
    og: (b) => { const r = b.dataset.r; ui.offer.give[r] = Math.max(0, ui.offer.give[r] + +b.dataset.d); render(); },
    ow: (b) => { const r = b.dataset.r; ui.offer.get[r] = Math.max(0, ui.offer.get[r] + +b.dataset.d); render(); },
    propose: async () => {
      const r = await act({ type: 'proposeTrade', give: { ...ui.offer.give }, get: { ...ui.offer.get } });
      if (r?.ok) ui.offer = { give: Z(), get: Z() };
    },
    bank: () => act({ type: 'bankTrade', give: ui.give, get: ui.get }),
    new: () => onNewGame?.(),
  };
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-act]');
    if (b && !b.disabled && ACTS[b.dataset.act]) ACTS[b.dataset.act](b);
  });
  document.addEventListener('change', (e) => {
    if (e.target.id === 'give') { ui.give = e.target.value; render(); }
    if (e.target.id === 'get') { ui.get = e.target.value; render(); }
    if (e.target.id === 'offersOn') act({ type: 'setOffers', on: e.target.checked });
  });
  function boardPick(e) {
    const mode = lastMode;
    if (!mode) return;
    const t = e.target.closest('[data-id]');
    if (!t || t.dataset.k !== mode.kind) return;
    const id = +t.dataset.id;
    if (mode.targets.includes(id)) mode.pick(id);
  }
  $('#board').addEventListener('click', boardPick);
  $('#board').addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); boardPick(e); } });
  $('#modalBox').addEventListener('click', onModalClick);

  return {
    update(v, o = {}) { view = v; opts = o; render(); },
    reset() { ui.mode = null; ui.modal = null; ui.offer = { give: Z(), get: Z() }; ui.counter = null; ui.modalKey = null; },
  };
}
