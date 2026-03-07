import {
  ChartSpec,
  ChartDataResult,
  ChartDataItem,
  ChartMetadata,
  Filter,
  Sort,
  TimeRange,
} from './schema';
import { DataRecord, FieldMetadata } from './processor';
import * as pl from 'nodejs-polars';

export class PolarsExecutor {
  private fieldMetadata: FieldMetadata;

  constructor() {
    this.fieldMetadata = { types: {}, currency: {} };
  }

  private resolveField(df: pl.DataFrame, field: string): string | null {
    if (df.columns.includes(field)) {
      return field;
    }
    if (field.includes('.')) {
      const parts = field.split('.');
      const simple = parts[parts.length - 1];
      if (simple && df.columns.includes(simple)) {
        return simple;
      }
    }
    return null;
  }

  private loadData(data: unknown): pl.DataFrame {
    if (!data) {
      return pl.readRecords([], { inferSchemaLength: 0 });
    }

    let records: DataRecord[] = [];

    if (Array.isArray(data)) {
      records = data.map((item) => this.flattenObject(item));
    } else if (typeof data === 'object' && data !== null) {
      for (const value of Object.values(data)) {
        if (Array.isArray(value)) {
          records = value.map((item) => this.flattenObject(item));
          break;
        }
      }
      if (records.length === 0) {
        records = [this.flattenObject(data)];
      }
    }

    if (records.length === 0) {
      return pl.readRecords([], { inferSchemaLength: 0 });
    }

    // Let Polars infer types naturally
    return pl.readRecords(records, { inferSchemaLength: 100 });
  }

