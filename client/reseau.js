// Connexion WebSocket au serveur de jeu, avec reconnexion automatique.
//   const c = connexion(url, { onMessage, onStatus });
//   await c.send({ t: 'action', action })  → réponse du serveur ({ t: 'ok' } ou { t: 'refus', error })
//   c.setHello(() => message)              → message renvoyé à chaque (re)connexion (reprise de place)

export function connexion(url, { onMessage, onStatus }) {
  let ws = null, n = 0, open = false, retry = 0, hello = null;
  const pending = new Map(), queue = [];
  const raw = (o) => ws.send(JSON.stringify(o));

  function connect() {
    onStatus('connexion');
    ws = new WebSocket(url);
    ws.onopen = () => {
      open = true; retry = 0;
      onStatus('ok');
      const h = hello?.();
      if (h) raw(h);
      queue.splice(0).forEach(raw);
    };
    ws.onmessage = (e) => {
      let m;
      try { m = JSON.parse(e.data); } catch { return; }
      if (m.ref && pending.has(m.ref)) { pending.get(m.ref)(m); pending.delete(m.ref); }
      onMessage(m);
    };
    ws.onclose = () => {
      const was = open;
      open = false;
      for (const r of pending.values()) r({ t: 'refus', error: 'Connexion perdue, réessaie dans un instant.' });
      pending.clear();
      onStatus(was ? 'perdu' : 'injoignable');
      setTimeout(connect, Math.min(15000, 600 * 2 ** retry++));
    };
  }
  connect();

  return {
    send(o) {
      return new Promise((res) => {
        const msg = { ...o, ref: ++n };
        pending.set(msg.ref, res);
        if (open) raw(msg); else queue.push(msg);
      });
    },
    setHello(fn) { hello = fn; },
  };
}
