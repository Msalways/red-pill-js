export interface RedpillConfig {
  temperature: number;
  maxTokens: number;
  sampleSize: number;
  debugMode: boolean;
}

export interface LLMOptions {
  temperature?: number;
  maxTokens?: number;
}

export interface LLMMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LLMResponse {
  content: string;
}

export type LLMFunction = (
  messages: LLMMessage[],
  options?: LLMOptions
) => Promise<LLMResponse>;

export type LLM = LLMFunction;

export async function callLLM(
  llm: LLM,
  messages: LLMMessage[],
  options?: LLMOptions
): Promise<LLMResponse> {
  if (typeof llm === 'function') {
    return llm(messages, options);
  }

  throw new Error(
    'LLM must be a function. Use .setLlm(async (messages, options) => { your_llm_call(messages, options) })'
  );
}

export class RedpillConfigBuilder {
  private config: RedpillConfig = {
    temperature: 0.1,
    maxTokens: 4000,
    sampleSize: 100,
    debugMode: false,
  };

  private _llm: LLM | null = null;

  llm(llm: LLM): this {
    this._llm = llm;
    return this;
  }

  temperature(temperature: number): this {
    this.config.temperature = temperature;
    return this;
  }

  maxTokens(maxTokens: number): this {
    this.config.maxTokens = maxTokens;
    return this;
  }

  sampleSize(sampleSize: number): this {
    this.config.sampleSize = sampleSize;
    return this;
  }

  debugMode(debugMode: boolean): this {
    this.config.debugMode = debugMode;
    return this;
  }

  build(): RedpillConfig & { llm: LLM } {
    if (!this._llm) {
      throw new Error('Please provide an LLM function using .llm()');
    }
    return { ...this.config, llm: this._llm };
  }
}
