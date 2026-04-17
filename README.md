# Salesforce UAT Auto Runner

Desktop app (Electron + React + Playwright) that reads UAT test cases from an Excel/CSV file, uses an LLM (Claude, ChatGPT, or Gemini) plus Salesforce org metadata to generate Playwright scripts for each case, runs them in headed Chromium, and keeps an auditable history per org.

## What it does

1. You pick an Excel/CSV file with UAT test cases (any reasonable layout — the AI normalizes it).
2. You pick a saved Salesforce org (username/password, optionally a security token).
3. The app connects to the org via jsforce, pulls object/field metadata, and prompts the LLM to generate one Playwright `.spec.ts` per test case with Lightning-friendly locators and assertions on the expected results.
4. The generated specs are saved under the user-data folder (`generated/<org-alias>/<import-id>/`) and previewed in the UI.
5. End users hit **Run** on a test case, watch the browser execute it live, and get pass/fail plus screenshots/trace as evidence.
6. All runs are stored in a local SQLite DB for a per-org history view.

## Requirements

- **Node.js 20+** (check with `node -v`)
- macOS, Windows, or Linux
- An API key for ONE of:
  - **Anthropic** (Claude) — https://console.anthropic.com/
  - **OpenAI** (ChatGPT) — https://platform.openai.com/api-keys
  - **Google** (Gemini) — https://aistudio.google.com/app/apikey
- Salesforce org credentials (username + password; optional security token, appended automatically)

## Install

Easiest — one command on macOS/Linux:

```bash
chmod +x setup.sh
./setup.sh
```

This installs Node deps, rebuilds native modules for Electron, and downloads Chromium into the app's browsers cache so the first test run works immediately.

### Manual install (any OS)

```bash
# 1. install Node dependencies
npm install

# 2. rebuild native modules (better-sqlite3, keytar) against Electron
npx electron-builder install-app-deps

# 3. download Chromium into the path the app uses at runtime
#    macOS:
PLAYWRIGHT_BROWSERS_PATH="$HOME/Library/Application Support/salesforce-uat-auto-runner/ms-playwright" \
  npx playwright install chromium

#    Linux:
PLAYWRIGHT_BROWSERS_PATH="${XDG_CONFIG_HOME:-$HOME/.config}/salesforce-uat-auto-runner/ms-playwright" \
  npx playwright install chromium

#    Windows (PowerShell):
$env:PLAYWRIGHT_BROWSERS_PATH = "$env:APPDATA\salesforce-uat-auto-runner\ms-playwright"
npx playwright install chromium
```

> Note: if you skip step 3, the app will download Chromium automatically on first launch. The pre-install is just to avoid waiting ~1–3 minutes the first time.

## Run in dev mode

```bash
npm run dev
```

Then in the app:

1. **Settings** → paste your Anthropic / OpenAI / Gemini API key and pick a default model.
2. **Orgs** → add a Salesforce org (alias, login URL, username, password, optional security token).
3. **New Run** → pick an Excel/CSV of test cases, pick the org, pick the AI provider, generate.
4. **Output folder** → preview the generated `.spec.ts` files and hit **Run** to watch Chromium execute them.

## Packaging

```bash
npm run package:mac    # or package:win / package:linux
```

Chromium is downloaded on first launch of the packaged app into `userData/ms-playwright`, so end users do not need Playwright installed globally.

## Security

- Org credentials and AI API keys are stored in the OS keychain via `keytar`. They never touch disk in plaintext.
- Generated Playwright specs read credentials only from environment variables (`SF_USERNAME`, `SF_PASSWORD`, `SF_SECURITY_TOKEN`, `SF_LOGIN_URL`) that the runner injects at execution time.
- The renderer runs with `contextIsolation: true`, `nodeIntegration: false`, and a strict CSP.

## Project layout

```
electron/
  main/                Electron main process
    services/          Pure Node services (excel, ai, salesforce, generator, runner, history…)
    index.ts
    ipc.ts
  preload/             Typed contextBridge API
shared/                Types + IPC channel constants shared main ↔ renderer
src/                   React renderer (pages, components, UI primitives)
samples/               Example UAT CSV for smoke testing
setup.sh               One-shot installer
```

Generated outputs and evidence live inside Electron's `userData`:

- `generated/<orgAlias>/<importId>/` — `.spec.ts` files, `playwright.config.ts`, `test-cases.json`, `README.md`
- `evidence/<runId>/` — screenshots, trace.zip, videos on failure
- `ms-playwright/` — Chromium browser cache
- `sf-uat.sqlite` — runs/imports/orgs history

## Troubleshooting

- **`INVALID_LOGIN` from Salesforce** — verify the login URL (`https://login.salesforce.com` vs `https://test.salesforce.com`), that the username includes any `.sandbox` suffix, and that the security token is set (reset it from Salesforce → Personal Info → Reset My Security Token).
- **`MODULE_NOT_FOUND @playwright/test`** — run `npm install` again; the runner injects `NODE_PATH` automatically so the generated spec can resolve the package outside the project folder.
- **`browserType.launch: Executable doesn't exist`** — re-run the Chromium install command above, or just launch the app once and wait for it to auto-install.
- **Gemini `429: limit: 0`** — `gemini-2.5-pro` isn't available on Google's free tier. Switch to `gemini-2.5-flash` in Settings, enable billing, or switch provider to Claude / ChatGPT.
