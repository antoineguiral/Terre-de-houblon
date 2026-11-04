#!/bin/bash
# Mise à jour du jeu sur le serveur, à lancer en root : /srv/terres-de-houblon/deploiement/mettre-a-jour.sh
# Les joueurs connectés sont déconnectés une seconde puis reconnectés automatiquement ; aucune partie n'est perdue.
set -euo pipefail
cd /srv/terres-de-houblon
runuser -u houblon -- git pull --ff-only
runuser -u houblon -- env PATH=/usr/bin:/bin npm ci --omit=dev --prefix serveur --cache /tmp/npm-houblon --no-audit --no-fund
systemctl restart terres-de-houblon
sleep 2
systemctl is-active terres-de-houblon
curl -fsS http://127.0.0.1:3210/sante && echo
git log --oneline -1
