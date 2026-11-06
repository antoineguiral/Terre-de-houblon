// Affichage et interactions. Tout se déduit de la vue du joueur (viewFor) et de ses actions légales :
// le même code sert au mode solo et au jeu en réseau.
//
//   const ui = createUi({ send, onNewGame, onHome });   send(action) → { ok, error } (ou une promesse)
//   ui.update(view, { busy, rejouer, pasApas })          busy : l'adversaire joue ; rejouer : proposer une nouvelle partie à la fin ;
//                                                        pasApas : l'ordinateur attend un clic (onStep) pour jouer

import {
  RES, STYLES, ITEMS, RECETTES, CASES, ACHAT, ACHAT_MAX, AMELIORATIONS, EVT, SAISONS, NB_SAISONS, STOCK_MAX, FERMENTEURS_MAX, OUVRIERS_MAX,
  DEMANDE, ARGENT_PAR_POINT, ZI, total, legalActions, saisonIdx, unites, cuveUnites, prixMarche, valeurLivraison, pointsDiversite,
} from '../moteur/index.js';
import { RN, RI, SN, SI, SAISON_NOM, KIND, nomItem, nomSaison, meteoTexte, fmt, logLines, plural } from './textes.js';
import { RYTHMES, rythme, choisirRythme, facteur, DUREE_BULLE } from './rythme.js';
import * as D from './dessins.js';

export const RCOL = { malt: '#d8af40', houb: '#5d9638', argent: '#d38b46' };
export const RTXT = { malt: '#2a1d15', houb: '#f1f7ea', argent: '#1a120d' };
export const SCOL = { blonde: '#e8c15a', ipa: '#d98b3a', stout: '#2b1b14', garde: '#8a4b2a' };
export const STXT = { blonde: '#2a1d15', ipa: '#1a120d', stout: '#f6eadb', garde: '#f6eadb' };
export const PCOL = ['#d9473a', '#4b87d6', '#e6ad2e', '#ece4d4'];

const $ = (s) => document.querySelector(s);
const esc = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const chip = (r) => `<span class="cst" title="${RN[r]}" style="--rc:${RCOL[r]};--rt:${RTXT[r]}">${RI[r]}</span>`;
const schip = (st) => `<span class="cst sty" title="${SN[st]}" style="--rc:${SCOL[st]};--rt:${STXT[st]}">${SI[st]}</span>`;
const ichip = (k) => (RES.includes(k) || k === 'argent' ? chip(k) : schip(k));
const chips = (c) => `<span class="costs">${RES.flatMap((r) => Array(c[r] ?? 0).fill(chip(r))).join('')}</span>`;
const sw = (i) => `<span class="sw" style="background:${PCOL[i]}"></span>`;
const stepper = (k, key, n, max) => `<span class="stp"><button class="btn mini" data-act="${k}" data-r="${key}" data-d="-1" aria-label="Moins" ${n ? '' : 'disabled'}>−</button><b>${n}</b><button class="btn mini" data-act="${k}" data-r="${key}" data-d="1" aria-label="Plus" ${n < max ? '' : 'disabled'}>+</button></span>`;

