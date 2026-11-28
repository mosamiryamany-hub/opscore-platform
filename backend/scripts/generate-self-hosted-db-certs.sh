#!/bin/sh
set -eu

output_dir="${1:-.secrets}"
mkdir -p "$output_dir"
umask 077

openssl genrsa -out "$output_dir/postgres-ca.key" 4096
openssl req -x509 -new -sha256 -days 3650 \
  -key "$output_dir/postgres-ca.key" \
  -out "$output_dir/postgres-ca.crt" \
  -subj "/CN=OpsCore Self-Hosted PostgreSQL CA"

openssl req -new -newkey rsa:2048 -nodes \
  -keyout "$output_dir/postgres-server.key" \
  -out "$output_dir/postgres-server.csr" \
  -subj "/CN=db"

cat > "$output_dir/postgres-server.ext" <<'EOF'
basicConstraints=CA:FALSE
keyUsage=digitalSignature,keyEncipherment
extendedKeyUsage=serverAuth
subjectAltName=DNS:db
EOF

openssl x509 -req -sha256 -days 825 \
  -in "$output_dir/postgres-server.csr" \
  -CA "$output_dir/postgres-ca.crt" \
  -CAkey "$output_dir/postgres-ca.key" \
  -CAcreateserial \
  -out "$output_dir/postgres-server.crt" \
  -extfile "$output_dir/postgres-server.ext"

chmod 0600 "$output_dir/postgres-ca.key" "$output_dir/postgres-server.key"
chmod 0644 "$output_dir/postgres-ca.crt" "$output_dir/postgres-server.crt"
rm -f "$output_dir/postgres-server.csr" "$output_dir/postgres-server.ext" "$output_dir/postgres-ca.srl"

printf '%s\n' "Generated PostgreSQL TLS files in $output_dir" \
  "Keep postgres-ca.key offline after signing; never mount it into containers." \
  "The server certificate is valid for DNS name db."
