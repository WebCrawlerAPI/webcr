#!/usr/bin/env sh
set -eu

REPO_OWNER="webCrawlerAPI"
REPO_NAME="webcr"
INSTALL_ROOT="${HOME}/.local/share/webcr"
BIN_DIR="${HOME}/.local/bin"
TMP_DIR="$(mktemp -d)"
ARCHIVE_URL="https://github.com/${REPO_OWNER}/${REPO_NAME}/archive/refs/heads/master.tar.gz"

cleanup() {
  rm -rf "${TMP_DIR}"
}

trap cleanup EXIT INT TERM

need_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

detect_profile() {
  shell_name="$(basename "${SHELL:-}")"

  case "${shell_name}" in
    zsh)
      echo "${HOME}/.zshrc"
      ;;
    bash)
      if [ -f "${HOME}/.bashrc" ]; then
        echo "${HOME}/.bashrc"
      elif [ -f "${HOME}/.bash_profile" ]; then
        echo "${HOME}/.bash_profile"
      else
        echo "${HOME}/.bashrc"
      fi
      ;;
    fish)
      echo "${HOME}/.config/fish/config.fish"
      ;;
    *)
      echo "${HOME}/.profile"
      ;;
  esac
}

append_path() {
  profile_path="$1"
  mkdir -p "$(dirname "${profile_path}")"
  [ -f "${profile_path}" ] || : > "${profile_path}"

  shell_name="$(basename "${SHELL:-}")"
  case "${shell_name}" in
    fish)
      if ! grep -F 'fish_add_path $HOME/.local/bin' "${profile_path}" >/dev/null 2>&1; then
        printf '\nfish_add_path $HOME/.local/bin\n' >> "${profile_path}"
      fi
      ;;
    *)
      if ! grep -F 'export PATH="$HOME/.local/bin:$PATH"' "${profile_path}" >/dev/null 2>&1; then
        printf '\nexport PATH="$HOME/.local/bin:$PATH"\n' >> "${profile_path}"
      fi
      ;;
  esac
}

write_wrapper() {
  wrapper_path="${BIN_DIR}/webcr"
  cat > "${wrapper_path}" <<EOF
#!/usr/bin/env sh
set -eu
exec node "${INSTALL_ROOT}/current/webcr.js" "\$@"
EOF
  chmod +x "${wrapper_path}"
}

need_cmd curl
need_cmd tar
need_cmd node

node_major="$(node -p 'process.versions.node.split(".")[0]')"
if [ "${node_major}" -lt 20 ]; then
  echo "webcr requires Node.js 20 or newer. Found: $(node -v)" >&2
  exit 1
fi

mkdir -p "${INSTALL_ROOT}" "${BIN_DIR}"

echo "Downloading webcr..."
curl -fsSL "${ARCHIVE_URL}" -o "${TMP_DIR}/webcr.tar.gz"
tar -xzf "${TMP_DIR}/webcr.tar.gz" -C "${TMP_DIR}"

src_dir="$(find "${TMP_DIR}" -maxdepth 1 -type d -name "${REPO_NAME}-*" | head -n 1)"
if [ -z "${src_dir}" ]; then
  echo "Failed to unpack webcr archive." >&2
  exit 1
fi

rm -rf "${INSTALL_ROOT}/current"
mkdir -p "${INSTALL_ROOT}/current"
cp "${src_dir}/webcr.js" "${INSTALL_ROOT}/current/webcr.js"
mkdir -p "${INSTALL_ROOT}/current/src"
cp "${src_dir}/src/cli.js" "${INSTALL_ROOT}/current/src/cli.js"
cp "${src_dir}/README.md" "${INSTALL_ROOT}/current/README.md"
cp "${src_dir}/LICENSE" "${INSTALL_ROOT}/current/LICENSE"
cp "${src_dir}/package.json" "${INSTALL_ROOT}/current/package.json"

write_wrapper

profile_path="$(detect_profile)"
append_path "${profile_path}"

echo
echo "webcr installed to ${INSTALL_ROOT}/current"
echo "Command installed at ${BIN_DIR}/webcr"
echo "Shell profile updated: ${profile_path}"
echo
echo "Open a new terminal or run one of these now:"
echo "  export PATH=\"\$HOME/.local/bin:\$PATH\""
echo "  hash -r 2>/dev/null || true"
echo
echo "Next step:"
echo "  webcr auth set YOUR_API_KEY"
echo
echo "Get your API key and register at:"
echo "  https://dash.webcrawlerapi.com/access"
