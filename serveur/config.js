// Configuration par variables d'environnement (fichier /etc/brassins.env en production).

const list = (v, d) => (v ? v.split(',').map((x) => x.trim()).filter(Boolean) : d);

export const CONFIG = {
  host: process.env.HOST || '127.0.0.1',
  port: +(process.env.PORT || 3210),
  db: process.env.DB_PATH || new URL('./donnees/parties.sqlite', import.meta.url).pathname,
  // Origines autorisées pour les connexions WebSocket et les requêtes HTTP
  origins: list(process.env.ALLOWED_ORIGINS, ['http://localhost:8642', 'http://127.0.0.1:8642']),
  // Adresse publique du jeu, pour les liens envoyés (reprise de place, invitation)
  publicUrl: process.env.PUBLIC_URL || 'http://localhost:8642/',
  // Notifications e-mail (différé) : clé API Brevo dédiée au jeu, expéditeur d'un domaine authentifié
  brevoKey: process.env.BREVO_API_KEY || '',
  mailFrom: process.env.MAIL_FROM || 'jeu@leperelamer.fr',
  // Délais par défaut et bornes (secondes)
  delays: {
    direct: { def: 90, min: 30, max: 600 },
    differe: { def: 24 * 3600, min: 3600, max: 7 * 24 * 3600 },
  },
  tradeLimit: { direct: 45, differe: 4 * 3600 },
  // Limites anti-abus
  maxGamesPerHourPerIp: 30,
  maxMessagesPerSecond: 20,
  // Rythme des IA (ms entre deux décisions)
  aiPace: { direct: +(process.env.AI_PACE || 1), differe: 0.3 * +(process.env.AI_PACE || 1) },
};
