import { z } from 'zod';

export const ChartTypeSchema = z.enum([
  'bar',
  'horizontal_bar',
  'line',
  'area',
  'pie',
  'donut',
  'scatter',
  'bubble',
  'radar',
  'gauge',
  'funnel',
  'heatmap',
  'treemap',
  'waterfall',
  'candlestick',
  'polar',
]);

export type ChartType = z.infer<typeof ChartTypeSchema>;

export const AxisConfigSchema = z.object({
  field: z.string(),
  label: z.string().optional(),
  type: z.enum(['categorical', 'quantitative', 'time']).optional(),
  aggregation: z
    .enum(['count', 'sum', 'avg', 'min', 'max', 'none'])
    .optional(),
  aggregationField: z.string().optional(),
});

export type AxisConfig = z.infer<typeof AxisConfigSchema>;

export const SeriesConfigSchema = z.object({
  field: z.string(),
  label: z.string().optional(),
});

export type SeriesConfig = z.infer<typeof SeriesConfigSchema>;

export const ChartOptionsSchema = z.object({
  title: z.string().optional(),
  stacked: z.boolean().optional(),
  orientation: z.enum(['vertical', 'horizontal']).optional(),
  colors: z.array(z.string()).optional(),
  innerRadius: z.number().optional(),
  bubbleSize: z.number().optional(),
  showLegend: z.boolean().optional(),
  showGrid: z.boolean().optional(),
});

export type ChartOptions = z.infer<typeof ChartOptionsSchema>;

export const TimeRangeSchema = z.object({
  type: z.enum(['relative', 'absolute']),
  value: z.number().optional(),
  unit: z.enum(['days', 'weeks', 'months', 'hours', 'minutes', 'years']).optional(),
  start: z.string().optional(),
  end: z.string().optional(),
});

export type TimeRange = z.infer<typeof TimeRangeSchema>;

export const FilterSchema = z.object({
  field: z.string(),
  operator: z.enum([
    'eq',
    'ne',
    'gt',
    'gte',
    'lt',
    'lte',
    'in',
    'not_in',
    'contains',
  ]),
  value: z.any(),
});

export type Filter = z.infer<typeof FilterSchema>;

export const SortSchema = z.object({
  field: z.string(),
  direction: z.enum(['asc', 'desc']),
});

export type Sort = z.infer<typeof SortSchema>;

export const RuntimeParamsSchema = z.object({
  timeField: z.string().optional(),
  timeRange: TimeRangeSchema.optional(),
  filters: z.array(FilterSchema).optional(),
  limit: z.number().optional(),
  sort: SortSchema.optional(),
});

export type RuntimeParams = z.infer<typeof RuntimeParamsSchema>;

export const ChartSpecSchema = z.object({
  version: z.string().optional(),
  chartType: ChartTypeSchema.optional(),
  xAxis: AxisConfigSchema,
  yAxis: AxisConfigSchema,
  series: SeriesConfigSchema.optional(),
  options: ChartOptionsSchema.optional(),
  params: RuntimeParamsSchema.optional(),
});

export type ChartSpec = z.infer<typeof ChartSpecSchema>;

export interface ChartDataItem {
  x: string | number;
  y: number;
  series?: string | number;
  labelX?: string;
  labelY?: string;
  labelSeries?: string;
}

export interface ChartMetadata {
  chartType: string;
  xAxis: { field: string; label: string };
  yAxis: { field: string; label: string };
  series?: { field: string; label: string };
  warnings?: string[];
  originalCount?: number;
  filteredCount?: number;
  currency?: Record<string, boolean>;
}

export interface ChartDataResult {
  data: ChartDataItem[];
  metadata: ChartMetadata;
}
