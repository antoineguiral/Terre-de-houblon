// E-mail d'essai par Brevo, avec la configuration du service : node outils/test-email.js destinataire@exemple.fr
import { envoyeurBrevo } from '../serveur/notifications.js';

const to = process.argv[2];
const { BREVO_API_KEY: apiKey, MAIL_FROM: from = 'jeu@leperelamer.fr', PUBLIC_URL: url = 'https://jeu.leperelamer.fr/' } = process.env;
if (!to) { console.error('usage : node outils/test-email.js destinataire@exemple.fr'); process.exit(1); }
if (!apiKey) { console.error('BREVO_API_KEY absente de l’environnement'); process.exit(1); }
const r = await envoyeurBrevo({ apiKey, from })({
  to,
  subject: 'Terres de Houblon : e-mail d’essai',
  html: `<p>Les notifications de Terres de Houblon fonctionnent.</p><p><a href="${url}">Aller au jeu</a></p>`,
  text: `Les notifications de Terres de Houblon fonctionnent.\n${url}\n`,
  unsubscribe: `${url}desabonner`,
});
console.log(r.ok ? `envoyé à ${to} depuis ${from}` : `échec : ${r.error}`);
process.exit(r.ok ? 0 : 1);
