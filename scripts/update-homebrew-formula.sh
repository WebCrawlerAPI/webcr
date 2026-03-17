#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 3 ]]; then
  echo "usage: $0 <tag> <sha256> <tap_dir>" >&2
  exit 1
fi

TAG="$1"
SHA256_VALUE="$2"
TAP_DIR="$3"
VERSION="${TAG#v}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
TEMPLATE_PATH="${PROJECT_DIR}/Formula/webcr.rb"
DEST_PATH="${TAP_DIR}/Formula/webcr.rb"

mkdir -p "${TAP_DIR}/Formula"

sed \
  -e "s/__VERSION__/${VERSION}/g" \
  -e "s/__SHA256__/${SHA256_VALUE}/g" \
  "${TEMPLATE_PATH}" > "${DEST_PATH}"

echo "Updated ${DEST_PATH} for ${TAG}"
