import { LLM, RedpillConfigBuilder, RedpillConfig } from './config/index.js';
import { ChartSpec, ChartDataResult } from './schema.js';
import { Executor } from './executor.js';
import { DataFlattener, DataNormalizer } from './processor.js';
import { IntentSpecAgent, DataProfile } from './agents/index.js';

export class Redpill {
  private llm: LLM | null = null;
  private config: RedpillConfig;
  private flattener: DataFlattener;
  private normalizer: DataNormalizer;

  constructor() {
    this.config = {
      temperature: 0.7,
      maxTokens: 4000,
      sampleSize: 100,
      debugMode: false,
    };
    this.flattener = new DataFlattener();
    this.normalizer = new DataNormalizer();
  }

  /**
   * Set your LLM function.
   * 
   * The function receives (messages, options) and must return { content: string }.
   * You have full control over model, temperature, max_tokens, etc.
   * 
   * Example with OpenAI via OpenRouter:
   *   import OpenAI from 'openai';
   *   
   *   const client = new OpenAI({
   *     apiKey: 'your-key',
   *     baseURL: 'https://openrouter.ai/api/v1'
   *   });
   *   
   *   const rp = new Redpill()
   *     .setLlm(async (messages, options) => {
   *       const response = await client.chat.completions.create({
   *         model: 'openai/gpt-4o-mini',  // Your model choice
   *         messages,
   *         temperature: options?.temperature ?? 0.7,
   *         max_tokens: options?.maxTokens ?? 4000,
   *       });
   *       return { content: response.choices[0].message.content };
   *     })
   *     .build();
   * 
   * Example with Anthropic:
   *   import { Anthropic } from '@anthropic-ai/sdk';
   *   
   *   const client = new Anthropic({ apiKey: 'your-key' });
   *   
   *   const rp = new Redpill()
   *   .setLlm(async (messages, options) => {
   *     const response = await client.messages.create({
   *       model: 'claude-3-5-sonnet-20241022',
   *       messages: messages.map(m => ({ role: m.role, content: m.content })),
   *       temperature: options?.temperature ?? 0.7,
   *       max_tokens: options?.maxTokens ?? 4000,
   *     });
   *     return { content: response.content[0].text };
   *   })
   *   .build();
   */
  setLlm(llm: LLM): this {
    this.llm = llm;
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

  build(): this {
    if (!this.llm) {
      throw new Error(
        'Please provide an LLM function using .setLlm(async (messages, options) => { your_llm_call(messages, options) })'
      );
    }
    return this;
  }

  async generateSpec(
    data: Record<string, unknown>,
    prompt: string
  ): Promise<{ spec: ChartSpec }> {
    if (!this.llm) {
      throw new Error('Please call .llm(yourLlm).build() first');
    }

    const flatData = this.flattenData(data);
    const profile = this.getDataProfile(flatData);

    const agent = new IntentSpecAgent(this.llm, this.config);
    return agent.run(prompt, profile, flatData);
  }

  execute(spec: ChartSpec, data: Record<string, unknown>): ChartDataResult {
    const flatData = this.flattenData(data);
    const executor = new Executor();
    return executor.execute(spec, flatData);
  }

  private flattenData(data: Record<string, unknown>): Record<string, unknown>[] {
    if (Array.isArray(data)) {
      return data.map((item) => this.flattenObject(item));
    }

    if (typeof data === 'object' && data !== null) {
      for (const value of Object.values(data)) {
        if (Array.isArray(value)) {
          return value.map((item) => this.flattenObject(item));
        }
      }
    }

    return [this.flattenObject(data)];
  }

  private flattenObject(obj: unknown, prefix = ''): Record<string, unknown> {
    const result: Record<string, unknown> = {};

    if (typeof obj !== 'object' || obj === null) {
      return result;
    }

    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      const newKey = prefix ? `${prefix}.${key}` : key;

      if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
        Object.assign(result, this.flattenObject(value, newKey));
      } else if (!Array.isArray(value)) {
        result[newKey] = value;
      }
    }

    return result;
  }

  private getDataProfile(data: Record<string, unknown>[]): DataProfile {
    if (!data.length) {
      return { columns: [], types: {} };
    }

    const columns = Object.keys(data[0]);
    const types: Record<string, string> = {};

    for (const col of columns) {
      const value = data[0][col];
      if (typeof value === 'number') {
        types[col] = 'number';
      } else if (typeof value === 'string' && !isNaN(Date.parse(value))) {
        types[col] = 'date';
      } else {
        types[col] = 'string';
      }
    }

    return { columns, types };
  }
}

export type { ChartSpec, ChartDataResult };
