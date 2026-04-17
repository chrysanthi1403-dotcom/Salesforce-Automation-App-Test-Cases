import type { AIConfig } from '../../../../shared/types'
import { SecretsService } from '../secrets'
import { AnthropicProvider } from './anthropic'
import { GeminiProvider } from './gemini'
import { OpenAIProvider } from './openai'
import type { LLMProvider } from './types'

export async function createProvider(cfg: AIConfig): Promise<LLMProvider> {
  const apiKey = await SecretsService.getApiKey(cfg.provider)
  if (!apiKey) {
    throw new Error(
      `Missing API key for ${cfg.provider}. Set it in Settings before running.`
    )
  }
  if (cfg.provider === 'anthropic') return new AnthropicProvider(apiKey, cfg.model)
  if (cfg.provider === 'gemini') return new GeminiProvider(apiKey, cfg.model)
  if (cfg.provider === 'openai') return new OpenAIProvider(apiKey, cfg.model)
  throw new Error(`Unknown provider: ${String(cfg.provider)}`)
}

export function extractJson(text: string): string {
  let t = text.trim()
  if (t.startsWith('```')) {
    t = t.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim()
  }
  const firstBrace = t.indexOf('{')
  const lastBrace = t.lastIndexOf('}')
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    t = t.slice(firstBrace, lastBrace + 1)
  }
  return t
}

export type { LLMProvider } from './types'
