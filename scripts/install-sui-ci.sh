#!/usr/bin/env bash
set -euo pipefail

# The same Testnet release used for the checked-in Move package and local gates.
# Release SHA-256: https://github.com/MystenLabs/sui/releases/tag/testnet-v1.65.1
install_dir="${1:?Usage: bash scripts/install-sui-ci.sh INSTALL_DIRECTORY}"
expected_version="sui 1.65.1-75515e79e182"
archive_sha256="e4224171712481e53e840cbc659308408db62ba1bc2dbd2cb8ef648564eea6c9"
archive="${RUNNER_TEMP:-${TMPDIR:-/tmp}}/praxis-sui-testnet-v1.65.1-x64.tgz"
release_url="https://github.com/MystenLabs/sui/releases/download/testnet-v1.65.1/sui-testnet-v1.65.1-ubuntu-x86_64.tgz"

if [[ "$(uname -s)" != "Linux" || "$(uname -m)" != "x86_64" ]]; then
  echo "This CI installer requires Linux x86_64." >&2
  exit 1
fi

if [[ -x "$install_dir/sui" ]] && [[ "$("$install_dir/sui" --version)" == "$expected_version" ]]; then
  echo "Using cached $expected_version"
  exit 0
fi

if ! printf '%s  %s\n' "$archive_sha256" "$archive" | sha256sum --check --status; then
  curl --fail --location --retry 3 --connect-timeout 20 --max-time 600 \
    --silent --show-error "$release_url" --output "$archive"
fi
printf '%s  %s\n' "$archive_sha256" "$archive" | sha256sum --check
mkdir -p "$install_dir"
tar --extract --gzip --file "$archive" --directory "$install_dir" ./sui

actual_version="$("$install_dir/sui" --version)"
if [[ "$actual_version" != "$expected_version" ]]; then
  printf 'Expected %s; received %s\n' "$expected_version" "$actual_version" >&2
  exit 1
fi
printf 'Installed %s\n' "$actual_version"
