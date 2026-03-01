import {
  ChartSpec,
  ChartDataResult,
  ChartDataItem,
  ChartMetadata,
  Filter,
  Sort,
  TimeRange,
} from './schema';
import { DataFlattener, DataNormalizer, DataRecord, FieldMetadata } from './processor';

export class Executor {
  private flattener: DataFlattener;
  private normalizer: DataNormalizer;
  private fieldMetadata: FieldMetadata;

  constructor() {
    this.flattener = new DataFlattener();
    this.normalizer = new DataNormalizer();
    this.fieldMetadata = { types: {}, currency: {} };
  }

  private getFieldValue(record: DataRecord, field: string): unknown {
    if (record.hasOwnProperty(field)) {
      return record[field];
    }
    if (field.includes('.')) {
      const parts = field.split('.');
      let value: unknown = record;
      for (const part of parts) {
        if (value && typeof value === 'object') {
          value = (value as DataRecord)[part];
        } else {
          return undefined;
        }
      }
      return value;
    }
    return record[field];
  }

  private loadData(data: unknown): DataRecord[] {
    const flatData = this.flattener.process(data);
    if (flatData.length > 0) {
      const { metadata } = this.normalizer.normalizeData(flatData);
      this.fieldMetadata = metadata;
    }
    return flatData;
  }

  private applyFilters(data: DataRecord[], filters: Filter[]): DataRecord[] {
    if (!filters || filters.length === 0) return data;

    return data.filter((record) => {
      for (const filter of filters) {
        const fieldValue = record[filter.field];
        const filterValue = filter.value;

        switch (filter.operator) {
          case 'eq':
            if (typeof fieldValue === 'string' && typeof filterValue === 'string') {
              if (fieldValue.toLowerCase() !== filterValue.toLowerCase()) return false;
            } else if (fieldValue !== filterValue) {
              return false;
            }
            break;
          case 'ne':
            if (fieldValue === filterValue) return false;
            break;
          case 'gt':
            if (typeof fieldValue === 'number' && typeof filterValue === 'number') {
              if (fieldValue <= filterValue) return false;
            }
            break;
          case 'gte':
            if (typeof fieldValue === 'number' && typeof filterValue === 'number') {
              if (fieldValue < filterValue) return false;
            }
            break;
          case 'lt':
            if (typeof fieldValue === 'number' && typeof filterValue === 'number') {
              if (fieldValue >= filterValue) return false;
            }
            break;
          case 'lte':
            if (typeof fieldValue === 'number' && typeof filterValue === 'number') {
              if (fieldValue > filterValue) return false;
            }
            break;
          case 'contains':
            if (typeof fieldValue === 'string' && typeof filterValue === 'string') {
              if (!fieldValue.toLowerCase().includes(filterValue.toLowerCase()))
                return false;
            }
            break;
          case 'in':
            if (Array.isArray(filterValue) && !filterValue.includes(fieldValue)) {
              return false;
            }
            break;
        }
      }
      return true;
    });
  }

