# Agent prompts and schema contracts

The app uses two LLM stages. Both go through the same `LLMProvider` abstraction in
[`electron/main/services/ai/`](electron/main/services/ai/), with Claude and Gemini implementations.

## Stage 1 — Excel → `TestSuite` JSON

Implemented in [`electron/main/services/normalizer.ts`](electron/main/services/normalizer.ts).

- System prompt emphasizes: extract distinct test cases, preserve IDs or generate `TC-NNN` slugs, merge split rows, ignore decoration rows.
- User prompt contains a textual preview of each sheet: headers + up to 40 sample rows with `key=value` per cell.
- Output is validated by Zod (`TestSuiteSchema`). Invalid or unparsable output throws a user-visible error.

## Stage 2 — `TestCase` + org metadata → Playwright `.spec.ts`

Implemented in [`electron/main/services/generator.ts`](electron/main/services/generator.ts).

- System prompt pins: ESM `@playwright/test` import, env-var credentials, Lightning-friendly locators in priority order, no hardcoded timeouts, `test.step` per action with a screenshot, `expect` assertions for expected results, strict 180s timeout.
- User prompt includes: org login URL, a compact metadata summary (top 30 objects × 20 fields each, plus record types), and the full test case JSON.
- Post-generation guardrails (`lintGeneratedSpec`) enforce the contract; a single retry is made with explicit repair instructions if any rule is violated.

## Data contracts

The canonical shapes shared main ↔ renderer live in [`shared/types.ts`](shared/types.ts):

- `TestSuite` → `TestCase[]` → `TestStep[]`
- `OrgProfile`, `ImportSummary`, `RunSummary`, `RunStep`
- `PipelineProgress`, `RunProgress` for live streaming over IPC

IPC channel names are centralized in [`shared/ipc.ts`](shared/ipc.ts) and exposed to the renderer through the preload bridge in [`electron/preload/index.ts`](electron/preload/index.ts).
