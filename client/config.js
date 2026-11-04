// Adresse du serveur de jeu : celui du domaine qui sert la page (WebSocket sur /ws) ; en local, le serveur de développement.
// Pour tester un autre serveur : ?serveur=wss://exemple.fr dans l'adresse de la page.

const local = ['localhost', '127.0.0.1'].includes(location.hostname);
const force = new URLSearchParams(location.search).get('serveur');

export const SERVEUR = force || (local ? `ws://${location.hostname}:3210` : `wss://${location.host}/ws`);
export const PAGE = location.origin + location.pathname;
