import Anthropic from '@anthropic-ai/sdk'
import type { LLMGenerateOptions, LLMProvider } from './types'

export class AnthropicProvider implements LLMProvider {
  readonly name = 'anthropic' as const
  private client: Anthropic
  private model: string

  constructor(apiKey: string, model: string) {
    this.client = new Anthropic({ apiKey })
    this.model = model
  }

  async generate(opts: LLMGenerateOptions): Promise<string> {
    const res = await this.client.messages.create({
      model: this.model,
      max_tokens: opts.maxTokens ?? 8000,
      temperature: opts.temperature ?? 0.2,
      system: opts.system,
      messages: [
        {
          role: 'user',
          content: opts.expectJson
            ? `${opts.prompt}\n\nReturn ONLY valid JSON. No commentary, no code fences.`
            : opts.prompt
        }
      ]
    })
    const text = res.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('\n')
      .trim()
    return text
  }
}
