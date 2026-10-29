#!/usr/bin/env bash
set -euo pipefail

# Verification tooling only. Never called by a plugin or installed with one.
destination=${1:?Usage: bash verification/lean/install.sh NEW_DIRECTORY}
test "$(uname -s)" = Linux
case "$(uname -m)" in
  x86_64)
    platform=linux
    checksum=7289597a44543246c9227b8cae501767e095ce17f6d448b95fc4a8dc97268f6d
    ;;
  aarch64|arm64)
    platform=linux_aarch64
    checksum=c8f0f8a3920e839718b1343e6781fd80a3e9b1024fbcd7078eb30f54e806b028
    ;;
  *) echo 'Unsupported architecture; install Lean 4.35.0 and set LEAN explicitly.' >&2; exit 1 ;;
esac
if test -e "$destination"; then
  echo 'Destination already exists; choose a new directory.' >&2
  exit 1
fi
mkdir -p "$(dirname "$destination")"
scratch=$(mktemp -d "$(dirname "$destination")/.lean-install.XXXXXX")
trap 'rm -rf "$scratch"' EXIT
curl --fail --location --retry 3 "https://github.com/leanprover/lean4/releases/download/v4.35.0/lean-4.35.0-${platform}.tar.zst" --output "$scratch/lean.tar.zst"
printf '%s  %s\n' "$checksum" "$scratch/lean.tar.zst" | sha256sum --check
mkdir "$scratch/toolchain"
tar --zstd --extract --file "$scratch/lean.tar.zst" --strip-components=1 --directory "$scratch/toolchain"
mv "$scratch/toolchain" "$destination"
"$destination/bin/lean" --version
