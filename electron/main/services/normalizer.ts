import { z } from 'zod'
import { extractJson, type LLMProvider } from './ai'
import type { ExcelExtraction } from './excel'
import type { TestSuite } from '../../../shared/types'

const TestStepSchema = z.object({
  order: z.number().int().min(1),
  action: z.string().min(1),
  data: z.record(z.string()).nullable().optional(),
  expectedResult: z.string().nullable().optional()
})

const TestCaseSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  preconditions: z.string().nullable().optional(),
  steps: z.array(TestStepSchema).min(1),
  postconditions: z.string().nullable().optional()
})

const TestSuiteSchema = z.object({
  testCases: z.array(TestCaseSchema).min(1)
})

const SYSTEM_PROMPT = `You are a meticulous QA analyst who converts messy Excel UAT test cases into a clean, structured JSON test suite.

Rules:
- Identify each distinct test case (there may be multiple per sheet or split across sheets).
- Preserve original test case IDs if present; otherwise generate stable slugs like TC-001, TC-002.
- Extract per-step: order (integer starting at 1), action (imperative instruction), data (optional key/value pairs the user must enter), expectedResult (optional).
- Merge split rows that belong to the same step.
- Ignore header/decoration rows that are not actual test data.
- Output must match the requested JSON schema exactly.`

const USER_PROMPT_TEMPLATE = (preview: string): string => `You will receive a textual preview of an Excel workbook with UAT test cases for Salesforce. Convert it into this JSON shape (no extra fields):

{
  "testCases": [
    {
      "id": "string",
      "title": "string",
      "preconditions": "string | null",
      "steps": [
        { "order": 1, "action": "string", "data": { "Field": "Value" } | null, "expectedResult": "string | null" }
      ],
      "postconditions": "string | null"
    }
  ]
}

WORKBOOK PREVIEW:
---
${preview}
---

Return ONLY the JSON object.`

export async function normalizeTestSuite(
  provider: LLMProvider,
  extraction: ExcelExtraction
): Promise<TestSuite> {
  const raw = await provider.generate({
    system: SYSTEM_PROMPT,
    prompt: USER_PROMPT_TEMPLATE(extraction.preview),
    expectJson: true,
    maxTokens: 8000,
    temperature: 0.1
  })
  const cleaned = extractJson(raw)
  let parsed: unknown
  try {
    parsed = JSON.parse(cleaned)
  } catch (e) {
    throw new Error(`LLM returned invalid JSON for test suite: ${(e as Error).message}`)
  }
  const result = TestSuiteSchema.safeParse(parsed)
  if (!result.success) {
    throw new Error(
      `Test suite JSON failed validation: ${result.error.issues
        .map((i) => `${i.path.join('.')}: ${i.message}`)
        .join('; ')}`
    )
  }
  return {
    testCases: result.data.testCases.map((tc) => ({
      ...tc,
      preconditions: tc.preconditions ?? null,
      postconditions: tc.postconditions ?? null,
      steps: tc.steps.map((s) => ({
        ...s,
        data: s.data ?? null,
        expectedResult: s.expectedResult ?? null
      }))
    }))
  }
}

export { TestSuiteSchema }
