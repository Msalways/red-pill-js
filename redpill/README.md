# Redpill JS SDK

> AI-powered SDK for dynamic chart generation from any JSON data — **BYOLLM** (Bring Your Own LLM)

The Redpill JS SDK lets you point a natural-language prompt + raw JSON at any LLM of your choice and get back chart-ready, structured data in return. You provide the LLM function; Redpill handles data profiling, spec generation, filtering, aggregation, and normalization.

---

## Table of Contents

1. [Installation](#installation)
2. [Quick Start](#quick-start)
3. [How It Works](#how-it-works)
4. [API Reference](#api-reference)
   - [Redpill (Main Client)](#redpill-main-client)
   - [RedpillConfigBuilder](#redpillconfigbuilder)
   - [ChartSpec Schema](#chartspec-schema)
   - [Executor](#executor)
   - [DataFlattener / DataNormalizer](#dataflattener--datanormalizer)
   - [IntentSpecAgent](#intentspecagent)
5. [LLM Integration Examples](#llm-integration-examples)
6. [ChartSpec Fields Reference](#chartspec-fields-reference)
7. [Filter Operators](#filter-operators)
8. [Chart Types](#chart-types)
9. [Data Formats Supported](#data-formats-supported)
10. [Known Gaps & Edge Cases](#known-gaps--edge-cases)
11. [Building](#building)

---

## Installation

```bash
npm install redpillx
# or
yarn add redpillx
# or
pnpm add redpillx
```

> **Peer dependencies**: none. You only need your own LLM SDK (e.g. `openai`, `@anthropic-ai/sdk`).

---

## Quick Start

```ts
import { Redpill } from 'redpillx';
import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const rp = new Redpill()
  .setLlm(async (messages, options) => {
    const res = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages,
      temperature: options?.temperature ?? 0.7,
      max_tokens: options?.maxTokens ?? 4000,
    });
    return { content: res.choices[0].message.content! };
  })
  .temperature(0.3)
  .maxTokens(2000)
  .sampleSize(50)
  .build();

// 1. Generate a chart specification from your data + prompt
const { spec } = await rp.generateSpec(
  { tickets: [{ id: 1, status: 'open', priority: 'high', created_at: '2024-01-05' }, ...] },
  'show me ticket count by status'
);

console.log(spec);
/*
{
  chartType: 'bar',
  xAxis: { field: 'status', label: 'Status' },
  yAxis: { field: 'status', label: 'Count', aggregation: 'count' },
  options: { title: 'Ticket Count by Status' },
  ...
}
*/

// 2. Execute the spec against the raw data to get chart-ready output
const result = rp.execute(spec, { tickets: [...] });

console.log(result.data);
// [ { x: 'open', y: 42, labelX: 'Status', labelY: 'Count' }, ... ]

console.log(result.metadata);
// { chartType: 'bar', xAxis: {...}, yAxis: {...}, warnings: [], originalCount: 200, filteredCount: 200 }
```

---

## How It Works

```
Raw JSON data
    │
    ▼
DataFlattener          – Flatten nested objects into {key.subkey: value} records
    │
    ▼
Data Profiler          – Infer column types (number / date / string)
    │
    ▼
IntentSpecAgent  ──────────────────── Your LLM function
    │                                 (receives system prompt + data profile + sample)
    ▼
ChartSpec (Zod-validated)
    │
    ▼
Executor               – Apply filters, time range, grouping, aggregation, sort, limit
    │
    ▼
ChartDataResult        – { data: ChartDataItem[], metadata: ChartMetadata }
```

---

## API Reference

### Redpill (Main Client)

The primary fluent-builder entry point.

```ts
import { Redpill } from 'redpillx';
```

#### Constructor

```ts
const rp = new Redpill();
```

Initialises with defaults: `temperature: 0.7`, `maxTokens: 4000`, `sampleSize: 100`, `debugMode: false`.

#### `.setLlm(fn: LLMFunction): this`

Set your LLM function. **Required before calling `.build()`.**

```ts
type LLMFunction = (
  messages: LLMMessage[],   // { role: 'system'|'user'|'assistant', content: string }[]
  options?: LLMOptions      // { temperature?: number, maxTokens?: number }
) => Promise<{ content: string }>;
```

#### `.temperature(value: number): this`

LLM sampling temperature. Default: `0.7`.

#### `.maxTokens(value: number): this`

Maximum tokens for the LLM response. Default: `4000`.

#### `.sampleSize(value: number): this`

Number of sample rows sent to the LLM for data profiling. Default: `100`.  
Reduce to `20–30` for large datasets to stay within context limits.

#### `.debugMode(value: boolean): this`

Enable debug logging. Default: `false`.

#### `.build(): this`

Validates that an LLM function is set. Throws if `.setLlm()` was not called.

#### `.generateSpec(data, prompt): Promise<{ spec: ChartSpec }>`

Generate a `ChartSpec` from raw JSON data and a natural-language prompt.

| Parameter | Type | Description |
|-----------|------|-------------|
| `data` | `Record<string, unknown>` | Raw JSON — can be `{ key: [...] }` or a flat array `[{...}]` |
| `prompt` | `string` | Natural language description, e.g. `"show tickets by status"` |

Returns `{ spec: ChartSpec }`.

#### `.execute(spec, data): ChartDataResult`

Execute a `ChartSpec` against raw JSON data.

| Parameter | Type | Description |
|-----------|------|-------------|
| `spec` | `ChartSpec` | Chart specification (from `generateSpec` or hand-crafted) |
| `data` | `Record<string, unknown>` | Raw JSON data |

Returns `ChartDataResult`:

```ts
{
  data: ChartDataItem[];   // [ { x, y, series?, labelX?, labelY?, labelSeries? } ]
  metadata: ChartMetadata; // chart type, axis info, warnings, counts, currency
}
```

---

### RedpillConfigBuilder

Alternative builder API (lower-level, returns a plain config + llm object):

```ts
import { RedpillConfigBuilder } from 'redpillx';

const config = new RedpillConfigBuilder()
  .llm(myLlmFn)
  .temperature(0.5)
  .maxTokens(1000)
  .sampleSize(30)
  .debugMode(true)
  .build();
// config: { temperature, maxTokens, sampleSize, debugMode, llm }
```

Useful if you want to pass the config object to `IntentSpecAgent` directly.

---

### ChartSpec Schema

```ts
import { ChartSpecSchema } from 'redpillx';
import type { ChartSpec } from 'redpillx';
```

Validated with [Zod](https://zod.dev). You can use the schema to parse/validate hand-crafted specs:

```ts
const spec = ChartSpecSchema.parse({
  chartType: 'bar',
  xAxis: { field: 'status', label: 'Status' },
  yAxis: { field: 'status', label: 'Count', aggregation: 'count' },
});
```

---

### Executor

Execute a spec independently (without the full `Redpill` client):

```ts
import { Executor } from 'redpillx';

const executor = new Executor();
const result = executor.execute(spec, rawData);
```

The `Executor` automatically:
- Flattens nested JSON
- Normalises field types (currency strings → numbers, date strings → ISO)
- Applies `params.filters`, `params.timeRange`, `params.sort`, `params.limit`
- Groups and aggregates by `xAxis.aggregation`
- Returns `ChartDataResult`

---

### DataFlattener / DataNormalizer

Low-level utilities for data preparation:

```ts
import { DataFlattener, DataNormalizer } from 'redpillx';

const flattener = new DataFlattener();
const records = flattener.process({ users: [{ name: 'Alice', address: { city: 'NY' } }] });
// [{ name: 'Alice', 'address.city': 'NY' }]

const normalizer = new DataNormalizer();
const type = normalizer.inferFieldType(['$1,200', '$500', '$3,400']);  // 'number'
const currency = normalizer.detectCurrency(['$1,200', '$500']);        // 'currency'
```

---

### IntentSpecAgent

Lower-level access to the LLM agent:

```ts
import { IntentSpecAgent } from 'redpillx';
import type { DataProfile, AgentConfig } from 'redpillx';

const agent = new IntentSpecAgent(myLlmFn, {
  temperature: 0.3,
  maxTokens: 2000,
  sampleSize: 30,
  debugMode: false,
});

const { spec } = await agent.run(
  'tickets by status',              // prompt
  { columns: ['status', 'count'], types: { status: 'string', count: 'number' } },
  [{ status: 'open', count: 10 }]  // sample data
);
```

The agent retries up to **2 times** and falls back to a heuristic spec if the LLM fails.

---

## LLM Integration Examples

### OpenAI / OpenRouter

```ts
import OpenAI from 'openai';

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  baseURL: 'https://openrouter.ai/api/v1', // optional: OpenRouter
});

const rp = new Redpill()
  .setLlm(async (messages, options) => {
    const res = await client.chat.completions.create({
      model: 'openai/gpt-4o-mini',
      messages,
      temperature: options?.temperature ?? 0.7,
      max_tokens: options?.maxTokens ?? 4000,
    });
    return { content: res.choices[0].message.content! };
  })
  .build();
```

### Anthropic Claude

```ts
import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const rp = new Redpill()
  .setLlm(async (messages, options) => {
    const res = await client.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: options?.maxTokens ?? 4000,
      messages: messages.map(m => ({ role: m.role as any, content: m.content })),
    });
    return { content: (res.content[0] as any).text };
  })
  .build();
```

### Google Gemini (via OpenAI compat)

```ts
import OpenAI from 'openai';

const client = new OpenAI({
  apiKey: process.env.GEMINI_API_KEY,
  baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai',
});

const rp = new Redpill()
  .setLlm(async (messages, options) => {
    const res = await client.chat.completions.create({
      model: 'gemini-1.5-flash',
      messages,
      temperature: options?.temperature ?? 0.7,
    });
    return { content: res.choices[0].message.content! };
  })
  .build();
```

### Ollama (Local)

```ts
import OpenAI from 'openai';

const client = new OpenAI({ baseURL: 'http://localhost:11434/v1', apiKey: 'ollama' });

const rp = new Redpill()
  .setLlm(async (messages, options) => {
    const res = await client.chat.completions.create({
      model: 'llama3.1',
      messages,
    });
    return { content: res.choices[0].message.content! };
  })
  .build();
```

---

## ChartSpec Fields Reference

```ts
{
  version?: string;          // Spec version (informational)
  chartType?: ChartType;     // See Chart Types below

  xAxis: {
    field: string;           // Data field name (supports dot notation: "address.city")
    label?: string;          // Display label
    type?: 'categorical' | 'quantitative' | 'time';
    aggregation?: 'count' | 'sum' | 'avg' | 'min' | 'max' | 'none';
    aggregationField?: string;
  };

  yAxis: {
    field: string;
    label?: string;
    type?: 'categorical' | 'quantitative' | 'time';
    aggregation?: 'count' | 'sum' | 'avg' | 'min' | 'max' | 'none';
  };

  series?: {
    field: string;           // Field for series/breakdown (adds legend)
    label?: string;
  };

  options?: {
    title?: string;
    stacked?: boolean;
    orientation?: 'vertical' | 'horizontal';
    colors?: string[];        // Hex color strings
    innerRadius?: number;     // Donut charts
    bubbleSize?: number;      // Bubble charts
    showLegend?: boolean;
    showGrid?: boolean;
  };

  params?: {
    timeField?: string;       // Field to use for time filtering
    timeRange?: {
      type: 'relative' | 'absolute';
      value?: number;         // For relative: e.g. 3
      unit?: 'minutes' | 'hours' | 'days' | 'weeks' | 'months' | 'years';
      start?: string;         // For absolute: ISO date string
      end?: string;
    };
    filters?: Filter[];       // See Filter Operators
    limit?: number;           // Max result rows
    sort?: {
      field: string;
      direction: 'asc' | 'desc';
    };
  };
}
```

---

## Filter Operators

| Operator | Description |
|----------|-------------|
| `eq` | Equal (case-insensitive for strings) |
| `ne` | Not equal |
| `gt` | Greater than (numbers) |
| `gte` | Greater than or equal (numbers) |
| `lt` | Less than (numbers) |
| `lte` | Less than or equal (numbers) |
| `in` | Value in array |
| `not_in` | Value not in array |
| `contains` | String contains (case-insensitive) |

```ts
// Example filter usage in a spec
const spec = {
  chartType: 'bar',
  xAxis: { field: 'status', label: 'Status' },
  yAxis: { field: 'status', label: 'Count', aggregation: 'count' },
  params: {
    filters: [
      { field: 'priority', operator: 'eq', value: 'high' },
      { field: 'amount', operator: 'gte', value: 1000 },
      { field: 'tags', operator: 'contains', value: 'urgent' },
    ]
  }
};
```

---

## Chart Types

| Value | Description |
|-------|-------------|
| `bar` | Vertical bar chart |
| `horizontal_bar` | Horizontal bar chart |
| `line` | Line chart |
| `area` | Area chart |
| `pie` | Pie chart |
| `donut` | Donut chart |
| `scatter` | Scatter plot |
| `bubble` | Bubble chart |
| `radar` | Radar/spider chart |
| `gauge` | Gauge chart |
| `funnel` | Funnel chart |
| `heatmap` | Heatmap |
| `treemap` | Treemap |
| `waterfall` | Waterfall chart |
| `candlestick` | Candlestick (OHLC) |
| `polar` | Polar chart |

---

## Data Formats Supported

```ts
// 1. Array of flat records
const data = [{ status: 'open', count: 10 }, { status: 'closed', count: 5 }];

// 2. Object with one array property (most common API response shape)
const data = { tickets: [{ id: 1, status: 'open' }, ...] };

// 3. Nested objects (auto-flattened with dot notation)
const data = [{ user: { name: 'Alice', city: 'NY' }, amount: 100 }];
// Becomes: [{ 'user.name': 'Alice', 'user.city': 'NY', amount: 100 }]

// ⚠️  Arrays inside records are SKIPPED during flattening
const data = [{ tags: ['a', 'b'], name: 'Alice' }];
// Becomes: [{ name: 'Alice' }]  — 'tags' is dropped
```

---

## Known Gaps & Edge Cases

These are areas where the SDK does not currently handle all cases:

### Data Handling
| Gap | Details |
|-----|---------|
| **Arrays inside records are silently dropped** | Nested arrays (e.g. `tags: ['a','b']`) are skipped during flattening. Multi-value fields cannot be charted. |
| **Type inference uses only the first row** | `getDataProfile()` infers types from `data[0]` only. Mixed-type columns (e.g. `"1"` and `"abc"` in the same field) may be misclassified. |
| **Date detection false positives** | Any string that passes `Date.parse()` is classified as `date`. Short numbers like `"2023"` may be wrongly typed as dates. |
| **Empty `data` arrays** | Passing an empty array returns `{ columns: [], types: {} }`. The LLM will have no schema context and may hallucinate field names. |
| **No support for ISO-8601 duration strings** | Time range `unit` only supports named units (`days`, `weeks`, etc.), not durations like `P1Y`. |

### Spec Generation
| Gap | Details |
|-----|---------|
| **No spec validation** | The generated `ChartSpec` is parsed with Zod but fields are not cross-checked against the actual data columns. A hallucinated field name will silently produce empty output. |
| **Only 2 retry attempts** | If the LLM returns bad JSON twice, it falls back to a heuristic spec that may not match the user's intent. |
| **Fallback spec is always `bar`** | The heuristic fallback always produces a bar chart regardless of what the user asked for. |
| **`model` field on `AgentConfig` is unused** | `AgentConfig` has an optional `model` field but the `callLLM()` function does not forward it; the caller must set the model inside their `LLMFunction`. |
| **System prompt is fixed** | The `INTENT_SPEC_SYSTEM_PROMPT` is hardcoded — there is no hook to customise or extend it. |

### Executor
| Gap | Details |
|-----|---------|
| **`not_in` filter is not implemented** | The schema accepts `not_in` as a valid operator but the `applyFilters()` switch-case has no handler for it. |
| **`gt`/`gte`/`lt`/`lte` only work on numbers** | Numeric filters silently pass if either operand is not a `number`. String dates are not compared numerically. |
| **No multi-key grouping** | Grouping key is `${xValue}-${seriesValue}` concatenated with a dash. Field values containing `-` will produce incorrect group keys. |
| **Aggregation `aggregationField` is ignored** | `AxisConfig.aggregationField` exists in the schema but `applyGrouping()` always uses `yAxis.field` for aggregation. |
| **`none` aggregation falls through to `count`** | An aggregation value of `none` is treated the same as an unknown value — silently defaulting to `count`. |
| **Pie/donut charts get same output as bar** | There is no special formatting for pie/donut data (e.g. percentage calculation). |
| **Currency label only appended for y-axis** | `fieldMetadata.currency` is only checked for the y-axis field; x-axis currency fields are unlabelled. |

### Misc
| Gap | Details |
|-----|---------|
| **No async/streaming support** | `generateSpec` is async; `execute` is synchronous. Large datasets may block the event loop. |
| **No built-in caching** | Every `generateSpec` call hits the LLM API. There is no spec caching layer. |
| **No TypeScript strict null safety on `series` grouping** | `series!` is non-null-asserted in `metadata` construction even though `spec.series` can be `undefined`. |
| **`console.log` inside agent** | Line 162 of `intent_spec_agent.ts` always logs the parsed LLM response regardless of `debugMode`. |

---

## Building

```bash
# Install dependencies
npm install

# Build (outputs to dist/)
npm run build

# Watch mode
npm run dev

# Run tests
npm test
```

Output formats: **ESM** (`.mjs`) + **CJS** (`.js`) + **TypeScript declarations** (`.d.ts`).

---

## Chart Library Integration

Detailed, copy-pasteable integration examples for **Recharts**, **Chart.js**, **ECharts**, **ApexCharts**, **Plotly**, **D3.js**, **Victory**, **Matplotlib**, and **Plotly Python** are in the dedicated guide:

📖 **[CHART_INTEGRATION.md](./CHART_INTEGRATION.md)**

The guide covers:
- The exact data shape produced by `execute()` and how each library needs it transformed
- Ready-to-use adapter functions and React components for every major chart type (bar, line, pie/donut, scatter, area, radar, heatmap)
- Series/grouped chart support
- Currency formatting and warning display
- An end-to-end Next.js API → chart render example

---

## License

MIT
