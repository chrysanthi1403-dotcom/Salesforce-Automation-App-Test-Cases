#!/usr/bin/env bash
# One-shot installer for the Salesforce UAT Auto Runner.
#
# What this does:
#   1. Verifies Node.js is >= 20.
#   2. Installs all Node dependencies (Electron, React, Playwright,
#      jsforce, AI SDKs, SQLite, keytar, ...).
#   3. Rebuilds native modules for Electron (better-sqlite3, keytar).
#   4. Downloads Chromium into the user-data browsers cache that the app
#      actually uses at runtime, so the first test run starts immediately.
#
# Usage:
#   chmod +x setup.sh
#   ./setup.sh
#
# Re-runs are safe: npm install is idempotent and Playwright skips a
# Chromium that's already present.

set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" &> /dev/null && pwd)"
cd "$SCRIPT_DIR"

say() { printf "\n\033[1;36m▶ %s\033[0m\n" "$*"; }

say "Checking Node.js version"
if ! command -v node >/dev/null 2>&1; then
  echo "ERROR: Node.js is not installed. Install Node 20+ from https://nodejs.org/ (or via nvm) and re-run." >&2
  exit 1
fi
NODE_MAJOR=$(node -p "process.versions.node.split('.')[0]")
if [ "$NODE_MAJOR" -lt 20 ]; then
  echo "ERROR: Node $NODE_MAJOR detected. This app needs Node 20 or newer." >&2
  exit 1
fi
say "Node $(node -v) OK"

say "Installing npm dependencies"
npm install

say "Rebuilding native modules for Electron (better-sqlite3, keytar)"
# postinstall already runs electron-builder install-app-deps, but run it
# again explicitly so users who used --ignore-scripts still get a working
# native build.
npx --yes electron-builder install-app-deps

say "Downloading Chromium into the app's browsers cache"
# Resolve the same userData path the app uses at runtime. Electron derives
# it from the app name in package.json: "salesforce-uat-auto-runner".
case "$(uname -s)" in
  Darwin*)
    USER_DATA="$HOME/Library/Application Support/salesforce-uat-auto-runner"
    ;;
  Linux*)
    USER_DATA="${XDG_CONFIG_HOME:-$HOME/.config}/salesforce-uat-auto-runner"
    ;;
  *)
    # Windows-style path only matters under WSL/Cygwin; native Windows
    # users should run setup.ps1 instead (or the commands from README.md).
    USER_DATA="${APPDATA:-$HOME/AppData/Roaming}/salesforce-uat-auto-runner"
    ;;
esac
mkdir -p "$USER_DATA/ms-playwright"
PLAYWRIGHT_BROWSERS_PATH="$USER_DATA/ms-playwright" npx playwright install chromium

say "All done"
echo "Next steps:"
echo "  1. npm run dev                 # launch the app in dev mode"
echo "  2. Settings tab                # paste Anthropic / OpenAI / Gemini key"
echo "  3. Orgs tab                    # add a Salesforce org"
echo "  4. New Run                     # import an Excel/CSV and watch it go"
