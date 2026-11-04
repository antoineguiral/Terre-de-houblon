// Démarrage de la page. Pour l'instant : mode solo, sans serveur.

import { createUi } from './rendu.js';
import { startSolo } from './solo.js';

let solo;
const ui = createUi({ send: (a) => solo.send(a), onNewGame: () => solo.newGame() });
solo = startSolo(ui);
solo.start();
