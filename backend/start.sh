#!/bin/sh
set -e
python3 manage.py migrate --noinput
python3 manage.py collectstatic --noinput --clear
daphne -b 0.0.0.0 -p $PORT Nexus.asgi:application
