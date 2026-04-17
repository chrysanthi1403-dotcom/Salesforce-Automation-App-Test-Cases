# Salesforce UAT Auto Runner

Desktop app (Electron + React + Playwright) that reads UAT test cases from an Excel file, uses an LLM (Claude or Gemini) plus Salesforce org metadata to generate Playwright scripts for each case, runs them in headed Chromium, and keeps an auditable history per org.

## What it does

1. You pick an Excel file with UAT test cases (any reasonable layout — the AI normalizes it).
2. You pick a saved Salesforce org (username/password, optionally a security token).
3. The app connects to the org via jsforce, pulls object/field metadata, and prompts the LLM to generate one Playwright `.spec.ts` per test case with Lightning-friendly locators and assertions on the expected results.
4. The generated specs are saved under the user-data folder (`generated/<org-alias>/<import-id>/`) and previewed in the UI.
5. End users hit "Run" on a test case, watch the browser execute it live, and get pass/fail plus screenshots/trace as evidence.
6. All runs are stored in a local SQLite DB for a per-org history view.

## Requirements

- Node.js 20+
- macOS, Windows, or Linux
- API key for either Anthropic (Claude) or Google (Gemini)
- Salesforce org credentials (username + password; a security token is appended automatically if you provide one)

## Getting started (development)

```bash
npm install
npx playwright install chromium
npm run dev
```

The first run opens the Electron window. Go to **Settings**, paste your API key, then **Orgs** to add a Salesforce org, then **New Run** to import an Excel and generate scripts.

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
```

Generated outputs and evidence live inside Electron's `userData`:

- `generated/<orgAlias>/<importId>/` — `.spec.ts` files, `playwright.config.ts`, `test-cases.json`, `README.md`
- `evidence/<runId>/` — screenshots, trace.zip, videos on failure
- `sf-uat.sqlite` — runs/imports/orgs history
