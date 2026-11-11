#!/usr/bin/env bash
# Installs ffmpeg + ffprobe on a GitHub Ubuntu runner.
#
# 2026-11-11: `sudo apt-get install -y ffmpeg` hung for over an hour in every
# render workflow because the Ubuntu mirrors (azure.archive, archive and
# security.ubuntu.com) timed out on each of ffmpeg's ~100 dependencies, so no
# video could render. Try apt first with short timeouts (keeps the usual
# Ubuntu build when mirrors are healthy), then fall back to a static build
# downloaded from GitHub, which does not touch the Ubuntu mirrors.
set -euo pipefail

if command -v ffmpeg >/dev/null 2>&1 && command -v ffprobe >/dev/null 2>&1; then
  ffmpeg -hide_banner -version | head -n 1 || true
  exit 0
fi

APT_OPTS=(-o Acquire::Retries=2 -o Acquire::http::Timeout=20 -o Acquire::https::Timeout=20)
if timeout 150 sudo apt-get "${APT_OPTS[@]}" update \
  && timeout 240 sudo apt-get "${APT_OPTS[@]}" install -y ffmpeg; then
  ffmpeg -hide_banner -version | head -n 1 || true
  exit 0
fi

echo "apt ffmpeg install failed or timed out; using static build" >&2
ASSET="ffmpeg-n8.1-latest-linux64-gpl-8.1"
URL="https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/${ASSET}.tar.xz"
TMP="$(mktemp -d)"
curl --fail --location --retry 3 --connect-timeout 20 --max-time 600 -o "$TMP/ffmpeg.tar.xz" "$URL"
tar -xJf "$TMP/ffmpeg.tar.xz" -C "$TMP"
sudo install -m 0755 "$TMP/$ASSET/bin/ffmpeg" /usr/bin/ffmpeg
sudo install -m 0755 "$TMP/$ASSET/bin/ffprobe" /usr/bin/ffprobe
rm -rf "$TMP"
ffmpeg -hide_banner -version | head -n 1 || true
ffprobe -hide_banner -version | head -n 1 || true
