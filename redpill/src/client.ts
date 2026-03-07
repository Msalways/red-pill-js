import { LLM, RedpillConfigBuilder, RedpillConfig } from './config/index.js';
import { ChartSpec, ChartDataResult } from './schema.js';
import { PolarsExecutor } from './executor.js';
import { PolarsProcessor } from './processor.js';
import { IntentSpecAgent } from './agents/index.js';

export class Redpill {
  private llm: LLM | null = null;
  private config: RedpillConfig;
  private processor: PolarsProcessor;
  private executor: PolarsExecutor;

  constructor() {
    this.config = {
      temperature: 0.1,
      maxTokens: 4000,
      sampleSize: 100,
      debugMode: false,
    };
    this.processor = new PolarsProcessor();
    this.executor = new PolarsExecutor();
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
      throw new Error('Please call .setLlm(yourLlm).build() first');
    }
    if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
      throw new Error('prompt must be a non-empty string');
    }
    if (data === null || data === undefined) {
      throw new Error('data must not be null or undefined');
    }

    const { profile, flat_data } = this.processor.process(data);
    
    if (!flat_data || flat_data.length === 0) {
      throw new Error('data contains no records — please provide a non-empty array or object with an array property');
    }

    const agent = new IntentSpecAgent(this.llm, this.config);
    return agent.run(prompt, profile, flat_data);
  }

  execute(spec: ChartSpec, data: Record<string, unknown>): ChartDataResult {
    if (data === null || data === undefined) {
      throw new Error('data must not be null or undefined');
    }
    return this.executor.execute(spec, data);
  }
}

export type { ChartSpec, ChartDataResult };
