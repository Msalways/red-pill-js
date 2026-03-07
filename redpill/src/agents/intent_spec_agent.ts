import { LLM, LLMMessage, callLLM } from '../config/index.js';
import { ChartSpec, ChartSpecSchema } from '../schema.js';
import { DataProfile, ColInfo } from '../processor.js';

export interface AgentConfig {
  temperature: number;
  maxTokens: number;
  sampleSize: number;
  debugMode: boolean;
  model?: string;
}

const INTENT_SPEC_SYSTEM_PROMPT = `You are an expert data analyst specializing in chart generation. Your task is to analyze user requests and data profiles to create chart specifications.

GENERAL GUIDELINES:
- Analyze the user's natural language prompt to understand their intent
- Use the available field metadata to select the best fields for the chart
- Generate a chart specification that best answers the user's question
- Default to "count" aggregation unless user explicitly asks for sum/avg
- NEVER use email, id, uuid, or url fields as chart axes unless explicitly requested

OUTPUT FORMAT - Always output valid JSON only:
{
  "chartType": "bar",
  "xAxis": {"field": "field_name", "label": "Label", "type": "categorical|quantitative|time"},
  "yAxis": {"field": "count", "label": "Count", "aggregation": "count|sum|avg|min|max"},
  "series": {"field": "field_name", "label": "Label"} | null,
  "options": {"title": "Chart Title", "stacked": false},
  "params": {
    "timeField": "date_field_name" | null,
    "timeRange": {"type": "relative", "value": 1, "unit": "days|weeks|months|hours|minutes|years"} | null,
    "filters": [{"field": "field_name", "operator": "eq|ne|gt|gte|lt|lte|in|not_in|contains", "value": value}],
    "limit": null,
    "sort": {"field": "field", "direction": "asc|desc"} | null
  }
}

CHART TYPE SELECTION - Choose based on user intent:
- "bar" / "compare" / "comparison" → bar (default for comparisons)
- "horizontal_bar" / many categories / long labels → horizontal_bar
- "line" / "trend" / "over time" / "timeline" → line (use date field as xAxis)
- "area" → area (filled trend line)
- "pie" / "distribution" / "proportion" / "share" → pie (best for 5-7 categories)
- "donut" → donut (pie with hole)
- "scatter" / "correlation" / "relationship" → scatter
- "bubble" → bubble (scatter with third size variable)
- "radar" → radar (compare multiple metrics)
- "gauge" / "progress" / "percentage" / "completion" → gauge
- "funnel" / "stages" / "pipeline" / "conversion" → funnel
- "heatmap" → heatmap (intensity matrix)
- "treemap" → treemap (hierarchical data)
- "waterfall" / "flow" → waterfall
- "candlestick" → candlestick (financial OHLC data)

TIME-BASED TRENDS - CRITICAL RULE:
When the user mentions a time period (last month, last week, last year, etc.) WITHOUT explicitly asking "by category/status/region", ALWAYS:
- Use the date/time field as xAxis
- Use "line" or "area" as chartType
- Set timeField and timeRange in params
Only use category-based charts when user says "by status", "by category", "by region", etc.

SERIES / LEGEND DETECTION:
Add a series field when user wants data grouped by an extra dimension:
- "by X and Y" → X=xAxis, Y=series
- "by X with Y breakdown" → X=xAxis, Y=series
- "by X grouped by Y" → X=xAxis, Y=series
- "by X segmented by Y" → X=xAxis, Y=series
- Multiple 'by' clauses → first=xAxis, second=series
If series detected, use grouped/stacked bar or multi-line chart.

FILTER RULES - ALWAYS apply when user mentions conditions:
- Time periods (last N days/weeks/months) → use timeField + timeRange in params
  - timeRange.unit MUST be: "days", "weeks", "months", "hours", "minutes", or "years"
  - "last 2 days" → {"type":"relative","value":2,"unit":"days"}
  - "this week" → {"type":"relative","value":1,"unit":"weeks"}
  - "last month" → {"type":"relative","value":1,"unit":"months"}
- Conditions (">", "more than", "less than") → filters with gt/gte/lt/lte operator
- Specific values ("completed", "active") → filters with eq operator
- Multiple values ("pending or active") → filters with in operator

AGGREGATION:
- Default: "count"
- Use "avg" when user says "average"
- Use "sum" when user says "total" and a numeric field is available
- Use "min"/"max" when user says "minimum"/"maximum"`;

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

  // private buildFallbackSpec(prompt: string, profile: DataProfile): ChartSpec {
  //   const columns = Object.keys(profile.columns);
  //   const categoricalFields = profile.inferred?.categorical_fields || [];
  //   const stringCols = columns.filter(c => profile.columns[c]?.dtype === 'String');
  //   const numCols = columns.filter(c => profile.columns[c]?.dtype?.includes('Int') || profile.columns[c]?.dtype?.includes('Float'));
  //   const dateCols = columns.filter(c => profile.columns[c]?.dtype === 'Date' || profile.columns[c]?.dtype === 'Datetime');

  //   const xField = stringCols[0] || categoricalFields[0] || columns[0];
  //   const yField = numCols[0];
  //   const seriesField = stringCols[1];

  //   let aggregation: 'count' | 'sum' | 'avg' = 'count';
  //   const lowerPrompt = prompt.toLowerCase();
  //   if (lowerPrompt.includes('average') || lowerPrompt.includes('avg')) {
  //     aggregation = 'avg';
  //   } else if (yField) {
  //     aggregation = 'sum';
  //   }

  //   let timeRange: { type: 'relative'; value: number; unit: 'days' | 'weeks' | 'months' | 'years' } | undefined = undefined;
  //   if (lowerPrompt.includes('year')) {
  //     timeRange = { type: 'relative', value: 1, unit: 'years' };
  //   } else if (lowerPrompt.includes('month')) {
  //     timeRange = { type: 'relative', value: 1, unit: 'months' };
  //   }

  //   return {
  //     chartType: 'bar',
  //     xAxis: { field: xField, label: xField },
  //     yAxis: { field: yField || 'count', label: yField || 'Count', aggregation },
  //     series: seriesField ? { field: seriesField, label: seriesField } : undefined,
  //     options: { title: prompt },
  //     params: {
  //       timeField: dateCols[0] || undefined,
  //       timeRange,
  //       filters: undefined,
  //       limit: undefined,
  //       sort: undefined
  //     }
  //   };
  // }

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
    const columns = Object.keys(profile.columns);
    const categoricalFields = profile.inferred?.categorical_fields || [];
    const timeFields = profile.inferred?.time_fields || [];
    const numericFields = columns.filter(c => {
      const dtype = profile.columns[c]?.dtype || '';
      return dtype.includes('Int') || dtype.includes('Float') || dtype.includes('Float64');
    });

    const systemPromptTokens = this.estimateTokens(INTENT_SPEC_SYSTEM_PROMPT);
    const promptTokens = this.estimateTokens(prompt);
    const profileTokens = this.estimateTokens(`COLUMNS: ${columns.join(', ')}`);

    const maxContextTokens = 32000;
    const reservedTokens = 2000;
    const availableTokens = maxContextTokens - systemPromptTokens - promptTokens - profileTokens - reservedTokens;

    let sampleSize = Math.floor(availableTokens / 200);
    sampleSize = Math.max(10, Math.min(sampleSize, 30));
    sampleSize = Math.min(sampleSize, sampleData.length);

    const reducedSample = sampleData.slice(0, sampleSize);

    const categoricalCols = categoricalFields.join(', ');
    const dateCols = timeFields.join(', ');
    const numCols = numericFields.join(', ');

    const sampleValueLines: string[] = [];
    for (const field of categoricalFields) {
      const colInfo = profile.columns[field];
      const sampleValues = colInfo?.sample_values || [];
      if (sampleValues.length > 0) {
        sampleValueLines.push(`  ${field}: ${sampleValues.slice(0, 10).join(', ')}`);
      }
    }
    const fieldValuesBlock = sampleValueLines.length > 0
      ? `\nFIELD SAMPLE VALUES (for filter value reference):\n${sampleValueLines.join('\n')}`
      : '';

    const profileSummary = `rows=${profile.row_count}, columns=${columns.length}`;

    const userPrompt = `USER: ${prompt}

DATA PROFILE:
${profileSummary}

AVAILABLE FIELDS:
- Categorical: ${categoricalCols || 'None'}
- Date/Time: ${dateCols || 'None'}
- Numeric: ${numCols || 'None'}

SAMPLE (${reducedSample.length} rows):
${JSON.stringify(reducedSample, null, 2)}${fieldValuesBlock}

Respond only with JSON.`;

    const messages: LLMMessage[] = [
      { role: 'system', content: INTENT_SPEC_SYSTEM_PROMPT },
      { role: 'user', content: userPrompt },
    ];

    const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const response = await callLLM(this.llm, messages, {
          temperature: this.config.temperature,
          maxTokens: this.config.maxTokens,
        });

        const parsed = this.parseLLMResponse(response.content);
        if (!parsed) {
          continue;
        }

        if (this.config.debugMode) {
          console.log('Parsed LLM response:', JSON.stringify(parsed));
        }

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
        const isLast = attempt === 3;
        const errStr = String(error).toLowerCase();
        const isRateLimit = errStr.includes('429') || errStr.includes('rate limit') || errStr.includes('too many requests');

        if (isLast) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          throw new Error(
            `Failed to generate chart spec after ${attempt} attempts: ${errorMessage}`
          );
        }

        const backoffMs = Math.max(2 ** (attempt - 1) * 1000, isRateLimit ? 5000 : 0);
        if (this.config.debugMode || isRateLimit) {
          console.warn(`Attempt ${attempt} failed${isRateLimit ? ' (rate limit)' : ''}, retrying in ${backoffMs / 1000}s`);
        }
        await sleep(backoffMs);

        if (attempt === 1) {
          messages[1].content = `USER: ${prompt}\n\nCOLUMNS: ${columns.join(', ')}\n\nRespond with JSON: {"chartType":"bar","xAxis":{"field":"col","label":"L"},"yAxis":{"field":"col","label":"L","aggregation":"count"},"series":null,"options":{},"params":{}}`;
        }
      }
    }

    // console.warn('Using fallback spec from data profile');
    // const fallbackSpec = this.buildFallbackSpec(prompt, profile);
    // return { spec: fallbackSpec };
    throw new Error('Failed to generate chart spec after 3 attempts');
  }
}
