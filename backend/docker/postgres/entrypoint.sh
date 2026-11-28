#!/bin/sh
set -eu

secrets_dir=/run/secrets
server_certificate="$secrets_dir/postgres-server.crt"
server_private_key="$secrets_dir/postgres-server.key"

if [ ! -r "$server_certificate" ] || [ ! -r "$server_private_key" ]; then
  echo "SELF_HOSTED_POSTGRES_TLS_CERTIFICATE_REQUIRED" >&2
  exit 1
fi

# The mounted key is read-only. Copy it into the persistent PostgreSQL parent
# volume with owner=postgres and mode 0600 before starting the official entrypoint.
install -m 0644 "$server_certificate" /var/lib/postgresql/server.crt
install -m 0600 "$server_private_key" /var/lib/postgresql/server.key

exec /usr/local/bin/docker-entrypoint.sh "$@"
