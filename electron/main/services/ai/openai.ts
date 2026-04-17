import OpenAI from 'openai'
import type { LLMGenerateOptions, LLMProvider } from './types'

export class OpenAIProvider implements LLMProvider {
  readonly name = 'openai' as const
  private client: OpenAI
  private model: string

  constructor(apiKey: string, model: string) {
    this.client = new OpenAI({ apiKey })
    this.model = model
  }

  async generate(opts: LLMGenerateOptions): Promise<string> {
    const userContent = opts.expectJson
      ? `${opts.prompt}\n\nReturn ONLY valid JSON. No commentary, no code fences.`
      : opts.prompt

    const messages: Array<{ role: 'system' | 'user'; content: string }> = [
      { role: 'system', content: opts.system },
      { role: 'user', content: userContent }
    ]

    const res = await this.client.chat.completions.create({
      model: this.model,
      messages,
      max_tokens: opts.maxTokens ?? 8000,
      temperature: opts.temperature ?? 0.2,
      stream: false,
      ...(opts.expectJson ? { response_format: { type: 'json_object' as const } } : {})
    })
    const text = res.choices?.[0]?.message?.content?.trim() ?? ''
    return text
  }
}
