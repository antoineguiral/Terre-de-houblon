// Serveur de jeu : HTTP (santé) + WebSocket (parties). Lancement : node serveur.js
//
// Messages client → serveur (JSON, `ref` facultatif, renvoyé dans la réponse) :
//   { t: 'hello', jeton }                          reprendre sa place
//   { t: 'creer', nom, humains, mode, delai }      créer une partie (mode : direct | differe, délai en secondes)
//   { t: 'rejoindre', code, nom }                  prendre une place libre
//   { t: 'demarrer' }                              lancer la partie (créateur)
//   { t: 'action', action }                        jouer (action du moteur)
//   { t: 'mesparties', jetons: [...] }             résumé de ses parties
//   { t: 'quitter' }                               revenir à l'accueil
// Serveur → client : { t: 'place', jeton, code, siege }, { t: 'partie', ... }, { t: 'mesparties', parties },
//   { t: 'refus', error, ref }, { t: 'ok', ref }

import http from 'node:http';
import { WebSocketServer } from 'ws';
import { CONFIG } from './config.js';
import { openBase } from './base.js';
import { Salle } from './salle.js';
import { creerNotifier, envoyeurBrevo } from './notifications.js';

export function demarrerServeur(opts = {}) {
  const config = { ...CONFIG, ...opts.config };
  const log = opts.log ?? ((m) => console.log(new Date().toISOString(), m));
  const base = opts.base ?? openBase(config.db);
  const timers = { now: opts.now ?? Date.now, setTimeout: opts.setTimeout ?? setTimeout, clearTimeout: opts.clearTimeout ?? clearTimeout };
  const envoyer = opts.envoyer !== undefined ? opts.envoyer : config.brevoKey ? envoyeurBrevo({ apiKey: config.brevoKey, from: config.mailFrom }) : null;
  const notifier = creerNotifier({ publicUrl: config.publicUrl, envoyer, base, log, ...timers });
  const deps = {
    base,
    ...timers,
    onTour: (salle, siege) => { notifier.onTour(salle, siege); opts.onTour?.(salle, siege); },
    onFin: (salle) => notifier.onFin(salle),
    log,
    config,
  };
  const salles = new Map();

  function salle(code) {
    code = String(code ?? '').toUpperCase().trim();
    if (salles.has(code)) return salles.get(code);
    const row = base.partie(code);
    if (!row) return null;
    const s = new Salle({ code: row.code, statut: row.statut, meta: row.meta, etat: row.etat }, deps);
    salles.set(code, s);
    return s;
  }
  // Reprise des parties en cours après un redémarrage : IA et délais repartent
  for (const row of base.partiesActives()) {
    const s = salle(row.code);
    s.planifierIa();
    s.planifierEcheance();
  }
  log(`${salles.size} partie(s) en cours rechargée(s)`);

  const allowed = (origin) => !!origin && config.origins.includes(origin);

  // Désinscription depuis le lien d'un e-mail (GET) ou le bouton de la messagerie (POST, List-Unsubscribe-Post)
  function desabonner(req, res, url) {
    const p = base.place(url.searchParams.get('jeton') || '');
    const s = p && salle(p.code);
    if (s && s.meta.sieges[p.siege]?.email) s.definirEmail(p.siege, '');
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.end(`<!doctype html><html lang="fr"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Terres de Houblon</title>
<body style="margin:0;background:#211915;color:#f2e6d0;font-family:system-ui,sans-serif;padding:40px 16px"><div style="max-width:480px;margin:0 auto">
<h1 style="font-family:Georgia,serif;color:#d38b46;font-weight:400">Terres de Houblon</h1>
<p>${s ? `C'est noté : tu ne recevras plus de messages pour la partie ${s.code}.` : 'Ce lien ne correspond à aucune partie.'}</p>
<p><a style="color:#d38b46" href="${config.publicUrl}">Revenir au jeu</a></p></div></body></html>`);
  }

  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://local');
    if (url.pathname === '/desabonner' && (req.method === 'GET' || req.method === 'POST')) return desabonner(req, res, url);
    const origin = req.headers.origin;
    if (allowed(origin)) { res.setHeader('Access-Control-Allow-Origin', origin); res.setHeader('Vary', 'Origin'); }
    if (req.method === 'GET' && req.url === '/sante') {
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ ok: true, parties: [...salles.values()].filter((s) => s.statut !== 'fini').length, connexions: wss.clients.size }));
      return;
    }
    res.statusCode = 404;
    res.end('Terres de Houblon : rien ici.\n');
  });

  const wss = new WebSocketServer({
    server,
    maxPayload: 16 * 1024,
    verifyClient: ({ origin }, cb) => (allowed(origin) ? cb(true) : (log(`origine refusée : ${origin}`), cb(false, 403, 'Origine non autorisée'))),
  });

  const creations = new Map(); // ip → horodatages des créations récentes

  wss.on('connection', (ws, req) => {
    const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
    const client = {
      ws, siege: null, salle: null,
      send: (obj) => { if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(obj)); },
    };
    let bucket = config.maxMessagesPerSecond, last = Date.now();
    ws.alive = true;
    ws.on('pong', () => { ws.alive = true; });

    const quitter = () => { if (client.salle) client.salle.detacher(client); client.salle = null; client.siege = null; };
    const entrer = (s, siege) => {
      quitter();
      client.salle = s; client.siege = siege;
      s.attacher(client);
      s.present(siege);
    };

    ws.on('message', (raw) => {
      const t = Date.now();
      bucket = Math.min(config.maxMessagesPerSecond, bucket + ((t - last) / 1000) * config.maxMessagesPerSecond);
      last = t;
      let m;
      try { m = JSON.parse(raw); } catch { return client.send({ t: 'refus', error: 'Message illisible.' }); }
      const ref = m?.ref;
      // Toujours répondre avec la référence, même en cas de limite, pour ne jamais laisser un client en attente
      if (bucket < 1) return client.send({ t: 'refus', error: 'Doucement, une action à la fois.', ref });
      bucket--;
      const refus = (error) => client.send({ t: 'refus', error, ref });
      try {
        switch (m.t) {
          case 'hello': {
            const p = typeof m.jeton === 'string' && base.place(m.jeton);
            const s = p && salle(p.code);
            if (!s) return client.send({ t: 'refus', error: 'Place introuvable : le lien a peut-être expiré.', code: 'jeton', ref });
            entrer(s, p.siege);
            return client.send({ t: 'ok', ref });
          }
          case 'creer': {
            const recent = (creations.get(ip) || []).filter((x) => t - x < 3600e3);
            if (recent.length >= config.maxGamesPerHourPerIp) return refus('Trop de parties créées, réessaie plus tard.');
            const r = Salle.creer(m, deps);
            if (r.error) return refus(r.error);
            recent.push(t); creations.set(ip, recent);
            salles.set(r.salle.code, r.salle);
            log(`[${r.salle.code}] partie créée (${m.mode}, ${m.humains} humain(s))`);
            client.send({ t: 'place', jeton: r.jeton, code: r.salle.code, siege: r.siege, ref });
            return entrer(r.salle, r.siege);
          }
          case 'rejoindre': {
            const s = salle(m.code);
            if (!s) return refus('Aucune partie avec ce code.');
            const r = s.rejoindre(m.nom, m.email);
            if (r.error) return refus(r.error);
            log(`[${s.code}] place ${r.siege} prise`);
            client.send({ t: 'place', jeton: r.jeton, code: s.code, siege: r.siege, ref });
            return entrer(s, r.siege);
          }
          case 'email': {
            if (!client.salle) return refus("Tu n'es dans aucune partie.");
            const r = client.salle.definirEmail(client.siege, m.email);
            return client.send(r.error ? { t: 'refus', error: r.error, ref } : { t: 'ok', ref });
          }
          case 'demarrer': {
            if (!client.salle) return refus("Tu n'es dans aucune partie.");
            const r = client.salle.demarrer(client.siege);
            if (r.error) return refus(r.error);
            log(`[${client.salle.code}] partie lancée`);
            return client.send({ t: 'ok', ref });
          }
          case 'action': {
            if (!client.salle) return refus("Tu n'es dans aucune partie.");
            const r = client.salle.agir(client.siege, m.action);
            return client.send(r.ok ? { t: 'ok', ref } : { t: 'refus', error: r.error, ref });
          }
          case 'mesparties': {
            const jetons = Array.isArray(m.jetons) ? m.jetons.slice(0, 60) : [];
            const parties = [];
            for (const j of jetons) {
              const p = typeof j === 'string' && base.place(j);
              const s = p && salle(p.code);
              if (s) parties.push({ jeton: j, ...s.resume(p.siege) });
            }
            return client.send({ t: 'mesparties', parties, ref });
          }
          case 'quitter':
            quitter();
            return client.send({ t: 'ok', ref });
          default:
            return refus('Message inconnu.');
        }
      } catch (e) {
        log(`erreur sur ${m.t} : ${e.stack || e.message}`);
        return refus('Erreur du serveur.');
      }
    });
    ws.on('close', quitter);
  });

  // Connexions mortes (réseau coupé sans fermeture propre)
  const ping = setInterval(() => {
    for (const ws of wss.clients) {
      if (!ws.alive) { ws.terminate(); continue; }
      ws.alive = false;
      ws.ping();
    }
  }, 30000);

  return new Promise((resolve) => {
    server.listen(config.port, config.host, () => {
      const port = server.address().port;
      log(`Terres de Houblon écoute sur ${config.host}:${port}`);
      resolve({
        port, salles, base,
        async fermer() {
          clearInterval(ping);
          for (const s of salles.values()) s.arreter();
          notifier.arreter();
          for (const ws of wss.clients) ws.terminate();
          await new Promise((r) => wss.close(r));
          await new Promise((r) => server.close(r));
          if (!opts.base) base.close();
        },
      });
    });
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const srv = await demarrerServeur();
  const stop = async (sig) => { console.log(`${sig} reçu, arrêt propre`); await srv.fermer(); process.exit(0); };
  process.on('SIGTERM', stop);
  process.on('SIGINT', stop);
}
