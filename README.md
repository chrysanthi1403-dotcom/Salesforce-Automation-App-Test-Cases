# Salesforce UAT Auto Runner

Desktop app (Electron + React + Playwright) that reads UAT test cases from an Excel/CSV file, uses an LLM (Claude, ChatGPT, or Gemini) plus Salesforce org metadata to generate Playwright scripts for each case, runs them in headed Chromium, and keeps an auditable history per org.

Two-phase AI design: the LLM is used **at authoring time** to understand the Excel and write deterministic Playwright locators. At runtime Playwright drives the browser without AI, unless **self-healing** is enabled — in which case a locator failure triggers a single screenshot-based vision call to recover.

## What it does

1. You pick an Excel/CSV file with UAT test cases (any reasonable layout — the AI normalizes it).
2. You pick a saved Salesforce org (username/password, optionally a security token).
3. The app connects to the org via jsforce, pulls object/field metadata, and prompts the LLM to generate one Playwright `.spec.ts` per test case with Lightning-friendly locators and assertions on the expected results.
4. The generated specs are saved under the user-data folder (`generated/<org-alias>/<import-id>/`) and previewed in the UI.
5. End users hit **Run** on a test case, watch the browser execute it live, and get pass/fail plus screenshots/trace as evidence.
6. All runs are stored in a local SQLite DB for a per-org history view.

## Key features

- **Any spreadsheet layout** — xlsx / xls / xlsm / csv / tsv. The normalizer LLM figures out what's a test case, steps, and expected results.
- **Any Salesforce org** — dev, sandbox, MyDomain. Metadata (objects, fields, record types) is fetched live via `jsforce` per run.
- **Three AI providers** — Claude (Anthropic), ChatGPT (OpenAI), Gemini (Google). Pick per run; keys stored in the OS keychain.
- **Deterministic locators first** — role / label / text priority, direct `/lightning/o/<Object>/list` navigation, strict-mode safe.
- **Self-healing (opt-in)** — when a locator drifts, the helper screenshots the page and asks your vision model for a replacement, then retries once. Hard per-run cap so cost stays bounded. Disabled by default.
- **Calibrate (opt-in)** — one-time headed run against an org that captures real button labels and form fields for chosen objects; used as extra context for future script generation.
- **Live progress + evidence** — stream logs, screenshots per step, full Playwright trace/video on failure.

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

### Optional: self-healing and Calibrate

Both are off by default and live in **Settings**.

**Self-healing (AI vision fallback)** — when any `uat.click` / `uat.fill` wrapper in a generated spec fails (e.g. Salesforce renamed a button, a custom LWC appeared), the helper takes a screenshot, sends it to your configured provider with a short natural-language description of the target element, and retries once with the locator the model suggests. The default safety cap is 6 fallbacks per run, configurable in Settings. AI is never called on successful runs.

**Calibrate org** — opens a visible Chromium against a chosen org, logs in, visits `/lightning/o/<Api>/list` and `/new` for the objects you specify (`Account, Contact, Lead, Opportunity, Case` by default), and records the actual button labels and form field labels into `userData/calibrations/<orgId>.json`. The generator includes this snapshot as extra context when generating scripts, so locators match whatever your org actually shows (including renamed standard fields and custom objects). Re-run it whenever you make significant UI/metadata changes.

## Packaging

```bash
npm run package:mac    # or package:win / package:linux
```

Chromium is downloaded on first launch of the packaged app into `userData/ms-playwright`, so end users do not need Playwright installed globally.

## Security

- Org credentials and AI API keys are stored in the OS keychain via `keytar`. They never touch disk in plaintext.
- Generated Playwright specs read credentials only from environment variables (`SF_USERNAME`, `SF_PASSWORD`, `SF_SECURITY_TOKEN`, `SF_LOGIN_URL`) that the runner injects at execution time.
- When self-healing is enabled, the runner additionally injects `SF_AI_PROVIDER`, `SF_AI_MODEL`, `SF_AI_VISION_MODEL`, `SF_AI_API_KEY` and `SF_AI_MAX_FALLBACKS` into the Playwright child process. The key never leaves the local process.
- The renderer runs with `contextIsolation: true`, `nodeIntegration: false`, and a strict CSP.

