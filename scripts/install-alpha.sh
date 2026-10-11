#!/usr/bin/env bash
# Builds the macOS desktop app from this checkout and replaces the installed
# "Lockwood & Co. (Alpha)" in /Applications, then relaunches it.
#
# Usage: vp run alpha
#
# The quit/replace/relaunch phase runs detached, so the install still finishes
# when this command was started by an agent inside the Alpha app it replaces.
set -euo pipefail

APP_NAME="Lockwood & Co. (Alpha)"
APP_PATH="/Applications/${APP_NAME}.app"
# The bundle's name before the rebrand; replaced on the first install.
LEGACY_APP_NAME="T3 Code (Alpha)"
LEGACY_APP_PATH="/Applications/${LEGACY_APP_NAME}.app"
LOG_FILE="${HOME}/.t3/install-alpha.log"

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "install-alpha: macOS only" >&2
  exit 1
fi

app_running() {
  [[ "$(osascript -e "application \"${1:-$APP_NAME}\" is running" 2>/dev/null)" == "true" ]]
}

quit_app() {
  local name="$1"
  # Asking about an app that is not installed makes AppleScript prompt for it.
  [[ -d "/Applications/${name}.app" ]] || return 0
  app_running "$name" || return 0
  echo "quitting ${name}..."
  osascript -e "tell application \"${name}\" to quit" >/dev/null 2>&1 || true
  for _ in $(seq 1 60); do
    app_running "$name" || return 0
    sleep 1
  done
  echo "error: ${name} is still running; quit it and run 'vp run alpha' again" >&2
  exit 1
}

if [[ "${1:-}" == "--install-phase" ]]; then
  dmg="$2"
  echo "[$(date '+%H:%M:%S')] installing ${dmg}"

  quit_app "$APP_NAME"
  quit_app "$LEGACY_APP_NAME"

  mount_point="$(hdiutil attach -nobrowse -readonly "$dmg" | awk -F'\t' '/\/Volumes\//{print $NF}')"
  trap 'hdiutil detach "$mount_point" -quiet || true' EXIT
  rm -rf "$APP_PATH" "$LEGACY_APP_PATH"
  ditto "${mount_point}/${APP_NAME}.app" "$APP_PATH"
  open "$APP_PATH"
  echo "[$(date '+%H:%M:%S')] done: ${APP_NAME} updated and relaunched"
  exit 0
fi

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

case "$(uname -m)" in
  arm64) arch="arm64" ;;
  x86_64) arch="x64" ;;
  *) echo "install-alpha: unsupported architecture $(uname -m)" >&2; exit 1 ;;
esac

echo "Building ${APP_NAME} (${arch}) from $(git rev-parse --short HEAD)..."
build_started="$(date +%s)"
node scripts/build-desktop-artifact.ts --platform mac --target dmg --arch "$arch"

dmg="$(ls -t release/*-"${arch}".dmg 2>/dev/null | head -n 1 || true)"
if [[ -z "$dmg" || "$(stat -f %m "$dmg")" -lt "$build_started" ]]; then
  echo "install-alpha: build did not produce a new ${arch} dmg in release/" >&2
  exit 1
fi

mkdir -p "$(dirname "$LOG_FILE")"
: >"$LOG_FILE"
# New session: Alpha tears down its process tree on quit, and this command may be
# part of that tree.
nohup perl -MPOSIX -e 'POSIX::setsid(); exec @ARGV' "$0" --install-phase "${repo_root}/${dmg}" \
  >>"$LOG_FILE" 2>&1 </dev/null &
installer_pid=$!
disown "$installer_pid"

echo "Installing in the background (log: ${LOG_FILE})..."
while kill -0 "$installer_pid" 2>/dev/null; do
  sleep 1
done
cat "$LOG_FILE"
