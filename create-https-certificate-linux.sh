#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

echo "Creating local HTTPS certificate for bouldering timer..."
echo

if ! command -v openssl >/dev/null 2>&1; then
  echo "OpenSSL was not found."
  echo "Install the openssl package or use HTTP mode instead."
  exit 1
fi

DNS_NAMES=("localhost" "$(hostname -s)" "$(hostname)")
IP_NAMES=()
for address in $(hostname -I 2>/dev/null || true); do
  if [[ -n "$address" && "$address" != 127.* ]]; then
    IP_NAMES+=("$address")
  fi
done

CONFIG_FILE=$(mktemp .timer-openssl-config.XXXXXX)
KEY_FILE=$(mktemp .timer-key.XXXXXX)
CERT_FILE=$(mktemp .timer-cert.XXXXXX)

cleanup() {
  rm -f "$CONFIG_FILE" "$KEY_FILE" "$CERT_FILE"
}
trap cleanup EXIT

{
  echo "[req]"
  echo "distinguished_name=req_distinguished_name"
  echo "x509_extensions=v3_req"
  echo "prompt=no"
  echo
  echo "[req_distinguished_name]"
  echo "CN=Bouldering Timer"
  echo
  echo "[v3_req]"
  echo "keyUsage=critical,digitalSignature,keyEncipherment"
  echo "extendedKeyUsage=serverAuth"
  echo "subjectAltName=@alt_names"
  echo
  echo "[alt_names]"
  index=1
  previous=""
  for name in "${DNS_NAMES[@]}"; do
    if [[ -n "$name" && " $previous " != *" $name "* ]]; then
      echo "DNS.$index=$name"
      previous="$previous $name"
      index=$((index + 1))
    fi
  done
  index=1
  previous=""
  for address in "${IP_NAMES[@]}"; do
    if [[ -n "$address" && " $previous " != *" $address "* ]]; then
      echo "IP.$index=$address"
      previous="$previous $address"
      index=$((index + 1))
    fi
  done
} > "$CONFIG_FILE"

openssl req -x509 -newkey rsa:2048 -nodes -days 1825 \
  -keyout "$KEY_FILE" \
  -out "$CERT_FILE" \
  -config "$CONFIG_FILE" >/dev/null 2>&1

mv "$KEY_FILE" timer-key.pem
mv "$CERT_FILE" timer-cert.pem
KEY_FILE=""
CERT_FILE=""

echo "Created timer-key.pem and timer-cert.pem"
echo
echo "Certificate names:"
for name in "${DNS_NAMES[@]}"; do
  echo "  $name"
done
for address in "${IP_NAMES[@]}"; do
  echo "  $address"
done
echo
echo "Restart start-timer-linux.sh after this."
