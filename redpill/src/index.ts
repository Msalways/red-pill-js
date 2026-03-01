export { Redpill } from './client.js';
export { Executor } from './executor.js';

export { DataFlattener, DataNormalizer } from './processor.js';

export { 
  ChartSpecSchema,
  ChartTypeSchema,
  AxisConfigSchema,
  SeriesConfigSchema,
  ChartOptionsSchema,
  TimeRangeSchema,
  FilterSchema,
  SortSchema,
  RuntimeParamsSchema,
} from './schema.js';

export type {
  ChartSpec,
  ChartType,
  AxisConfig,
  SeriesConfig,
  ChartOptions,
  TimeRange,
  Filter,
  Sort,
  RuntimeParams,
  ChartDataItem,
  ChartMetadata,
  ChartDataResult,
} from './schema.js';

export { IntentSpecAgent } from './agents/index.js';
export type { DataProfile, AgentConfig } from './agents/index.js';

export { RedpillConfigBuilder } from './config/index.js';
export type { RedpillConfig } from './config/index.js';
export type { LLMFunction, LLMOptions, LLMMessage, LLMResponse } from './config/index.js';
