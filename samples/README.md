# Sample UAT test cases

Use these to smoke-test the app end-to-end on any Salesforce org.

## `sample-uat.csv`

A flat CSV you can open in Excel and save as `.xlsx`. It contains five test cases that exercise different Salesforce patterns and work on any org (Production, Sandbox, or Developer Edition):

1. **TC-001 · Login and open App Launcher** — proves the generated script can log in and navigate Lightning.
2. **TC-002 · Create a Contact** — proves the AI can read org metadata and write+save a standard record.
3. **TC-003 · View Custom Metadata Types in Setup** — exercises Setup navigation via Quick Find and validates a read-only admin page.
4. **TC-004 · Create a Lead** — repeats the CRUD flow on a different standard object to confirm the generic "New → fill → Save" pattern scales across sObjects.
5. **TC-005 · Search for a record via global search** — exercises the Lightning global search header (different UI surface than record pages).

### To use

1. Open `sample-uat.csv` in Excel.
2. Save As → `.xlsx` format (e.g. `sample-uat.xlsx`).
3. In the app: **New Run** → pick `sample-uat.xlsx` → pick your org → Generate & Run.
4. Watch each test case execute in headed Chromium.

### Notes per test case

- **TC-002 / TC-004**: require the running user to have Create permission on Contact / Lead. If the profile is restricted, drop those rows.
- **TC-003**: works on any org; the Custom Metadata Types page is part of standard Setup and is visible to users with the "View Setup and Configuration" permission.
- **TC-005**: searches for the string "Acme" (a common seed record). If the org has no such data the search results page will still load — the test only validates that the search UI works, not that matches exist.

### Add your own

Columns are: `Test Case ID, Title, Step, Action, Data, Expected Result`. Keep all rows for a single test case together (same Test Case ID) and number steps starting at 1. The AI reads each row, so write Actions like a human tester would — short, imperative, and referring to labels the user sees on screen.
