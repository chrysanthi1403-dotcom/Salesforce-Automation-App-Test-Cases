import { GoogleGenerativeAI } from '@google/generative-ai'
import type { LLMGenerateOptions, LLMProvider } from './types'

export class GeminiProvider implements LLMProvider {
  readonly name = 'gemini' as const
  private client: GoogleGenerativeAI
  private modelName: string

  constructor(apiKey: string, model: string) {
    this.client = new GoogleGenerativeAI(apiKey)
    this.modelName = model
  }

  async generate(opts: LLMGenerateOptions): Promise<string> {
    const model = this.client.getGenerativeModel({
      model: this.modelName,
      systemInstruction: opts.system,
      generationConfig: {
        temperature: opts.temperature ?? 0.2,
        maxOutputTokens: opts.maxTokens ?? 8000,
        responseMimeType: opts.expectJson ? 'application/json' : 'text/plain'
      }
    })
    const res = await model.generateContent(opts.prompt)
    return res.response.text().trim()
  }
}
