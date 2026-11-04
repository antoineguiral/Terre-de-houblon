// Adresse du serveur de jeu. En local (http://localhost), le serveur de développement ; sinon la production.
// Pour tester un autre serveur : ?serveur=wss://exemple.fr dans l'adresse de la page.

const local = ['localhost', '127.0.0.1'].includes(location.hostname);
const force = new URLSearchParams(location.search).get('serveur');

export const SERVEUR = force || (local ? `ws://${location.hostname}:3210` : 'wss://jeu.leperelamer.fr');
export const PAGE = location.origin + location.pathname;
