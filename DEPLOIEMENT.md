# Déploiement sur srv.leperelamer.fr

Le jeu tient sur un seul domaine, **https://jeu.leperelamer.fr** :

- Apache sert la page (`index.html`, `client/`, `moteur/`) depuis `/srv/terres-de-houblon`, un clone du dépôt ;
- Apache relaie `/ws` (WebSocket) et `/sante` vers le serveur de jeu Node, qui écoute sur `127.0.0.1:3210` ;
- le serveur tourne en service systemd `terres-de-houblon`, sous l'utilisateur `houblon`, avec le Node 22 d'apt (`/usr/bin/node`) ; le Node de `/usr/local/bin`, utilisé par les autres sites, n'est pas touché ;
- les parties sont dans `/var/lib/terres-de-houblon/parties.sqlite`, sauvegardées chaque nuit dans `/var/backups/terres-de-houblon` ;
- en différé, les joueurs qui ont laissé leur adresse sont prévenus par e-mail (API Brevo, expéditeur `jeu@leperelamer.fr`) ; `/desabonner` arrête les messages.

Pas de Docker, pas de pm2 : systemd redémarre le service s'il tombe et au démarrage de la machine, et ses journaux vont dans journald.

## Installation (une fois, en root)

```bash
# 1. Utilisateur dédié et code
useradd --system --home-dir /srv/terres-de-houblon --no-create-home --shell /usr/sbin/nologin houblon
git clone https://github.com/antoineguiral/Terre-de-houblon.git /srv/terres-de-houblon
chown -R houblon:houblon /srv/terres-de-houblon
runuser -u houblon -- env PATH=/usr/bin:/bin npm ci --omit=dev --prefix /srv/terres-de-houblon/serveur --cache /tmp/npm-houblon --no-audit --no-fund

# 2. Configuration
install -m 640 -o root -g houblon /srv/terres-de-houblon/deploiement/terres-de-houblon.env.exemple /etc/terres-de-houblon.env

# 3. Service
cp /srv/terres-de-houblon/deploiement/terres-de-houblon.service /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now terres-de-houblon

# 4. Apache : module WebSocket, site, certificat
a2enmod proxy proxy_http proxy_wstunnel headers
cp /srv/terres-de-houblon/deploiement/jeu.leperelamer.fr.conf /etc/apache2/sites-available/
a2ensite jeu.leperelamer.fr
apache2ctl configtest && systemctl reload apache2
certbot --apache -d jeu.leperelamer.fr --redirect -n

# 5. Sauvegarde quotidienne
install -d -m 750 -o houblon -g houblon /var/backups/terres-de-houblon
cp /srv/terres-de-houblon/deploiement/sauvegarde.cron /etc/cron.d/terres-de-houblon
```

## Clé Brevo (notifications)

Dans Brevo : *SMTP & API* → *Clés API* → créer une clé dédiée « Terres de Houblon ». Puis, en root :

```bash
nano /etc/terres-de-houblon.env          # BREVO_API_KEY=xkeysib-…
systemctl restart terres-de-houblon
# E-mail d'essai, avec la configuration du service :
runuser -u houblon -- bash -c 'set -a; . /etc/terres-de-houblon.env; /usr/bin/node /srv/terres-de-houblon/outils/test-email.js toi@exemple.fr'
```

Sans clé, le jeu fonctionne et le journal indique « notifications e-mail désactivées ». Un envoi refusé par Brevo (clé révoquée, plan échu) est écrit dans le journal du service (`e-mail NON envoyé …`), sans bloquer la partie.

## Vérifier que tout tourne

```bash
systemctl status terres-de-houblon --no-pager      # active (running)
curl -s http://127.0.0.1:3210/sante                # {"ok":true,"parties":…,"connexions":…}
curl -s https://jeu.leperelamer.fr/sante           # même réponse, à travers Apache et HTTPS
curl -s -o /dev/null -w '%{http_code}\n' https://jeu.leperelamer.fr/serveur/config.js   # 403 : le code serveur n'est pas servi
```

Puis ouvrir https://jeu.leperelamer.fr, créer une partie et la rejoindre depuis un autre navigateur.

## Journaux

```bash
journalctl -u terres-de-houblon -f                 # serveur de jeu en direct (créations, délais dépassés, erreurs)
journalctl -u terres-de-houblon --since today
tail -f /var/log/apache2/jeu.error.log /var/log/apache2/jeu.access.log
journalctl -t houblon-sauvegarde                   # sauvegardes
journalctl -u terres-de-houblon | grep -i e-mail   # notifications envoyées ou refusées
```

## Mettre à jour

Après un `git push` sur `main` :

```bash
/srv/terres-de-houblon/deploiement/mettre-a-jour.sh
```

Le script tire `main`, réinstalle les dépendances du serveur, redémarre le service et affiche la santé. Les joueurs connectés sont reconnectés automatiquement ; aucune partie n'est perdue (l'état est écrit après chaque action et rechargé au démarrage, minuteurs compris).

Si le service change dans `deploiement/`, le recopier dans `/etc/systemd/system/` puis `systemctl daemon-reload && systemctl restart terres-de-houblon`.

Si le vhost change, **ne pas recopier** `jeu.leperelamer.fr.conf` par-dessus celui du serveur : certbot y a ajouté la redirection vers HTTPS et en a tiré `jeu.leperelamer.fr-le-ssl.conf`. Reporter la modification à la main dans les **deux** fichiers de `/etc/apache2/sites-available/`, puis `apache2ctl configtest && systemctl reload apache2`.

## Sauvegarde et restauration

```bash
# Sauvegarde immédiate
runuser -u houblon -- /usr/bin/node /srv/terres-de-houblon/outils/sauvegarde.js /var/lib/terres-de-houblon/parties.sqlite /var/backups/terres-de-houblon 14
ls -lh /var/backups/terres-de-houblon

# Restauration
systemctl stop terres-de-houblon
cp /var/backups/terres-de-houblon/parties-AAAA-MM-JJ-HH-MM.sqlite /var/lib/terres-de-houblon/parties.sqlite
rm -f /var/lib/terres-de-houblon/parties.sqlite-wal /var/lib/terres-de-houblon/parties.sqlite-shm
chown houblon:houblon /var/lib/terres-de-houblon/parties.sqlite
systemctl start terres-de-houblon
```

La copie est faite par `VACUUM INTO`, cohérente même pendant que le serveur écrit.

## Retour arrière

```bash
cd /srv/terres-de-houblon && runuser -u houblon -- git checkout <commit>   # puis systemctl restart terres-de-houblon
# Désinstaller : systemctl disable --now terres-de-houblon ; a2dissite jeu.leperelamer.fr jeu.leperelamer.fr-le-ssl ; systemctl reload apache2
```