  private convertCurrencyFields(records: DataRecord[]): DataRecord[] {
    // Disabled - let Polars handle type inference
    return records;
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

  private normalizeDataframe(df: pl.DataFrame): pl.DataFrame {
    if (df.height === 0) {
      return df;
    }

    // Find string columns that look like currency (contain $€£¥₹ symbol)
    const stringCols = df.columns.filter(col => {
      const dtype = df.schema[col].toString();
      return dtype.includes('String') || dtype.includes('Utf8');
    });

    const currencyCols: string[] = [];
    for (const col of stringCols) {
      const sample = df.head(20).getColumn(col).toArray();
      const hasCurrencySymbol = sample.some((v: unknown) => 
        typeof v === 'string' && /^[\$€£¥₹]/.test(v)
      );
      if (hasCurrencySymbol) {
        currencyCols.push(col);
      }
    }

    if (currencyCols.length > 0) {
      // Convert currency columns to numbers
      const records = df.toRecords();
      const cleanedRecords = records.map((record) => {
        const cleaned: Record<string, unknown> = { ...record };
        for (const col of currencyCols) {
          const val = cleaned[col];
          if (typeof val === 'string') {
            const num = parseFloat(val.replace(/[$€£¥₹,]/g, ''));
            if (!isNaN(num)) {
              cleaned[col] = num;
            }
          }
        }
        return cleaned;
      });
      
      df = pl.readRecords(cleanedRecords, { inferSchemaLength: 100 });
    }

    const types: Record<string, string> = {};
    const currency: Record<string, boolean> = {};

    const records = df.toRecords();
    const sampleSize = Math.min(records.length, 50);
    const sample = records.slice(0, sampleSize);

    const allKeys = new Set<string>();
    for (const record of sample) {
      for (const key of Object.keys(record)) {
        allKeys.add(key);
      }
    }

    for (const key of allKeys) {
      let numberCount = 0;
      let dateCount = 0;

      for (const record of sample) {
        const value = record[key];
        if (value === null || value === undefined) continue;

        if (typeof value === 'number') {
          numberCount++;
        } else if (typeof value === 'string') {
          const datePatterns = [
            /^\d{4}-\d{2}-\d{2}/,
            /^\d{2}\/\d{2}\/\d{4}/,
            /^\w{3}\s+\d{1,2},\s+\d{4}/,
          ];
          if (datePatterns.some((p) => p.test(value))) {
            dateCount++;
          }
        }
      }

      if (numberCount > sampleSize * 0.5) {
        types[key] = 'number';
      } else if (dateCount > sampleSize * 0.5) {
        types[key] = 'date';
      } else {
        types[key] = 'string';
      }

      if (key.includes('cost') || key.includes('price') || key.includes('amount') || key.includes('total')) {
        currency[key] = true;
      }
    }

    this.fieldMetadata = { types, currency };
    return df;
  }

  private applyFilters(df: pl.DataFrame, filters: Filter[] | undefined): pl.DataFrame {
    if (!filters || filters.length === 0) {
      return df;
    }

    for (const filterDef of filters) {
      const field = filterDef.field;
      const operator = filterDef.operator;
      const value = filterDef.value;

      const resolvedField = this.resolveField(df, field);
      if (!resolvedField) {
        continue;
      }

      const dtype = df.schema[resolvedField].toString();

      try {
        switch (operator) {
          case 'eq':
            if (dtype.includes('String') && typeof value === 'string') {
              df = df.filter(pl.col(resolvedField).str.toLowerCase().eq(pl.lit(value.toLowerCase())));
            } else {
              df = df.filter(pl.col(resolvedField).eq(value));
            }
            break;
          case 'ne':
            if (dtype.includes('String') && typeof value === 'string') {
              df = df.filter(pl.col(resolvedField).str.toLowerCase().neq(pl.lit(value.toLowerCase())));
            } else {
              df = df.filter(pl.col(resolvedField).neq(value));
            }
            break;
          case 'gt':
            df = df.filter(pl.col(resolvedField).gt(value));
            break;
          case 'gte':
            df = df.filter(pl.col(resolvedField).gtEq(value));
            break;
          case 'lt':
            df = df.filter(pl.col(resolvedField).lt(value));
            break;
          case 'lte':
            df = df.filter(pl.col(resolvedField).ltEq(value));
            break;
          case 'contains':
            if (typeof value === 'string') {
              df = df.filter(pl.col(resolvedField).cast(pl.Utf8).str.toLowerCase().str.contains(value.toLowerCase()));
            }
            break;
          case 'in':
            if (Array.isArray(value)) {
              if (dtype.includes('String')) {
                const valueLower = value.map((v) => (typeof v === 'string' ? v.toLowerCase() : v));
                df = df.filter(pl.col(resolvedField).str.toLowerCase().isIn(valueLower));
              } else {
                df = df.filter(pl.col(resolvedField).isIn(value));
              }
            }
            break;
        }
      } catch {
        continue;
      }
    }

    return df;
  }

  private applyTimeFilter(
    df: pl.DataFrame,
    timeField: string | undefined,
    timeRange: TimeRange | undefined
  ): pl.DataFrame {
    if (!timeField || !timeRange) {
      return df;
    }

    const resolvedField = this.resolveField(df, timeField);
    if (!resolvedField) {
      return df;
    }

    let parsedExpr: pl.Expr | null = null;
    for (const fmt of DATE_FORMATS) {
      try {
        parsedExpr = pl.col(resolvedField).str.strptime(pl.Datetime, fmt);
        break;
      } catch {
        continue;
      }
    }

    if (!parsedExpr) {
      return df;
    }

    try {
      const now = new Date();
      let startDate: Date;

      if (timeRange.type === 'relative') {
        const value = timeRange.value || 1;
        const unit = timeRange.unit || 'days';
        startDate = new Date(now);

        switch (unit) {
          case 'days':
            startDate.setDate(startDate.getDate() - value);
            break;
          case 'weeks':
            startDate.setDate(startDate.getDate() - value * 7);
            break;
          case 'months':
            startDate.setMonth(startDate.getMonth() - value);
            break;
          case 'hours':
            startDate.setHours(startDate.getHours() - value);
            break;
          case 'minutes':
            startDate.setMinutes(startDate.getMinutes() - value);
            break;
          case 'years':
            startDate.setFullYear(startDate.getFullYear() - value);
            break;
          default:
            return df;
        }

        const dfFiltered = df.filter(parsedExpr.gtEq(startDate));
        if (dfFiltered.height === 0 && df.height > 0) {
          console.warn(`Time filter returned empty - timeField: ${timeField}, startDate: ${startDate.toISOString()}`);
          return df;
        }
        df = dfFiltered;
      } else if (timeRange.start) {
        const startDt = new Date(timeRange.start.replace(' ', 'T'));
        df = df.filter(parsedExpr.gtEq(startDt));
      }
      if (timeRange.end) {
        const endDt = new Date(timeRange.end.replace(' ', 'T'));
        df = df.filter(parsedExpr.ltEq(endDt));
      }
    } catch {
      // Ignore errors
    }

    return df;
  }

  private applyGrouping(
    df: pl.DataFrame,
    xField: string,
    yField: string,
    aggregation: string | undefined,
    seriesField: string | undefined
  ): pl.DataFrame {
    const resolvedXField = this.resolveField(df, xField) || xField;
    const resolvedYField = this.resolveField(df, yField) || yField;
    const resolvedSeriesField = seriesField ? this.resolveField(df, seriesField) || seriesField : null;

    const groupByCols: string[] = [];
    if (resolvedXField && df.columns.includes(resolvedXField)) {
      groupByCols.push(resolvedXField);
    }
    if (resolvedSeriesField && df.columns.includes(resolvedSeriesField)) {
      groupByCols.push(resolvedSeriesField);
    }

    if (groupByCols.length === 0) {
      return df;
    }

    let aggExpr;
    const agg = aggregation || 'count';

    if (agg === 'count') {
      aggExpr = pl.len().alias('count');
    } else if (agg === 'sum') {
      aggExpr = pl.col(resolvedYField).sum().alias(resolvedYField);
    } else if (agg === 'avg' || agg === 'average') {
      aggExpr = pl.col(resolvedYField).mean().alias(resolvedYField);
    } else if (agg === 'min') {
      aggExpr = pl.col(resolvedYField).min().alias(resolvedYField);
    } else if (agg === 'max') {
      aggExpr = pl.col(resolvedYField).max().alias(resolvedYField);
    } else {
      aggExpr = pl.len().alias('count');
    }

    df = df.groupBy(groupByCols).agg(aggExpr);

    const newColumns: string[] = [...groupByCols];
    if (agg === 'count') {
      if (!newColumns.includes('count')) {
        newColumns.push('count');
      }
    } else if (!newColumns.includes(resolvedYField)) {
      newColumns.push(resolvedYField);
    }

    return df.select(...newColumns);
  }

  private applySort(df: pl.DataFrame, sort: Sort | undefined): pl.DataFrame {
    if (!sort) {
      return df;
    }

    const field = sort.field;
    if (!df.columns.includes(field)) {
      return df;
    }

    if (sort.direction === 'asc') {
      return df.sort(field);
    } else {
      return df.sort(field, true);
    }
  }

  private formatLabel(field: string, defaultLabel: string | undefined): string {
    const label = defaultLabel || field;
    if (this.fieldMetadata.currency[field]) {
      return `${label} (Currency)`;
    }
    return label;
  }

  execute(spec: ChartSpec, data: unknown): ChartDataResult {
    try {
      let df = this.loadData(data);
      const originalCount = df.height;

      if (originalCount === 0) {
        return {
          data: [],
          metadata: {
            chartType: spec.chartType || 'bar',
            xAxis: { field: '', label: '' },
            yAxis: { field: '', label: '' },
            originalCount: 0,
            filteredCount: 0,
            currency: {},
          },
        };
      }

      df = this.normalizeDataframe(df);

      const xField = spec.xAxis?.field || 'x';
      const yField = spec.yAxis?.field || 'y';
      const seriesField = spec.series?.field;
      const aggregation = spec.yAxis?.aggregation || 'count';

      const resolvedX = this.resolveField(df, xField);
      const resolvedY = this.resolveField(df, yField);
      const resolvedSeries = seriesField ? this.resolveField(df, seriesField) : null;

      df = this.applyFilters(df, spec.params?.filters);

      df = this.applyTimeFilter(df, spec.params?.timeField, spec.params?.timeRange);

      df = this.applyGrouping(df, xField, yField, aggregation, seriesField);

      if (spec.params?.sort) {
        const sortField = spec.params.sort.field === 'y' && aggregation === 'count'
          ? 'count'
          : spec.params.sort.field === 'x'
            ? xField
            : spec.params.sort.field;
        df = this.applySort(df, { ...spec.params.sort, field: sortField });
      } else if (seriesField) {
        df = df.sort([resolvedX || xField, resolvedSeries || seriesField]);
      } else {
        df = df.sort(resolvedX || xField);
      }

      if (spec.params?.limit && spec.params.limit > 0) {
        df = df.head(spec.params.limit);
      }

      const chartData = this.toChartFormat(df, spec, xField, yField, aggregation, seriesField);

      const warnings: string[] = [];
      if (originalCount > 0 && chartData.length === 0) {
        warnings.push('Filter resulted in empty dataset');
      }
      if (chartData.length < 3 && spec.chartType === 'line') {
        warnings.push('Line chart with less than 3 data points may not be meaningful');
      }

      const metadata: ChartMetadata = {
        chartType: spec.chartType || 'bar',
        xAxis: {
          field: xField,
          label: spec.xAxis?.label || xField,
        },
        yAxis: {
          field: yField,
          label: this.formatLabel(yField, spec.yAxis?.label),
        },
        series: spec.series
          ? { field: seriesField!, label: spec.series.label || seriesField! }
          : undefined,
        warnings: warnings.length > 0 ? warnings : undefined,
        originalCount,
        filteredCount: df.height,
        currency: this.fieldMetadata.currency,
      };

      return { data: chartData, metadata };
    } catch (error) {
      console.error('PolarsExecutor error:', error);
      throw error;
    }
  }

  private toChartFormat(
    df: pl.DataFrame,
    spec: ChartSpec,
    xField: string,
    yField: string,
    aggregation: string | undefined,
    seriesField: string | undefined
  ): ChartDataItem[] {
    const records = df.toRecords();
    const resolvedXField = this.resolveField(df, xField) || xField;
    const resolvedYField = this.resolveField(df, yField) || yField;
    const resolvedSeriesField = seriesField ? this.resolveField(df, seriesField) || seriesField : null;

    return records.map((record) => {
      const yValue = aggregation === 'count' ? (record['count'] as number) || 0 : (record[resolvedYField] as number) || 0;

      const item: ChartDataItem = {
        x: record[resolvedXField] as string | number,
        y: yValue,
        labelX: spec.xAxis?.label || xField,
        labelY: spec.yAxis?.label || yField,
      };

      if (seriesField && resolvedSeriesField) {
        item.series = record[resolvedSeriesField] as string | number | undefined;
        item.labelSeries = spec.series?.label || seriesField;
      }

      if (aggregation === 'avg' || aggregation === 'average') {
        item.y = Math.round((item.y as number) * 100) / 100;
      }

      return item;
    });
  }
}

const DATE_FORMATS = [
  '%Y-%m-%d',
  '%Y/%m/%d',
  '%d-%m-%Y',
  '%d/%m/%Y',
  '%m-%d-%Y',
  '%m/%d/%Y',
  '%Y-%m-%dT%H:%M:%S',
  '%Y-%m-%d %H:%M:%S',
  '%d-%m-%Y %H:%M:%S',
  '%Y%m%d',
];
