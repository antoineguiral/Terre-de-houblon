# Déploiement sur srv.leperelamer.fr

Brassins tourne à côté de Terres de Houblon sur la même machine : même utilisateur `houblon` (déjà créé), mais son propre dossier, son propre service, sa propre base et son propre port (3211). Le sous-domaine `brassins.leperelamer.fr` est à remplacer par celui choisi, dans les fichiers de `deploiement/` et dans `/etc/brassins.env`.

Le jeu tient sur un seul domaine, **https://brassins.leperelamer.fr** :

- Apache sert la page (`index.html`, `client/`, `moteur/`) depuis `/srv/brassins`, un clone du dépôt ;
- Apache relaie `/ws` (WebSocket) et `/sante` vers le serveur de jeu Node, qui écoute sur `127.0.0.1:3211` ;
- le serveur tourne en service systemd `brassins`, sous l'utilisateur `houblon`, avec le Node 22 d'apt (`/usr/bin/node`), et écoute sur `127.0.0.1:3211` (Terres de Houblon garde le 3210) ;
- les parties sont dans `/var/lib/brassins/parties.sqlite`, sauvegardées chaque nuit dans `/var/backups/brassins` ;
- en différé, les joueurs qui ont laissé leur adresse sont prévenus par e-mail (API Brevo, expéditeur `jeu@leperelamer.fr`) ; `/desabonner` arrête les messages.

Pas de Docker, pas de pm2 : systemd redémarre le service s'il tombe et au démarrage de la machine, et ses journaux vont dans journald.

## Installation (une fois, en root)

```bash
# 1. Utilisateur dédié et code
# (l'utilisateur houblon existe déjà, créé pour Terres de Houblon)
git clone https://github.com/antoineguiral/brassins.git /srv/brassins
chown -R houblon:houblon /srv/brassins
runuser -u houblon -- env PATH=/usr/bin:/bin npm ci --omit=dev --prefix /srv/brassins/serveur --cache /tmp/npm-houblon --no-audit --no-fund

# 2. Configuration
install -m 640 -o root -g houblon /srv/brassins/deploiement/brassins.env.exemple /etc/brassins.env

# 3. Service
cp /srv/brassins/deploiement/brassins.service /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now brassins

# 4. Apache : module WebSocket, site, certificat
a2enmod proxy proxy_http proxy_wstunnel headers
cp /srv/brassins/deploiement/brassins.leperelamer.fr.conf /etc/apache2/sites-available/
a2ensite brassins.leperelamer.fr
apache2ctl configtest && systemctl reload apache2
certbot --apache -d brassins.leperelamer.fr --redirect -n

# 5. Sauvegarde quotidienne
install -d -m 750 -o houblon -g houblon /var/backups/brassins
cp /srv/brassins/deploiement/sauvegarde.cron /etc/cron.d/brassins
```

## Clé Brevo (notifications)

Dans Brevo : *SMTP & API* → *Clés API* → créer une clé dédiée « Brassins ». Puis, en root :

```bash
nano /etc/brassins.env          # BREVO_API_KEY=xkeysib-…
systemctl restart brassins
# E-mail d'essai, avec la configuration du service :
runuser -u houblon -- bash -c 'set -a; . /etc/brassins.env; /usr/bin/node /srv/brassins/outils/test-email.js toi@exemple.fr'
```

Sans clé, le jeu fonctionne et le journal indique « notifications e-mail désactivées ». Un envoi refusé par Brevo (clé révoquée, plan échu) est écrit dans le journal du service (`e-mail NON envoyé …`), sans bloquer la partie.

## Vérifier que tout tourne

```bash
systemctl status brassins --no-pager      # active (running)
curl -s http://127.0.0.1:3211/sante                # {"ok":true,"parties":…,"connexions":…}
curl -s https://brassins.leperelamer.fr/sante           # même réponse, à travers Apache et HTTPS
curl -s -o /dev/null -w '%{http_code}\n' https://brassins.leperelamer.fr/serveur/config.js   # 403 : le code serveur n'est pas servi
```

Puis ouvrir https://brassins.leperelamer.fr, créer une partie et la rejoindre depuis un autre navigateur.

## Journaux

```bash
journalctl -u brassins -f                 # serveur de jeu en direct (créations, délais dépassés, erreurs)
journalctl -u brassins --since today
tail -f /var/log/apache2/brassins.error.log /var/log/apache2/brassins.access.log
journalctl -t brassins-sauvegarde                   # sauvegardes
journalctl -u brassins | grep -i e-mail   # notifications envoyées ou refusées
```

## Mettre à jour

Après un `git push` sur `main` :

```bash
/srv/brassins/deploiement/mettre-a-jour.sh
```

Le script tire `main`, réinstalle les dépendances du serveur, redémarre le service et affiche la santé. Les joueurs connectés sont reconnectés automatiquement ; aucune partie n'est perdue (l'état est écrit après chaque action et rechargé au démarrage, minuteurs compris).

Si le service change dans `deploiement/`, le recopier dans `/etc/systemd/system/` puis `systemctl daemon-reload && systemctl restart brassins`.

Si le vhost change, **ne pas recopier** `brassins.leperelamer.fr.conf` par-dessus celui du serveur : certbot y a ajouté la redirection vers HTTPS et en a tiré `brassins.leperelamer.fr-le-ssl.conf`. Reporter la modification à la main dans les **deux** fichiers de `/etc/apache2/sites-available/`, puis `apache2ctl configtest && systemctl reload apache2`.

## Sauvegarde et restauration

```bash
# Sauvegarde immédiate
runuser -u houblon -- /usr/bin/node /srv/brassins/outils/sauvegarde.js /var/lib/brassins/parties.sqlite /var/backups/brassins 14
ls -lh /var/backups/brassins

# Restauration
systemctl stop brassins
cp /var/backups/brassins/parties-AAAA-MM-JJ-HH-MM.sqlite /var/lib/brassins/parties.sqlite
rm -f /var/lib/brassins/parties.sqlite-wal /var/lib/brassins/parties.sqlite-shm
chown houblon:houblon /var/lib/brassins/parties.sqlite
systemctl start brassins
```

La copie est faite par `VACUUM INTO`, cohérente même pendant que le serveur écrit.

## Retour arrière

```bash
cd /srv/brassins && runuser -u houblon -- git checkout <commit>   # puis systemctl restart brassins
# Désinstaller : systemctl disable --now brassins ; a2dissite brassins.leperelamer.fr brassins.leperelamer.fr-le-ssl ; systemctl reload apache2
```