  private applyTimeFilter(data: DataRecord[], timeField: string | undefined, timeRange: TimeRange | undefined): DataRecord[] {
    if (!timeField || !timeRange) return data;

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
      }
    } else if (timeRange.start) {
      startDate = new Date(timeRange.start);
    } else {
      return data;
    }

    const endDate = timeRange.end ? new Date(timeRange.end) : now;

    const filtered = data.filter((record) => {
      const fieldValue = this.getFieldValue(record, timeField);
      if (!fieldValue) return false;
      const recordDate = new Date(fieldValue as string);
      if (isNaN(recordDate.getTime())) return false;
      return recordDate >= startDate && recordDate <= endDate;
    });

    if (filtered.length === 0 && data.length > 0) {
      console.warn(`Time filter returned empty - timeField: ${timeField}, startDate: ${startDate.toISOString()}, endDate: ${endDate.toISOString()}`);
      return data;
    }

    return filtered;
  }

  private applyGrouping(
    data: DataRecord[],
    xField: string,
    yField: string,
    aggregation: string | undefined,
    seriesField: string | undefined
  ): DataRecord[] {
    const groups = new Map<string, DataRecord[]>();

    for (const record of data) {
      const xValue = this.getFieldValue(record, xField) ?? 'unknown';
      const key = seriesField
        ? `${xValue}-${this.getFieldValue(record, seriesField) ?? 'unknown'}`
        : String(xValue);

      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key)!.push(record);
    }

    const result: DataRecord[] = [];
    for (const [key, records] of groups) {
      const [xValue, seriesValue] = seriesField ? key.split('-') : [key, ''];

      let yValue: number;
      if (aggregation === 'count') {
        yValue = records.length;
      } else if (aggregation === 'sum') {
        yValue = records.reduce((sum, r) => sum + (Number(this.getFieldValue(r, yField)) || 0), 0);
      } else if (aggregation === 'avg' || aggregation === 'average') {
        const sum = records.reduce((s, r) => s + (Number(this.getFieldValue(r, yField)) || 0), 0);
        yValue = sum / records.length;
      } else if (aggregation === 'min') {
        yValue = Math.min(...records.map((r) => Number(this.getFieldValue(r, yField)) || 0));
      } else if (aggregation === 'max') {
        yValue = Math.max(...records.map((r) => Number(this.getFieldValue(r, yField)) || 0));
      } else {
        yValue = records.length;
      }

      const resultDataRecord: DataRecord = { x: xValue, y: yValue };
      if (seriesField) resultDataRecord.series = seriesValue;
      result.push(resultDataRecord);
    }

    return result;
  }

  private applySort(data: DataRecord[], sort: Sort | undefined): DataRecord[] {
    if (!sort) return data;

    return [...data].sort((a, b) => {
      const aVal = this.getFieldValue(a, sort.field);
      const bVal = this.getFieldValue(b, sort.field);

      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return sort.direction === 'asc' ? aVal - bVal : bVal - aVal;
      }

      const aStr = String(aVal ?? '');
      const bStr = String(bVal ?? '');
      return sort.direction === 'asc'
        ? aStr.localeCompare(bStr)
        : bStr.localeCompare(aStr);
    });
  }

  private toChartFormat(
    data: DataRecord[],
    spec: ChartSpec,
    xField: string,
    yField: string,
    aggregation: string | undefined,
    seriesField: string | undefined
  ): ChartDataItem[] {
    let result = this.applyGrouping(data, xField, yField, aggregation, seriesField);

    if (spec.params?.sort) {
      result = this.applySort(result, spec.params.sort);
    }

    if (spec.params?.limit && spec.params.limit > 0) {
      result = result.slice(0, spec.params.limit);
    }

    return result.map((record) => {
      const item: ChartDataItem = {
        x: record.x as string | number,
        y: record.y as number,
        labelX: spec.xAxis?.label || xField,
        labelY: spec.yAxis?.label || yField,
      };

      if (seriesField && spec.series) {
        item.series = record.series as string | number | undefined;
        item.labelSeries = spec.series.label || seriesField;
      }

      if (aggregation === 'avg' || aggregation === 'average') {
        item.y = Math.round((item.y as number) * 100) / 100;
      }

      return item;
    });
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
      let records = this.loadData(data);
      const originalCount = records.length;

      if (spec.params?.filters && spec.params.filters.length > 0) {
        records = this.applyFilters(records, spec.params.filters);
      }

      if (spec.params?.timeField || spec.params?.timeRange) {
        records = this.applyTimeFilter(
          records,
          spec.params?.timeField,
          spec.params?.timeRange
        );
      }

      const xField = spec.xAxis?.field || 'x';
      const yField = spec.yAxis?.field || 'y';
      const seriesField = spec.series?.field;
      const aggregation = spec.yAxis?.aggregation || 'count';

      const chartData = this.toChartFormat(
        records,
        spec,
        xField,
        yField,
        aggregation,
        seriesField
      );

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
        filteredCount: records.length,
        currency: this.fieldMetadata.currency,
      };

      return { data: chartData, metadata };
    } catch (error) {
      console.error('Executor error:', error);
      throw error;
    }
  }
}
