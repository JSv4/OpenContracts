#!/bin/sh
echo "window._env_ = {" > ./env-config.js
awk -F '=' '{ print $1 ": \"" (ENVIRON[$1] ? ENVIRON[$1] : $2) "\","}' ./.env >> ./env-config.js
echo "}" >> ./env-config.js