export function createUi({ send, onNewGame, onHome, onStep }) {
  let view = null, opts = {}, L = [];
  const ui = { mode: null, sel: null, offer: { give: ZI(), get: ZI() }, counter: null, counterFor: null, modalKey: null, error: '', errorTimer: null, winClosed: false };

  const me = () => view.me;
  const P = () => view.players;
  const mine = () => view.me !== null && view.me !== undefined;
  const legal = (type, f = () => true) => L.find((a) => a.type === type && f(a));
  const you = (i) => i === view.me;
  const my = () => (mine() ? P()[me()] : null);
  const free = () => mine() && !opts.busy && view.phase === 'main' && view.cur === me() && !view.pending;
  const poses = () => (free() ? legal('poser')?.targets ?? [] : []);
  const poseSur = (c) => poses().find((t) => t.case === c);
  const avoir = (p, k) => (RES.includes(k) ? p.res[k] : k === 'argent' ? p.argent : p.stock[k]);

  async function act(action) {
    const r = await send(action);
    if (r && !r.ok) showError(r.error);
    else { ui.mode = null; ui.sel = null; }
    return r;
  }
  function showError(msg) {
    ui.error = msg;
    clearTimeout(ui.errorTimer);
    ui.errorTimer = setTimeout(() => { ui.error = ''; render(); }, 3500);
    render();
  }

  /* ---------- plateau ---------- */

  function renderSaison() {
    const v = view;
    const e = v.evt ? EVT[v.evt] : null;
    $('#saison').innerHTML = `<div class="sbar">
      <div class="stitle"><b>${v.phase === 'over' ? 'Fin de la partie' : nomSaison(v.saison)}</b></div>
      <div class="sdice"><div class="dsl">${D.de(v.meteo, '#f6eadb', D.C.encre, 34, -8)}<small>${meteoTexte(v.meteo)}</small></div><div class="dsl">${D.de(v.de, D.C.brique, '#f6eadb', 34, 6)}<small>${e ? `<b>${esc(e.nom)}</b> ${esc(e.txt)}` : 'Pas d’événement'}</small></div></div>
      <div class="sdem"><small>En demande</small> ${v.demande.map((s) => schip(s) + ' ' + SN[s]).join(' · ')}</div>
    </div>`;
  }

  // Le plateau imprimé, dessiné depuis l'état : calendrier, 8 cases illustrées avec leurs places et les ouvriers
  // posés, pistes de prix. Une case jouable s'illumine et se clique. En portrait (téléphone), deux colonnes.
  const TW = 258, TH = 232, GAP = 14, M = 18;
  const SOUS = { marcheMat: `${ACHAT_MAX} matières max · ${ACHAT.malt} € chacune`, tournee: 'Livrer un client de la file', marcheBieres: 'Vendre au prix de la piste', chantier: 'Acheter un équipement' };
  const ACTION = { marcheMat: 'Acheter…', tournee: 'Livrer…', marcheBieres: 'Vendre…', chantier: 'S’équiper…' };
  function recolteDe(v, c, d) {
    const t = poseSur(c), si = saisonIdx(v);
    if (v.ferme.includes(c)) return 0;
    return t?.recolte ?? Math.max(0, d.recolte[si] ? d.recolte[si] + ({ 1: -1, 6: 1 }[v.meteo] ?? 0) + (v.evt === 'recolte' ? 1 : 0) - (v.occ[c]?.length ?? 0) : 0);
  }
  // Cases 0 à 50 le long d'un rectangle (sens des aiguilles d'une montre depuis le coin haut gauche),
  // un marqueur par joueur ; au-delà de 50, le marqueur repart de 0 avec un « +50 »
  function pisteReputation(v, WT, HT, RM, id) {
    const t = RM / 2, w = WT - 2 * t, h = HT - 2 * t, L = 2 * (w + h), N = 51, c = Math.min(26, L / N - 3);
    const pos = (n) => {
      let d = (n / N) * L;
      if (d < w) return [t + d, t]; d -= w;
      if (d < h) return [t + w, t + d]; d -= h;
      if (d < w) return [t + w - d, t + h]; d -= w;
      return [t, t + h - d];
    };
    let o = '';
    for (let n = 0; n < N; n++) {
      const [x, y] = pos(n), cinq = n % 5 === 0;
      o += `<rect x="${x - c / 2}" y="${y - c / 2}" width="${c}" height="${c}" rx="5" fill="${cinq ? '#f9edd2' : D.C.creme}" stroke="${D.C.encre}" stroke-width="${cinq ? 1.8 : 1}"/>`;
      o += `<text x="${x}" y="${y + 4}" text-anchor="middle" font-size="${cinq ? 12 : 10}" font-weight="700" fill="${cinq ? D.C.encre : D.C.encre2}">${n}</text>`;
    }
    const groupes = {};
    P().forEach((p, i) => { const k = p.rep % N; (groupes[k] ??= []).push(i); });
    for (const [k, js] of Object.entries(groupes)) {
      const [x, y] = pos(+k);
      js.forEach((i, j) => {
        const dx = (j - (js.length - 1) / 2) * 9, tours = Math.floor(P()[i].rep / N);
        o += `<g class="marq" data-p="${i}" filter="url(#${id}-o2)"><title>${esc(P()[i].name)} : ${P()[i].rep} Réputation</title><circle cx="${x + dx}" cy="${y - 2 - j * 3}" r="9" fill="${PCOL[i]}" stroke="${D.C.encre}" stroke-width="1.8"/>${tours ? `<text x="${x + dx}" y="${y + 1 - j * 3}" text-anchor="middle" font-size="8" font-weight="700" fill="${D.C.encre}">+${tours * N}</text>` : ''}</g>`;
      });
    }
    return o;
  }

  function renderCases() {
    const v = view, el = $('#plateau'), id = 'pl';
    const portrait = (el.clientWidth || innerWidth) < 640;
    const cols = portrait ? 2 : 4, W = M * 2 + cols * TW + (cols - 1) * GAP;
    const cases = Object.keys(CASES), rows = Math.ceil(cases.length / cols);
    const y0 = M + 78, yp = y0 + rows * (TH + GAP) + 4, trackRows = portrait ? 4 : 2;
    const H = yp + 26 + trackRows * 40 + M;
    // Piste de réputation (0 à 50) sur le pourtour : une bande de RM autour du plateau
    const RM = 40, WT = W + 2 * RM, HT = H + 2 * RM;
    let o = `<svg viewBox="0 0 ${WT} ${HT}" role="img" aria-label="Plateau de jeu">${D.defs(id)}`;
    o += `<rect x="4" y="4" width="${WT - 8}" height="${HT - 8}" rx="24" fill="${D.C.creme2}" filter="url(#${id}-o)"/>`;
    o += pisteReputation(v, WT, HT, RM, id);
    o += `<g transform="translate(${RM - 4},${RM - 4})">`;
    o += `<rect x="4" y="4" width="${W - 8}" height="${H - 8}" rx="20" fill="url(#${id}-pap)"/>`;
    o += `<rect x="12" y="12" width="${W - 24}" height="${H - 24}" rx="15" fill="none" stroke="${D.C.encre}" stroke-width="2" opacity=".25"/>`;
    // calendrier : 12 saisons, marqueur sur la saison en cours
    const step = (W - 2 * M - 28) / 12;
    o += `<text x="${M + 6}" y="${M + 12}" font-size="12" font-weight="700" fill="${D.C.encre2}" letter-spacing="2">CALENDRIER · EN DEMANDE : ${v.demande.map((st) => SN[st].toUpperCase()).join(' ET ')}</text>`;
    for (let t = 0; t < NB_SAISONS; t++) {
      const k = t % 4, an = Math.floor(t / 4), x = M + 18 + t * step + an * (portrait ? 6 : 14), y = M + 42, r = Math.min(18, step / 2 - (portrait ? 6 : 3));
      o += `<g opacity="${t < v.saison ? .45 : 1}"><title>${esc(nomSaison(t))} · en demande : ${DEMANDE[SAISONS[k]].map((st) => SN[st]).join(', ')}</title><circle cx="${x}" cy="${y}" r="${r}" fill="${D.SAISON_COL[k]}" stroke="${D.C.encre}" stroke-width="1.5"/>${D.iconeSaison(k, x, y)}</g>`;
      if (k === 0) o += `<text x="${x - r}" y="${y + r + 14}" font-size="11" font-weight="700" fill="${D.C.encre2}">AN ${an + 1}</text>`;
      if (t === v.saison) o += `<circle cx="${x}" cy="${y}" r="${r + 5}" fill="none" stroke="${D.C.cuivre}" stroke-width="5" filter="url(#${id}-o2)"/>`;
    }
    // cases
    cases.forEach((c, k) => {
      const d = CASES[c], x = M + (k % cols) * (TW + GAP), y = y0 + Math.floor(k / cols) * (TH + GAP);
      const t = poseSur(c), closed = v.ferme.includes(c) || (d.recolte && !d.recolte[saisonIdx(v)]);
      const cls = ['tuile', t ? 'can' : '', ui.mode === c ? 'active' : '', closed ? 'closed' : ''].join(' ');
      o += `<g class="${cls}" data-case="${c}" transform="translate(${x},${y})" ${t ? `tabindex="0" role="button" aria-label="${esc(d.nom)} : ${d.recolte ? 'récolter' : ACTION[c]}"` : ''}>`;
      o += `<clipPath id="${id}-c${k}"><rect width="${TW}" height="128" rx="14"/></clipPath><rect width="${TW}" height="${TH}" rx="14" fill="${D.C.creme2}"/>`;
      o += `<g clip-path="url(#${id}-c${k})">${D.artCase(c, TW)}${closed ? `<rect width="${TW}" height="128" fill="rgba(43,29,20,.55)"/>` : ''}</g>`;
      o += `<path d="M0 128 H${TW}" stroke="${D.C.encre}" stroke-width="2"/>`;
      o += `<text x="14" y="154" font-size="19" font-weight="700" fill="${D.C.encre}" letter-spacing="1">${esc(d.nom.toUpperCase())}</text>`;
      if (d.recolte) {
        const q = recolteDe(v, c, d);
        o += `<text x="14" y="175" font-size="14" font-weight="500" fill="${D.C.encre2}">${RN[d.res]} · le 2ᵉ ouvrier récolte 1 de moins</text>`;
        o += d.recolte.map((n, j) => `<g transform="translate(${150 + j * 26},206)"><circle r="11" fill="${D.SAISON_COL[j]}" stroke="${D.C.encre}" stroke-width="${j === saisonIdx(v) ? 2.6 : 1.2}"/><text y="4.5" text-anchor="middle" font-size="13" font-weight="700" fill="${D.C.encre}">${n || '–'}</text></g>`).join('');
        o += closed ? `<g transform="translate(${TW / 2},64)"><rect x="-52" y="-16" width="104" height="32" rx="16" fill="${D.C.encre}"/><text y="6" text-anchor="middle" font-size="16" font-weight="700" fill="#f4e9d4" letter-spacing="2">FERMÉ</text></g>`
          : `<g transform="translate(12,12)"><rect width="${q ? 104 : 86}" height="30" rx="15" fill="#f4e9d4" stroke="${D.C.encre}" stroke-width="1.5"/><text x="${q ? 52 : 43}" y="20" text-anchor="middle" font-size="16" font-weight="700" fill="${D.C.encre}">${q ? `+${q} ${RN[d.res]}` : 'épuisé'}</text></g>`;
      } else o += `<text x="14" y="175" font-size="14" font-weight="500" fill="${D.C.encre2}">${SOUS[c]}</text>`;
      // étiquette d'action, collée sur l'illustration (jamais sur le titre)
      if (t) o += `<g transform="translate(${TW - 12},92)" filter="url(#${id}-o2)"><rect x="-100" y="0" width="100" height="28" rx="14" fill="${D.C.cuivre}" stroke="${D.C.encre}" stroke-width="1.5"/><text x="-50" y="19" text-anchor="middle" font-size="15" font-weight="700" fill="${D.C.encre}">${d.recolte ? 'Récolter' : ACTION[c]}</text></g>`;
      // places et ouvriers
      const occ = c === 'tournee' ? v.tournee : v.occ[c] ?? [];
      const places = d.recolte ? ['1', '−1'] : c === 'marcheMat' ? ['1'] : c === 'tournee' ? P().map(() => 'j') : ['m', 'm', 'm'];
      const n = Math.max(places.length, occ.length), pas = Math.min(52, (d.recolte ? 120 : TW - 40) / n);
      for (let j = 0; j < n; j++) {
        const cx = 30 + j * pas, cy = 206, pl = places[j] ?? 'm';
        o += `<circle cx="${cx}" cy="${cy}" r="19" fill="${D.C.creme}" stroke="${D.C.encre}" stroke-width="1.8" ${pl === 'm' || pl === 'j' ? 'stroke-dasharray="4 3"' : ''}/>`;
        if (pl === '−1' && occ[j] === undefined) o += `<text x="${cx}" y="${cy + 5}" text-anchor="middle" font-size="13" font-weight="700" fill="${D.C.encre2}">−1</text>`;
        if (occ[j] !== undefined) o += D.ouvrier(id, cx, cy + 4, PCOL[occ[j]], 34, `class="pion" data-p="${occ[j]}"`);
      }
      o += `<rect class="cadre" width="${TW}" height="${TH}" rx="14" fill="none" stroke="${D.C.encre}" stroke-width="2"/></g>`;
    });
    // pistes de prix
    o += `<text x="${M + 6}" y="${yp + 14}" font-size="12" font-weight="700" fill="${D.C.encre2}" letter-spacing="2">PRIX AU MARCHÉ AUX BIÈRES</text>`;
    STYLES.forEach((st, r) => {
      const col2 = portrait ? 0 : Math.floor(r / 2), row = portrait ? r : r % 2;
      const x0 = M + 6 + col2 * ((W - 2 * M) / 2), y = yp + 26 + row * 40, base = RECETTES[st].prix, cur = v.prix[st];
      o += `<rect x="${x0}" y="${y}" width="96" height="30" rx="15" fill="${D.STYLE_COL[st]}" stroke="${D.C.encre}" stroke-width="1.5"/><text x="${x0 + 48}" y="${y + 21}" text-anchor="middle" font-size="14" font-weight="700" fill="${st === 'stout' ? '#f6eadb' : D.C.encre}" letter-spacing="1">${SN[st].toUpperCase().replace('BIÈRE DE ', '')}</text>`;
      for (let n2 = 1; n2 <= 7; n2++) {
        const cx = x0 + 106 + (n2 - 1) * 50;
        o += `<rect x="${cx}" y="${y}" width="44" height="30" rx="7" fill="${n2 === base ? '#f9edd2' : D.C.creme2}" stroke="${D.C.encre}" stroke-width="${n2 === base ? 2.4 : 1.2}"/><text x="${cx + 22}" y="${y + 20}" text-anchor="middle" font-size="14" font-weight="700" fill="${D.C.encre2}">${n2}</text>`;
        if (n2 === cur) o += D.capsule(cx + 22, y + 15, D.STYLE_COL[st], 12);
      }
      const px = prixMarche(v, st);
      o += `<text x="${x0 + 106 + 7 * 50 + 6}" y="${y + 22}" font-size="18" font-weight="700" fill="${D.C.encre}">${px} €${v.demande.includes(st) ? ' ★' : ''}</text>`;
    });
    el.innerHTML = o + '</g></svg>';
    $('#modebox').innerHTML = renderModeBox();
  }

  // Boîte de choix pour la case en cours (achats, ventes, équipement)
  function renderModeBox() {
    const p = my();
    if (!p || !ui.mode || ui.mode === 'tournee') return '';
    if (ui.mode === 'marcheMat') {
      const sel = ui.sel ?? (ui.sel = { malt: 0, houb: 0 });
      const n = total(sel), cout = RES.reduce((s, r) => s + sel[r] * ACHAT[r], 0);
      return `<div class="modebox"><h4>Marché aux matières</h4><div class="offer3">${RES.map((r) => `<span class="rl">${chip(r)}${RN[r]} · ${ACHAT[r]} €</span>${stepper('sel', r, sel[r], n < ACHAT_MAX && cout + ACHAT[r] <= p.argent ? sel[r] + 1 : sel[r])}`).join('')}</div>
        <div class="mrow"><button class="btn primary" data-act="poser" data-case="marcheMat" ${n ? '' : 'disabled'}>Acheter pour ${cout} €</button><button class="btn ghost" data-act="cancel">Annuler</button></div></div>`;
    }
    if (ui.mode === 'marcheBieres') {
      const sel = ui.sel ?? (ui.sel = Object.fromEntries(STYLES.map((s) => [s, 0])));
      const prix = { ...view.prix };
      let gain = 0;
      for (const st of STYLES) for (let k = 0; k < sel[st]; k++) { gain += prix[st] + (view.demande.includes(st) ? 2 : 0) + view.prixBonus; prix[st] = Math.max(1, prix[st] - 1); }
      return `<div class="modebox"><h4>Marché aux bières</h4><div class="offer3">${STYLES.filter((st) => p.stock[st] > 0).map((st) => `<span class="rl">${schip(st)}${SN[st]} · ${prixMarche(view, st)} €${view.demande.includes(st) ? ' <span class="dem">demande</span>' : ''}</span>${stepper('sel', st, sel[st], p.stock[st])}`).join('')}</div>
        <div class="mrow"><button class="btn primary" data-act="poser" data-case="marcheBieres" ${total(sel) ? '' : 'disabled'}>Vendre pour ${gain} €</button><button class="btn ghost" data-act="cancel">Annuler</button></div></div>`;
    }
    if (ui.mode === 'chantier') {
      const t = poseSur('chantier');
      return `<div class="modebox"><h4>Chantier</h4><div class="build">${Object.entries(AMELIORATIONS).map(([u, d]) => {
        const owned = u === 'ferm' ? p.nferm >= FERMENTEURS_MAX : u === 'embauche' ? p.ouv >= OUVRIERS_MAX : p.upg.includes(u);
        return `<div class="bname ${owned ? 'owned' : ''}"><b>${esc(d.nom)}${u === 'ferm' ? ` (${p.nferm}/${FERMENTEURS_MAX})` : ''}</b><small>${esc(d.txt)}</small></div><button class="btn" data-act="poser" data-case="chantier" data-u="${u}" ${t?.targets.includes(u) ? '' : 'disabled'}>${owned ? 'Acquis' : d.cout + ' €'}</button>`;
      }).join('')}</div><div class="mrow"><button class="btn ghost" data-act="cancel">Annuler</button></div></div>`;
    }
    return '';
  }

  function renderFile() {
    const v = view;
    const t = ui.mode === 'tournee' ? poseSur('tournee') : null;
    $('#file').innerHTML = v.file.map((cl, k) => {
      const can = t?.clients.find((x) => x.id === cl.id);
      const val = mine() && cl.style ? valeurLivraison(v, me(), cl, cl.style) : null;
      const btns = can ? (cl.style ? `<button class="btn primary mini2" data-act="poser" data-case="tournee" data-client="${cl.id}" data-style="${cl.style}">Livrer</button>`
        : can.styles.map((st) => `<button class="btn primary mini2" data-act="poser" data-case="tournee" data-client="${cl.id}" data-style="${st}">${SN[st]}</button>`).join('')) : '';
      const enSaison = cl.kind === 'fest' && cl.saison === saisonIdx(v);
      const prix = cl.style ? `${cl.n * (RECETTES[cl.style].prix + cl.bonus + v.prixBonus)} €` : `base${cl.bonus ? ' +' + cl.bonus : ''}`;
      return `<div class="ccard ${can ? 'can' : ''}" style="--kc:${D.KIND_COL[cl.kind]};--kf:${D.KIND_FOND[cl.kind]}">
        <div class="bandeau"><span>${KIND[cl.kind]}</span>${cl.kind === 'fest' ? `<i>${SAISON_NOM[SAISONS[cl.saison]]}${enSaison ? ' · maintenant' : ''}</i>` : ''}</div>
        <div class="art">${D.pictoClient(cl.kind)}</div>
        <b>${esc(cl.nom)}</b>
        <div class="veut">${Array.from({ length: cl.n }, () => `<span class="u" style="--sc:${cl.style ? D.STYLE_COL[cl.style] : D.C.pierre}"></span>`).join('')} ${cl.style ? SN[cl.style] : 'tous styles'}</div>
        <div class="pied"><span class="piece">${prix}</span>${D.etoile(val ? val.rep : cl.rep + (enSaison ? 2 : 0))}</div>
        ${k === 0 ? '<div class="old">part en fin de saison</div>' : ''}${btns ? `<div class="mrow">${btns}</div>` : ''}</div>`;
    }).join('') + `<div class="ccard deck"><b>${v.deck}</b><small>dans la pioche</small>${ui.mode === 'tournee' ? '<button class="btn ghost mini2" data-act="cancel">Annuler</button>' : ''}</div>`;
  }


  /* ---------- fenêtres ---------- */

  function itemRows(give, get, maxGive, maxGet) {
    const keys = ITEMS.filter((k) => maxGive(k) > 0 || maxGet(k) > 0 || give[k] || get[k]);
    return keys.map((k) => `<span class="rl">${ichip(k)}${nomItem(k)}</span>${stepper('cgive', k, give[k], maxGive(k))}${stepper('cget', k, get[k], maxGet(k))}`).join('');
  }

  function currentModal() {
    const v = view, p = my();
    if (v.phase === 'over') {
      if (ui.winClosed) return null;
      const w = v.winner, P0 = P();
      const order = P0.map((_, i) => i).sort((a, b) => P0[b].score.total - P0[a].score.total || P0[b].argent - P0[a].argent);
      return { key: 'win', large: true, html: `<h2>${you(w) ? 'Trois ans ont passé : tu l’emportes !' : esc(P0[w].name) + ' l’emporte'}</h2>
        <div class="fms">${order.map((i) => feuilleDeMarque(i, true)).join('')}</div>
        <div class="mrow">${opts.rejouer ? '<button class="btn primary" data-again>Rejouer</button>' : '<button class="btn primary" data-home>Retour à l’accueil</button>'}<button class="btn ghost" data-close>Voir le plateau</button></div>` };
    }
    if (!p) return null;
    const ev = legal('evenement');
    if (ev) return { key: `evt-${v.saison}`, html: `<h2>${EVT[ev.kind].nom}</h2><p>${EVT[ev.kind].txt} Lequel ?</p>
      <div class="mrow">${ev.targets.map((i) => `<button class="btn" data-ferm="${i}">${SN[p.ferms[i].st]} · ${plural(p.ferms[i].u, 'unité')}, prête dans ${p.ferms[i].left}</button>`).join('')}</div>` };
    const cc = legal('concours');
    if (cc) return { key: `concours-${v.saison}`, html: `<h2>${EVT[cc.kind].nom}</h2><p>Présente une unité de ton stock (elle est consommée). Score : réputation du style, +1 s'il est en demande.</p>
      <div class="mrow">${cc.styles.map((st) => `<button class="btn" data-style="${st}">${SN[st]} · ${RECETTES[st].rep + (v.demande.includes(st) ? 1 : 0)}</button>`).join('')}</div>` };
    const t = v.trade;
    if (t && t.to.includes(me()) && !t.resp[me()]) {
      const from = P()[t.from];
      if (ui.counter) {
        const c = ui.counter, okC = total(c.give) && total(c.get) && ITEMS.every((k) => avoir(p, k) >= c.get[k]);
        return { key: `counter-${t.id}`, html: `<h2>Contre-proposition</h2><p>Ce que ${esc(from.name)} te donnerait, et ce que tu lui donnes.</p>
          <div class="offer"><span></span><span class="oh">Tu reçois</span><span class="oh">Tu donnes</span>${itemRows(c.give, c.get, (k) => avoir(from, k), (k) => avoir(p, k))}</div>
          <div class="mrow"><button class="btn primary" data-cok ${okC ? '' : 'disabled'}>Envoyer</button><button class="btn ghost" data-cback>Retour</button></div>` };
      }
      return { key: `offer-${t.id}`, html: `<h2>Offre de ${esc(from.name)}</h2><p>${esc(from.name)} te propose <b>${fmt(t.give)}</b> contre <b>${fmt(t.get)}</b>.</p>
        <div class="mrow"><button class="btn primary" data-y ${legal('respondTrade')?.canAccept ? '' : 'disabled'}>Accepter</button><button class="btn" data-n>Refuser</button><button class="btn ghost" data-ctr>Contre-proposer</button></div>` };
    }
    if (t && t.from === me()) {
      const rows = t.to.map((i) => {
        const r = t.resp[i];
        const txt = !r ? 'Réfléchit…' : r.s === 'refuse' ? 'Refuse.' : r.s === 'accept' ? 'Accepte.' : `Accepte si tu donnes ${fmt(r.give)} contre ${fmt(r.get)}.`;
        const can = r && r.s !== 'refuse' && ITEMS.every((k) => avoir(p, k) >= (r.s === 'counter' ? r.give[k] : t.give[k]));
        return `<div class="resp">${sw(i)}<div><b>${esc(P()[i].name)}</b><small>${txt}</small></div>${can ? `<button class="btn ${r.s === 'counter' ? '' : 'primary'}" data-k="${i}">${r.s === 'counter' ? 'Accepter' : 'Conclure'}</button>` : ''}</div>`;
      });
      const any = Object.values(t.resp).some((r) => r.s !== 'refuse');
      return { key: `responses-${t.id}`, html: `<h2>Réponses</h2><p>Tu proposes ${fmt(t.give)} contre ${fmt(t.get)}.</p><div>${rows.join('')}</div>
        <button class="btn ghost" data-k="-1">${any ? 'Annuler' : Object.keys(t.resp).length === t.to.length ? 'Fermer' : 'Retirer l’offre'}</button>` };
    }
    return null;
  }

  let modalNow = null;
  function renderModal() {
    const m = currentModal(), box = $('#modalBox');
    if (!m) { modalNow = null; ui.modalKey = null; $('#modal').hidden = true; return; }
    const fresh = m.key !== ui.modalKey;
    ui.modalKey = m.key; modalNow = m;
    box.classList.toggle('large', !!m.large);
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
    if (ds.act === 'cgive' || ds.act === 'cget') { const c = ui.counter[ds.act === 'cgive' ? 'give' : 'get']; c[ds.r] = Math.max(0, c[ds.r] + +ds.d); return render(); }
    if ('cback' in ds) { ui.counter = null; return render(); }
    if ('cok' in ds) { const counter = ui.counter; ui.counter = null; return act({ type: 'respondTrade', counter }); }
    if (ds.k !== undefined) { const k = +ds.k; return k < 0 ? act({ type: 'cancelTrade' }) : act({ type: 'concludeTrade', with: k }); }
  }

  /* ---------- comptoir ---------- */

  function hintText() {
    const v = view;
    if (ui.error) return { txt: ui.error, col: 'var(--copper)' };
    if (v.phase === 'over') return { txt: `${you(v.winner) ? 'Tu gagnes' : esc(P()[v.winner].name) + ' gagne'} la partie.`, col: PCOL[v.winner] };
    if (v.pending) {
      const who = Object.keys(v.pending.need).map(Number);
      if (mine() && who.includes(me())) return { txt: `${EVT[v.pending.kind].nom} : à toi de décider.`, col: PCOL[me()] };
      return { txt: `${EVT[v.pending.kind].nom} : ${who.map((i) => esc(P()[i].name)).join(', ')} ${who.length > 1 ? 'décident' : 'décide'}…`, col: 'var(--muted)' };
    }
    if (v.trade && v.trade.from !== me() && !(v.trade.to.includes(me()) && !v.trade.resp[me()])) return { txt: `${esc(P()[v.trade.from].name)} attend des réponses à son offre…`, col: PCOL[v.trade.from] };
    if (free()) {
      if (ui.mode === 'tournee') return { txt: 'Choisis le client à livrer dans la file.', col: PCOL[me()] };
      if (v.place) return { txt: 'Ouvrier posé. Brasse si tu peux, puis passe la main.', col: PCOL[me()] };
      if (!(v.restants[me()] > 0)) return { txt: 'Plus d’ouvrier cette saison : passe la main.', col: PCOL[me()] };
      if (!poses().length) return { txt: 'Aucune case jouable : tu passes, et l’ouvrier est perdu.', col: 'var(--copper)' };
      return { txt: `À toi : ${plural(v.restants[me()], 'ouvrier')} à poser. Brasse si tu peux, pose, puis passe la main.`, col: PCOL[me()] };
    }
    return { txt: `${esc(P()[v.cur].name)} pose un ouvrier…`, col: PCOL[v.cur] };
  }

  function renderPlayers() {
    const v = view;
    $('#players').innerHTML = P().map((p, i) => `<div class="pl ${v.cur === i && v.phase !== 'over' && !v.pending ? 'cur' : ''}">${sw(i)}
      <div class="pn"><b>${esc(p.name)}${you(i) && p.name !== 'Toi' ? ' (toi)' : ''}${v.first === i && v.phase === 'main' ? ' <span class="bdg" title="Premier joueur de la saison">1er</span>' : ''}</b><small>${p.argent} € · ${plural(unites(p), 'unité')} · ${p.ferms.length}/${p.nferm} ferm. · ${v.restants[i] ?? 0}/${p.ouv} ouvr.${p.status ? ' · ' + esc(p.status) : ''}</small></div>
      <div class="vp" title="Réputation">${p.rep}<small>rép.</small></div></div>`).join('');
  }

  function renderTurn() {
    const v = view;
    const end = free() && legal('endTurn');
    $('#turn').innerHTML = `<div class="turninfo"><b>${v.phase === 'main' ? nomSaison(v.saison) : 'Partie terminée'}</b><small>${v.phase === 'main' ? `Premier joueur : ${esc(P()[v.first].name)}` : ''}</small></div>
      <button class="btn primary" data-act="end" ${end ? '' : 'disabled'}>${end?.passe ? 'Passer' : 'Fin du tour'}</button>
      <div class="rythme" role="group" aria-label="Rythme de l'ordinateur"><small>Rythme</small>${Object.entries(RYTHMES).map(([k, r]) => `<button class="btn mini3 ${rythme() === k ? 'on' : ''}" data-act="rythme" data-r="${k}" aria-pressed="${rythme() === k}">${r.nom}</button>`).join('')}</div>`;
  }

  function renderBrasserie() {
    const p = my();
    if (!p) { $('#brasserie').innerHTML = ''; $('#feuille').innerHTML = ''; return; }
    const libres = view.restants[me()] ?? 0;
    const cuves = Array.from({ length: FERMENTEURS_MAX }, (_, i) => {
      if (i >= p.nferm) return `<div title="Fermenteur à acheter au Chantier">${D.cuve(0, '#ccc', 'à acheter', '')}</div>`.replace('class="cuve"', 'class="cuve vide"');
      const f = p.ferms[i];
      if (!f) return `<div>${D.cuve(0, '#ccc', 'libre', '')}</div>`;
      return `<div title="${SN[f.st]} : ${plural(f.u, 'unité')}, prête dans ${plural(f.left, 'saison')}">${D.cuve(Math.min(1, 0.35 + f.u * 0.2), D.STYLE_COL[f.st], SN[f.st].replace('Bière de garde', 'Garde'), `${f.u} u · ${f.left} s.`)}</div>`;
    }).join('');
    const futs = STYLES.flatMap((st) => Array(p.stock[st]).fill(st));
    $('#brasserie').innerHTML = `<div class="bandeau" style="--pc:${PCOL[me()]}"><span>Ta brasserie</span><span>${p.rep} réputation</span></div>
      <div class="zone"><div class="zt">Réserve</div><div class="reserve">
        <div title="Malt">${D.sacSvg()}<span>${p.res.malt} Malt</span></div>
        <div title="Houblon">${D.coneSvg()}<span>${p.res.houb} Houblon</span></div>
        <div title="Argent">${D.piecesSvg()}<span>${p.argent} €</span></div>
        <div title="Ouvriers"><span class="ouvs">${Array.from({ length: p.ouv }, (_, k) => D.ouvrierSvg(PCOL[me()]).replace('class="ouvsvg"', `class="ouvsvg ${k < libres ? '' : 'pose'}"`)).join('')}</span><span>${libres}/${p.ouv} ouvr.</span></div>
      </div></div>
      <div class="zone"><div class="zt">Fermenteurs · cuve de ${cuveUnites(p)} unités</div><div class="cuves">${cuves}</div></div>
      <div class="zone"><div class="zt">Cave · ${unites(p)}/${STOCK_MAX}${unites(p) > STOCK_MAX ? ' · le surplus sera vendu d’office' : ''}</div>
        <div class="etagere">${futs.length ? futs.map((st) => `<span title="${SN[st]}">${D.futSvg(D.STYLE_COL[st])}</span>`).join('') : '<span class="muted">Rien en cave.</span>'}</div>
        <div class="muted">${STYLES.filter((st) => p.stock[st]).map((st) => `${p.stock[st]} ${SN[st]}`).join(' · ')}</div></div>
      <div class="zone"><div class="zt">Équipement</div><div class="eqs">${p.upg.length || p.nferm > 2 ? [...p.upg.map((u) => AMELIORATIONS[u].nom), ...(p.nferm > 2 ? [`${p.nferm} fermenteurs`] : [])].map((n) => `<span>${esc(n)}</span>`).join('') : '<span class="muted">Le strict nécessaire.</span>'}</div>
</div>`;
    $('#feuille').innerHTML = feuilleDeMarque(me(), false);
  }

  // Feuille de marque (une par joueur et par partie) : styles cochés, puis décompte. En cours de partie, le décompte
  // est une projection « si la partie s'arrêtait maintenant » ; à la fin, c'est le résultat.
  function feuilleDeMarque(i, fin) {
    const p = P()[i], sc = p.score, arg = Math.floor(p.argent / ARGENT_PAR_POINT);
    return `<div class="fm ${fin && view.winner === i ? 'gagne' : ''}">
      <div class="fmh"><b>${esc(p.name)}</b><span>${fin ? (view.winner === i ? 'l’emporte' : 'feuille de marque') : 'Ta feuille de marque'}</span></div>
      <div class="fmt2">Styles brassés <small>+1 Réputation au premier brassin</small></div>
      <div class="fmstyles">${STYLES.map((st) => `<span class="${p.styles.includes(st) ? 'ok' : ''}"><i class="box" style="--sc:${D.STYLE_COL[st]};--ck:${st === 'stout' || st === 'garde' ? '#fff' : '#2b1d14'}">${p.styles.includes(st) ? '✓' : ''}</i>${SN[st]}</span>`).join('')}</div>
      <div class="fmt2">${fin ? 'Décompte final' : 'Décompte si la partie s’arrêtait maintenant'}</div>
      <div class="fmrow"><span>Réputation <small>sur la piste</small></span><b>${sc.rep}</b></div>
      <div class="fmrow"><span>Diversité <small>3 styles +2 · les 4 +5</small></span><b>${sc.diversite}</b></div>
      <div class="fmrow"><span>Argent <small>${p.argent} ÷ ${ARGENT_PAR_POINT}</small></span><b>${arg}</b></div>
      <div class="fmrow tot"><span>Total</span><b>${sc.total}</b></div></div>`;
  }


  function renderBrasser() {
    const v = view, p = my();
    if (!p) { $('#brasser').innerHTML = ''; return; }
    const b = free() && legal('brasser'), sa = free() && legal('salle');
    const plein = p.ferms.length >= p.nferm;
    $('#brasser').innerHTML = STYLES.map((st) => {
      const r = RECETTES[st], can = b && b.styles.includes(st);
      const why = plein ? 'Fermenteurs pleins' : r.exige && !p.upg.includes(r.exige) && !(v.invite && st === 'stout') ? AMELIORATIONS[r.exige].nom + ' requise' : '';
      return `<div class="bname"><b>${schip(st)} ${SN[st]}${v.demande.includes(st) ? ' <span class="dem">en demande</span>' : ''}</b><small>${plural(r.ferm, 'saison')} · base ${r.prix} € · ${r.rep} rép.${why && free() ? ' · ' + why : ''}</small>${chips(r)}</div>
        <button class="btn" data-act="brasser" data-style="${st}" ${can ? '' : 'disabled'}>Brasser</button>`;
    }).join('') + (p.upg.includes('salle') ? `<div class="bname"><b>Salle de dégustation</b><small>1 unité par saison au prix de base +1${p.salle ? ' · déjà servie' : ''}</small></div><div class="mrow">${STYLES.filter((st) => p.stock[st] > 0).map((st) => `<button class="btn mini2" data-act="salle" data-style="${st}" ${sa && sa.styles.includes(st) ? '' : 'disabled'}>${SN[st]} ${RECETTES[st].prix + 1}€</button>`).join('') || '<span class="empty">Rien en stock.</span>'}</div>` : '');
  }

  function renderTrade() {
    const p = my();
    if (!p) { $('#trade').innerHTML = ''; return; }
    const o = ui.offer;
    const okOffer = free() && legal('proposeTrade') && total(o.give) && total(o.get) && ITEMS.every((k) => avoir(p, k) >= o.give[k]) && !ITEMS.some((k) => o.give[k] && o.get[k]);
    const keys = ITEMS.filter((k) => avoir(p, k) > 0 || o.get[k] || o.give[k] || RES.includes(k) || k === 'argent');
    $('#trade').innerHTML = `<div class="offer"><span></span><span class="oh">Tu donnes</span><span class="oh">Tu demandes</span>
      ${keys.map((k) => `<span class="rl">${ichip(k)}${nomItem(k)}</span>${stepper('og', k, o.give[k], avoir(p, k))}${stepper('ow', k, o.get[k], 20)}`).join('')}</div>
      <button class="btn" data-act="propose" ${okOffer ? '' : 'disabled'}>Proposer l'échange</button>
      <label class="chk"><input type="checkbox" id="offersOn" ${p.offersOn ? 'checked' : ''}>Recevoir les offres des autres brasseries</label>`;
  }

  function renderHint() {
    const h = hintText();
    const pas = opts.pasApas ? '<button class="btn primary" data-act="suivant">Action suivante</button>' : '';
    $('#hint').innerHTML = `<span class="dot" style="background:${opts.pasApas ? PCOL[view.cur] : h.col}"></span><span class="grow">${opts.pasApas ? `${esc(P()[view.cur]?.name ?? '')} attend ton signal pour jouer.` : h.txt}</span>${pas}${ui.mode ? '<button class="btn ghost" data-act="cancel">Annuler</button>' : ''}`;
  }
  function renderLog() {
    const lines = view.log.flatMap((e) => logLines(e, view)).reverse().slice(0, 50);
    $('#log').innerHTML = lines.map((l) => `<li><i style="background:${l.p === null || l.p === undefined ? 'var(--muted)' : PCOL[l.p]}"></i><span>${esc(l.txt)}</span></li>`).join('');
  }

  let offreVue = null;
  function suivreOffre() {
    const t = view.trade, waitingMe = t && mine() && t.to.includes(me()) && !t.resp[me()];
    if (offreVue && (!t || t.id !== offreVue.id) && !ui.error) {
      const done = view.log.some((e) => e.k === 'tradeDone' && e.p === offreVue.from && e.with === me());
      if (!done) showError(`L'offre de ${P()[offreVue.from].name} n'est plus disponible : conclue avec quelqu'un d'autre, ou retirée.`);
    }
    offreVue = waitingMe ? { id: t.id, from: t.from } : null;
  }

  /* ---------- mise en scène des gestes des autres ---------- */

  // Chaque nouvelle entrée du journal jouée par un autre devient une bulle, montrée l'une après l'autre,
  // avec la case concernée mise en lumière (ouvrier qui tombe) ou les dés qui roulent.
  const scene = { seen: null, queue: [], cur: null, timer: null, saison: null };
  const SCENE_KINDS = new Set(['saison', 'ordre', 'poser', 'brasser', 'salle', 'passe', 'tradeOffer', 'tradeDone', 'perte', 'presente', 'concours', 'douanes', 'clientParti', 'vendre', 'salleRep', 'fin']);
  function suivreJournal() {
    const last = view.log.at(-1)?.i ?? -1;
    if (scene.seen === null) { scene.seen = last; scene.saison = view.saison; return; }
    for (const e of view.log) {
      if (e.i <= scene.seen) continue;
      if (!SCENE_KINDS.has(e.k) || (e.p !== undefined && you(e.p) && e.k !== 'fin')) continue;
      const lines = logLines(e, view);
      if (!lines.length) continue;
      scene.queue.push({ txt: lines.map((l) => l.txt).join(' '), p: e.p ?? null, case: e.k === 'poser' ? e.case : null, saison: e.k === 'saison' });
    }
    scene.seen = Math.max(scene.seen, last);
    // Nouvelle saison : bilan de la saison écoulée
    if (view.saison !== scene.saison) {
      if (view.saison > 0 && scene.saison !== null) ui.bilan = { saison: view.saison - 1 };
      scene.saison = view.saison;
    }
    if (!scene.cur) jouerBulle();
  }
  function jouerBulle() {
    clearTimeout(scene.timer);
    scene.cur = scene.queue.shift() ?? null;
    afficherScene();
    if (!scene.cur) return;
    const presse = scene.queue.length > 3 ? 0.5 : 1;
    scene.timer = setTimeout(jouerBulle, DUREE_BULLE * facteur() * presse * (scene.cur.saison ? 1.6 : 1));
  }
  function afficherScene() {
    const el = $('#scene'), b = scene.cur;
    if (!el) return;
    el.innerHTML = b ? `<div class="bulle" style="--pc:${b.p === null ? 'var(--copper)' : PCOL[b.p]}"><span class="dot"></span><span>${esc(b.txt)}</span>${scene.queue.length ? `<small>+${scene.queue.length}</small>` : ''}</div>` : '';
    el.classList.toggle('on', !!b);
    if (!b) return;
    if (b.case) {
      const spot = document.querySelector(`#plateau [data-case="${b.case}"]`);
      spot?.classList.add('flash');
      const pions = spot ? [...spot.querySelectorAll(`.pion[data-p="${b.p}"]`)] : [];
      pions.at(-1)?.classList.add('drop');
    }
    if (b.saison) document.querySelectorAll('#saison .desvg').forEach((d) => d.classList.add('roll'));
  }

  function renderBilan() {
    const el = $('#bilan');
    if (!el) return;
    const b = ui.bilan;
    if (!b || view.phase === 'over') { el.innerHTML = ''; el.hidden = true; return; }
    const parJoueur = P().map((_, i) => view.log.filter((e) => e.saison === b.saison && e.p === i && ['poser', 'brasser', 'salle', 'tradeDone', 'passe'].includes(e.k)).flatMap((e) => logLines(e, view)).map((l) => l.txt));
    el.hidden = false;
    el.innerHTML = `<div class="bilan"><div class="bh"><b>Bilan : ${nomSaison(b.saison)}</b><button class="btn ghost mini3" data-act="bilanFermer" aria-label="Fermer le bilan">Fermer</button></div>
      ${P().map((p, i) => `<div class="bl">${sw(i)}<div><b>${esc(p.name)}</b>${parJoueur[i].length ? `<ul>${parJoueur[i].map((t) => `<li>${esc(t)}</li>`).join('')}</ul>` : '<small>Rien de noté.</small>'}</div></div>`).join('')}</div>`;
  }

  function render() {
    if (!view) return;
    suivreJournal();
    suivreOffre();
    L = mine() ? legalActions(view, me()) : [];
    if (view.trade?.id !== ui.counterFor) { ui.counter = null; ui.counterFor = view.trade?.id; }
    if (ui.mode && !poseSur(ui.mode)) { ui.mode = null; ui.sel = null; }
    renderSaison(); renderCases(); renderFile();
    renderPlayers(); renderTurn(); renderBrasserie(); renderBrasser(); renderTrade();
    renderHint(); renderLog(); renderBilan(); renderModal();
    afficherScene();
  }

  /* ---------- événements ---------- */

  const ACTS = {
    end: () => act({ type: 'endTurn' }),
    cancel: () => { ui.mode = null; ui.sel = null; render(); },
    mode: (b) => { ui.mode = b.dataset.mode; ui.sel = null; render(); },
    sel: (b) => { ui.sel[b.dataset.r] = Math.max(0, ui.sel[b.dataset.r] + +b.dataset.d); render(); },
    poser: (b) => {
      const c = b.dataset.case;
      if (c === 'marcheMat') return act({ type: 'poser', case: c, achats: { ...ui.sel } });
      if (c === 'marcheBieres') return act({ type: 'poser', case: c, ventes: { ...ui.sel } });
      if (c === 'chantier') return act({ type: 'poser', case: c, u: b.dataset.u });
      if (c === 'tournee') { const id = b.dataset.client; return act({ type: 'poser', case: c, client: /^\d+$/.test(id) ? +id : id, style: b.dataset.style }); }
      return act({ type: 'poser', case: c });
    },
    brasser: (b) => act({ type: 'brasser', style: b.dataset.style }),
    salle: (b) => act({ type: 'salle', style: b.dataset.style }),
    og: (b) => { const r = b.dataset.r; ui.offer.give[r] = Math.max(0, ui.offer.give[r] + +b.dataset.d); render(); },
    ow: (b) => { const r = b.dataset.r; ui.offer.get[r] = Math.max(0, ui.offer.get[r] + +b.dataset.d); render(); },
    propose: async () => {
      const r = await act({ type: 'proposeTrade', give: { ...ui.offer.give }, get: { ...ui.offer.get } });
      if (r?.ok) ui.offer = { give: ZI(), get: ZI() };
    },
    new: () => onNewGame?.(),
    accueil: () => onHome?.(),
    rythme: (b) => { choisirRythme(b.dataset.r); render(); },
    suivant: () => onStep?.(),
    bilanFermer: () => { ui.bilan = null; render(); },
  };
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-act]');
    if (b && !b.disabled && ACTS[b.dataset.act] && !b.closest('#modalBox')) ACTS[b.dataset.act](b);
  });
  document.addEventListener('change', (e) => { if (e.target.id === 'offersOn') act({ type: 'setOffers', on: e.target.checked }); });
  $('#modalBox').addEventListener('click', onModalClick);
  // Plateau : une case jouable se clique (récolte directe, sinon choix dans la boîte ou la file)
  function choisirCase(c) {
    if (!poseSur(c)) return;
    if (CASES[c].recolte) return act({ type: 'poser', case: c });
    ui.mode = ui.mode === c ? null : c; ui.sel = null; render();
    if (c === 'tournee') document.querySelector('#file')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    else document.querySelector('#modebox')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
  $('#plateau').addEventListener('click', (e) => { const t = e.target.closest('[data-case]'); if (t) choisirCase(t.dataset.case); });
  $('#plateau').addEventListener('keydown', (e) => { if (e.key !== 'Enter' && e.key !== ' ') return; const t = e.target.closest('[data-case]'); if (t) { e.preventDefault(); choisirCase(t.dataset.case); } });
  let largeur = 0;
  addEventListener('resize', () => { const w = $('#plateau').clientWidth; if (view && (w < 640) !== (largeur < 640)) render(); largeur = w; });

  return {
    update(v, o = {}) { view = v; opts = o; render(); },
    reset() {
      ui.mode = null; ui.sel = null; ui.offer = { give: ZI(), get: ZI() }; ui.counter = null; ui.modalKey = null; ui.winClosed = false; ui.bilan = null; view = null; $('#modal').hidden = true;
      clearTimeout(scene.timer); scene.seen = null; scene.queue = []; scene.cur = null; scene.saison = null;
    },
  };
}
