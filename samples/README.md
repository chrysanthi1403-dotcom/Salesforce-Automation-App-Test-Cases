# Sample UAT test cases

Use these to smoke-test the app end-to-end on any Salesforce org.

## `sample-uat.csv`

A flat CSV you can open in Excel and save as `.xlsx`. It contains two minimal test cases that work on any org (Production, Sandbox, or Developer Edition):

1. **TC-001 · Login and open App Launcher** — proves the generated script can log in and navigate Lightning.
2. **TC-002 · Create a Contact** — proves the AI can read org metadata and write+save a standard record.

### To use

1. Open `sample-uat.csv` in Excel.
2. Save As → `.xlsx` format (e.g. `sample-uat.xlsx`).
3. In the app: **New Run** → pick `sample-uat.xlsx` → pick your org → Generate & Run.
4. Watch both test cases execute in headed Chromium.

If TC-002 fails because your user doesn't have Contact permissions, delete that row and keep only TC-001.
