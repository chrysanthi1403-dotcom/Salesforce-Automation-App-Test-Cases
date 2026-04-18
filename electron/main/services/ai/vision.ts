import type { AIProvider } from '../../../../shared/types'

/** Structured hint returned by a vision LLM to locate a single DOM element. */
export interface VisionLocatorHint {
  strategy:
    | 'role'
    | 'label'
    | 'text'
    | 'placeholder'
    | 'css'
    | 'xpath'
    | 'coordinates'
  /** ARIA role when strategy === 'role'. */
  role?: string
  /** Accessible name / label / text. */
  name?: string
  exact?: boolean
  nth?: number
  /** Raw CSS / XPath selector. */
  selector?: string
  /** Absolute viewport coordinates; last-resort. */
  x?: number
  y?: number
  /** Freeform reasoning from the model, for debugging. */
  reasoning?: string
}

export interface VisionRequest {
  screenshotPngBase64: string
  /** Human-readable description of the action and target element. */
  description: string
  /** e.g. 'click' | 'fill' | 'select'. */
  action: 'click' | 'fill' | 'select' | 'press' | 'locate'
  /** The URL of the page, useful context for the model. */
  url?: string
  /** Extra context: what has been tried deterministically. */
  previousAttempts?: string[]
}

const SYSTEM = `You are a Playwright locator assistant. Given a screenshot of a Salesforce Lightning page and a natural-language description of the UI element the caller wants to interact with, respond ONLY with a single JSON object describing the best way to find that element with Playwright.

Valid response shapes:
{"strategy":"role","role":"button","name":"Exact accessible name","exact":true}
{"strategy":"label","name":"Exact visible label"}
{"strategy":"text","name":"Exact visible text","exact":false}
{"strategy":"placeholder","name":"Placeholder text"}
{"strategy":"css","selector":"CSS selector"}
{"strategy":"xpath","selector":"//xpath/here"}
{"strategy":"coordinates","x":842,"y":196}

Rules:
- Prefer role > label > text > placeholder > css > xpath > coordinates.
- "name" must be the exact visible string you can see in the screenshot (including emoji, punctuation, Greek characters, etc.).
- If multiple elements match the same role+name, add "nth" (0-based) ONLY if the target is visually obvious.
- Coordinates are the absolute (x, y) in the screenshot pixels; use only as last resort when no accessible name/selector exists.
- Never invent IDs that contain numbers you are not sure exist in the DOM.
- Your response MUST be ONLY the JSON object, no prose, no markdown fences.`

export interface VisionProviderConfig {
  provider: AIProvider
  apiKey: string
  model: string
}

/**
 * Calls the configured vision LLM and returns a structured locator hint.
 * Uses `fetch` so the same code can run inside the Electron main process
 * AND inside a spawned Playwright child (where NPM SDKs may not resolve).
 */
export async function askVisionForLocator(
  cfg: VisionProviderConfig,
  req: VisionRequest
): Promise<VisionLocatorHint> {
  const userText = buildUserPrompt(req)
  const raw = await callProvider(cfg, userText, req.screenshotPngBase64)
  return parseVisionResponse(raw)
}

function buildUserPrompt(req: VisionRequest): string {
  const parts: string[] = []
  parts.push(`ACTION: ${req.action}`)
  parts.push(`TARGET DESCRIPTION: ${req.description}`)
  if (req.url) parts.push(`PAGE URL: ${req.url}`)
  if (req.previousAttempts?.length) {
    parts.push(`FAILED ATTEMPTS:\n${req.previousAttempts.map((a) => '- ' + a).join('\n')}`)
  }
  parts.push('Respond with ONLY a JSON object matching the schema.')
  return parts.join('\n')
}

async function callProvider(
  cfg: VisionProviderConfig,
  userText: string,
  imageB64: string
): Promise<string> {
  if (cfg.provider === 'anthropic') return callAnthropic(cfg, userText, imageB64)
  if (cfg.provider === 'openai') return callOpenAI(cfg, userText, imageB64)
  if (cfg.provider === 'gemini') return callGemini(cfg, userText, imageB64)
  throw new Error(`Unknown vision provider: ${String(cfg.provider)}`)
}

async function callAnthropic(
  cfg: VisionProviderConfig,
  userText: string,
  imageB64: string
): Promise<string> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': cfg.apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: cfg.model,
      max_tokens: 800,
      system: SYSTEM,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: { type: 'base64', media_type: 'image/png', data: imageB64 }
            },
            { type: 'text', text: userText }
          ]
        }
      ]
    })
  })
  if (!res.ok) throw new Error(`Anthropic vision error ${res.status}: ${await res.text()}`)
  const data = (await res.json()) as {
    content: Array<{ type: string; text?: string }>
  }
  const textBlock = data.content.find((b) => b.type === 'text')
  return textBlock?.text ?? ''
}

async function callOpenAI(
  cfg: VisionProviderConfig,
  userText: string,
  imageB64: string
): Promise<string> {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${cfg.apiKey}`
    },
    body: JSON.stringify({
      model: cfg.model,
      max_tokens: 800,
      temperature: 0.1,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: SYSTEM },
        {
          role: 'user',
          content: [
            { type: 'text', text: userText },
            {
              type: 'image_url',
              image_url: { url: `data:image/png;base64,${imageB64}` }
            }
          ]
        }
      ]
    })
  })
  if (!res.ok) throw new Error(`OpenAI vision error ${res.status}: ${await res.text()}`)
  const data = (await res.json()) as {
    choices: Array<{ message: { content: string } }>
  }
  return data.choices?.[0]?.message?.content ?? ''
}

async function callGemini(
  cfg: VisionProviderConfig,
  userText: string,
  imageB64: string
): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    cfg.model
  )}:generateContent?key=${encodeURIComponent(cfg.apiKey)}`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { role: 'system', parts: [{ text: SYSTEM }] },
      contents: [
        {
          role: 'user',
          parts: [
            { inline_data: { mime_type: 'image/png', data: imageB64 } },
            { text: userText }
          ]
        }
      ],
      generationConfig: {
        temperature: 0.1,
        responseMimeType: 'application/json'
      }
    })
  })
  if (!res.ok) throw new Error(`Gemini vision error ${res.status}: ${await res.text()}`)
  const data = (await res.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>
  }
  return data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? ''
}

function parseVisionResponse(raw: string): VisionLocatorHint {
  let text = raw.trim()
  if (text.startsWith('```')) {
    text = text.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim()
  }
  const firstBrace = text.indexOf('{')
  const lastBrace = text.lastIndexOf('}')
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    text = text.slice(firstBrace, lastBrace + 1)
  }
  const parsed = JSON.parse(text) as VisionLocatorHint
  if (!parsed || typeof parsed !== 'object' || !parsed.strategy) {
    throw new Error(`Vision response missing "strategy": ${raw}`)
  }
  return parsed
}