## Project layout

```
electron/
  main/                Electron main process
    services/
      ai/              Unified LLM client (Anthropic, Gemini, OpenAI) + vision
      healing/         Template for the _uat.ts helper dropped into every run
      calibration.ts   Headed capture of real org labels / fields
      excel.ts         Spreadsheet parsing
      normalizer.ts    LLM pass #1: raw rows → structured TestSuite
      salesforce.ts    jsforce metadata fetch
      generator.ts     LLM pass #2: TestSuite + metadata → .spec.ts files
      runner.ts        Spawns Playwright, streams progress, injects env vars
      history.ts       SQLite repositories (orgs, imports, runs, steps)
      settings.ts, secrets.ts, paths.ts, browsers.ts
    index.ts
    ipc.ts
  preload/             Typed contextBridge API
shared/                Types + IPC channel constants shared main ↔ renderer
src/                   React renderer (pages, components, UI primitives)
samples/               Example UAT CSV for smoke testing
setup.sh               One-shot installer
```

Generated outputs and evidence live inside Electron's `userData`:

- `generated/<orgAlias>/<importId>/` — `.spec.ts` files, `_uat.ts` helper, `playwright.config.ts`, `test-cases.json`, `README.md`
- `evidence/<runId>/` — screenshots, trace.zip, videos on failure
- `calibrations/<orgId>.json` — optional snapshot captured by **Calibrate org**
- `ms-playwright/` — Chromium browser cache
- `sf-uat.sqlite` — runs/imports/orgs history

## Troubleshooting

- **`INVALID_LOGIN` from Salesforce** — verify the login URL (`https://login.salesforce.com` vs `https://test.salesforce.com`), that the username includes any `.sandbox` suffix, and that the security token is set (reset it from Salesforce → Personal Info → Reset My Security Token). MFA / SSO users will fail at this step — use a non-MFA integration user or IP-whitelist the machine.
- **"Verify your identity" screen during a run, then redirected back to login** — Salesforce treats each Playwright browser profile as a brand-new device and demands an email / SMS verification code. Switch **Settings → Salesforce login → Frontdoor** (the default). The runner logs in via the SOAP API in the background (username + password + security token) and then jumps the browser straight into the authenticated Lightning home page via `/secur/frontdoor.jsp?sid=...`, which skips verification challenges and MFA entirely. IPv6 whitelisting in Salesforce does **not** help here — Salesforce Network Access only matches IPv4.
- **`MODULE_NOT_FOUND @playwright/test`** — run `npm install` again; the runner injects `NODE_PATH` automatically so the generated spec can resolve the package outside the project folder.
- **`browserType.launch: Executable doesn't exist`** — re-run the Chromium install command above, or just launch the app once and wait for it to auto-install.
- **`strict mode violation: ... resolved to 2 elements`** — Salesforce repeats generic button labels ("View All", "New", "Save") across the page. Re-run **New Run** so the latest generator prompt emits disambiguated locators (scoped to a dialog or using the full accessible name). If the failure persists, turn on **Self-healing** in Settings.
- **Pipeline stuck on "Parsing Excel"** — the LLM normalization step is still running. Check the Pipeline progress panel: any error (missing API key, exceeded quota, invalid JSON) is surfaced there with the exact message.
- **Gemini `429: limit: 0`** — `gemini-2.5-pro` isn't available on Google's free tier. Switch to `gemini-2.5-flash` in Settings, enable billing, or switch provider to Claude / ChatGPT.
- **Self-healing never fires** — confirm the toggle is on in **Settings → Self-healing**, an API key is stored for the selected provider, and the generated spec uses `uat.click` / `uat.fill` (older runs generated before the upgrade will still use raw Playwright calls — just regenerate via **New Run**).
- **Calibrate opens the browser and stops at login** — same as `INVALID_LOGIN`: verify creds and MFA status. The browser window stays open so you can see exactly where it stopped.
