import { LLM, LLMMessage, callLLM } from '../config/index.js';
import { ChartSpec, ChartSpecSchema } from '../schema.js';

export interface DataProfile {
  columns: string[];
  types: Record<string, string>;
}

export interface AgentConfig {
  temperature: number;
  maxTokens: number;
  sampleSize: number;
  debugMode: boolean;
  model?: string;
}

const INTENT_SPEC_SYSTEM_PROMPT = `You are a chart specification generator. Your task is to output a chart specification JSON based on the user's request.

Parse the USER'S PROMPT to understand what they want, then match to fields from the provided data columns.

OUTPUT FORMAT:
{
  "chartType": "bar",
  "xAxis": {"field": "field_name", "label": "Label"},
  "yAxis": {"field": "field_name", "label": "Label", "aggregation": "count|sum|avg"},
  "series": {"field": "field_name", "label": "Label"} | null,
  "options": {"title": "Title"},
  "params": {
    "timeField": "date_field",
    "timeRange": {"type": "relative", "value": 1, "unit": "years"},
    "filters": [],
    "limit": null,
    "sort": {"field": "field", "direction": "desc"}
  }
}

RULES:
- Use "avg" aggregation when user says "average"
- Use "years" unit when user says "year"
- Use series for breakdown when user says "by X with Y breakdown"
- NEVER use email/id fields for charts unless explicitly requested
- Match user keywords to relevant field names from data`;

export class IntentSpecAgent {
  private llm: LLM;
  private config: AgentConfig;

  constructor(llm: LLM, config: AgentConfig) {
    this.llm = llm;
    this.config = config;
  }

  private estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }

  private buildFallbackSpec(prompt: string, profile: DataProfile): ChartSpec {
    const lowerPrompt = prompt.toLowerCase();
    const stringCols = profile.columns.filter(c => profile.types[c] === 'string');
    const numCols = profile.columns.filter(c => profile.types[c] === 'number');
    const dateCols = profile.columns.filter(c => profile.types[c] === 'date');
    
    // Use first string col for x, first num col for y - let user refine
    const xField = stringCols[0] || profile.columns[0];
    const yField = numCols[0];
    const seriesField = stringCols[1];
    
    let aggregation: 'count' | 'sum' | 'avg' = 'count';
    if (lowerPrompt.includes('average') || lowerPrompt.includes('avg')) {
      aggregation = 'avg';
    } else if (yField) {
      aggregation = 'sum';
    }

    let timeRange: { type: 'relative'; value: number; unit: 'days' | 'weeks' | 'months' | 'years' } | undefined = undefined;
    if (lowerPrompt.includes('year')) {
      timeRange = { type: 'relative', value: 1, unit: 'years' };
    } else if (lowerPrompt.includes('month')) {
      timeRange = { type: 'relative', value: 1, unit: 'months' };
    }

    return {
      chartType: 'bar',
      xAxis: { field: xField, label: xField },
      yAxis: { field: yField || 'count', label: yField || 'Count', aggregation },
      series: seriesField ? { field: seriesField, label: seriesField } : undefined,
      options: { title: prompt },
      params: {
        timeField: dateCols[0] || undefined,
        timeRange,
        filters: undefined,
        limit: undefined,
        sort: undefined
      }
    };
  }

  private parseLLMResponse(content: string): any {
    content = content.replace(/```json\s*/g, '').replace(/```\s*/g, '');
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    try {
      return JSON.parse(jsonMatch[0]);
    } catch {
      return null;
    }
  }

  private validateSpec(parsed: any): boolean {
    return !!(parsed?.xAxis?.field && parsed?.yAxis?.field);
  }

  async run(
    prompt: string,
    profile: DataProfile,
    sampleData: Record<string, unknown>[]
  ): Promise<{ spec: ChartSpec }> {
    const columns = profile.columns.join(', ');
    const types = JSON.stringify(profile.types);
    
    const systemPromptTokens = this.estimateTokens(INTENT_SPEC_SYSTEM_PROMPT);
    const promptTokens = this.estimateTokens(prompt);
    const dataTokens = this.estimateTokens(`COLUMNS: ${columns}\nTYPES: ${types}`);
    
    const maxContextTokens = 32000;
    const reservedTokens = 2000;
    const availableTokens = maxContextTokens - systemPromptTokens - promptTokens - dataTokens - reservedTokens;
    
    let sampleSize = Math.floor(availableTokens / 200);
    sampleSize = Math.max(10, Math.min(sampleSize, 30));
    sampleSize = Math.min(sampleSize, sampleData.length);
    
    const reducedSample = sampleData.slice(0, sampleSize);
    
    const userPrompt = `USER: ${prompt}

COLUMNS: ${columns}
TYPES: ${types}

SAMPLE:
${JSON.stringify(reducedSample, null, 2)}

Respond only with JSON.`;

    const messages: LLMMessage[] = [
      { role: 'system', content: INTENT_SPEC_SYSTEM_PROMPT },
      { role: 'user', content: userPrompt },
    ];

    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const response = await callLLM(this.llm, messages, {
          temperature: this.config.temperature,
          maxTokens: this.config.maxTokens,
        });

        const parsed = this.parseLLMResponse(response.content);
        if (!parsed) {
          continue;
        }

        console.log('Parsed LLM response:', JSON.stringify(parsed));

        if (!this.validateSpec(parsed)) {
          continue;
        }

        const spec = ChartSpecSchema.parse({
          chartType: parsed.chartType,
          xAxis: {
            field: parsed.xAxis?.field,
            label: parsed.xAxis?.label,
            type: parsed.xAxis?.type,
            aggregation: parsed.xAxis?.aggregation,
          },
          yAxis: {
            field: parsed.yAxis?.field,
            label: parsed.yAxis?.label,
            type: parsed.yAxis?.type,
            aggregation: parsed.yAxis?.aggregation,
          },
          series: parsed.series ?? undefined,
          options: parsed.options ?? undefined,
          params: {
            timeField: parsed.params?.timeField ?? undefined,
            timeRange: parsed.params?.timeRange ?? undefined,
            filters: parsed.params?.filters ?? undefined,
            limit: parsed.params?.limit ?? undefined,
            sort: parsed.params?.sort ?? undefined,
          },
        });

        return { spec };
      } catch (error) {
        console.error(`Attempt ${attempt} failed:`, error);
        
        if (attempt === 1) {
          messages[1].content = `USER: ${prompt}\n\nCOLUMNS: ${columns}\n\nRespond with JSON: {"chartType":"bar","xAxis":{"field":"col","label":"L"},"yAxis":{"field":"col","label":"L","aggregation":"count"},"series":null,"options":{},"params":{}}`;
        }
      }
    }

    console.warn('Using fallback spec from data profile');
    const fallbackSpec = this.buildFallbackSpec(prompt, profile);
    return { spec: fallbackSpec };
  }
}
