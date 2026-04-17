export interface LLMGenerateOptions {
  system: string
  prompt: string
  /** When true, ask the model for strict JSON output. */
  expectJson?: boolean
  maxTokens?: number
  temperature?: number
}

export interface LLMProvider {
  readonly name: 'anthropic' | 'gemini' | 'openai'
  generate(opts: LLMGenerateOptions): Promise<string>
}
