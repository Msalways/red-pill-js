import * as pl from 'nodejs-polars';

export interface FieldMetadata {
  types: Record<string, string>;
  currency: Record<string, boolean>;
}

export interface DataRecord {
  [key: string]: unknown;
}

export interface ColInfo {
  dtype: string;
  nullable: boolean;
  sample_values?: string[];
  type?: string;
  null_count?: number;
  unique_count?: number;
}

export interface DataProfile {
  columns: Record<string, ColInfo>;
  row_count: number;
  inferred: {
    categorical_fields: string[];
    time_fields: string[];
  };
}

function isObject(val: unknown): val is Record<string, unknown> {
  return typeof val === 'object' && val !== null && !Array.isArray(val);
}

function flattenObject(obj: unknown, prefix = ''): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  if (typeof obj !== 'object' || obj === null) {
    return result;
  }

  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    const newKey = prefix ? `${prefix}.${key}` : key;

    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      Object.assign(result, flattenObject(value, newKey));
    } else if (!Array.isArray(value)) {
      result[newKey] = value;
    }
  }

  return result;
}

function convertToRecords(data: unknown): DataRecord[] {
  if (Array.isArray(data)) {
    return data.map((item) => flattenObject(item));
  }

  if (isObject(data)) {
    for (const value of Object.values(data)) {
      if (Array.isArray(value)) {
        return value.map((item) => flattenObject(item));
      }
    }
    return [flattenObject(data)];
  }

  return [];
}

export class DataFlattener {
  process(data: unknown): DataRecord[] {
    return convertToRecords(data);
  }
}

export class DataNormalizer {
  normalizeData(data: DataRecord[]): { data: DataRecord[]; metadata: FieldMetadata } {
    const types: Record<string, string> = {};
    const currency: Record<string, boolean> = {};

    if (data.length === 0) {
      return { data, metadata: { types, currency } };
    }

    const sampleSize = Math.min(data.length, 50);
    const sample = data.slice(0, sampleSize);

    const allKeys = new Set<string>();
    for (const record of sample) {
      for (const key of Object.keys(record)) {
        allKeys.add(key);
      }
    }

    for (const key of allKeys) {
      let numberCount = 0;
      let stringCount = 0;
      let dateCount = 0;

      for (const record of sample) {
        const value = record[key];
        if (value === null || value === undefined) continue;

        if (typeof value === 'number') {
          numberCount++;
        } else if (typeof value === 'string') {
          const lowerVal = value.toLowerCase();
          if (
            lowerVal.includes('$') ||
            lowerVal.includes('usd') ||
            lowerVal.includes('eur') ||
            lowerVal.includes('price') ||
            lowerVal.includes('amount') ||
            lowerVal.includes('cost')
          ) {
            currency[key] = true;
          }

          const datePatterns = [
            /^\d{4}-\d{2}-\d{2}/,
            /^\d{2}\/\d{2}\/\d{4}/,
            /^\w{3}\s+\d{1,2},\s+\d{4}/,
          ];
          if (datePatterns.some((p) => p.test(value))) {
            dateCount++;
          } else {
            stringCount++;
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
    }

    return { data, metadata: { types, currency } };
  }
}

export class PolarsProcessor {
  process(data: unknown): { profile: DataProfile; flat_data: DataRecord[] } {
    const records = convertToRecords(data);

    if (records.length === 0) {
      return {
        profile: {
          columns: {},
          row_count: 0,
          inferred: { categorical_fields: [], time_fields: [] },
        },
        flat_data: [],
      };
    }

    const df = pl.readRecords(records, { inferSchemaLength: 100 });
    const schema = df.schema;
    const rowCount = df.height;

    const columns: Record<string, ColInfo> = {};
    const categoricalFields: string[] = [];
    const timeFields: string[] = [];

    for (const [name, dtype] of Object.entries(schema)) {
      const dtypeStr = (dtype as any).toString();
      const col = df.getColumn(name);
      const nullCount = col.nullCount();
      const uniqueCount = col.nUnique();

      const colInfo: ColInfo = {
        dtype: dtypeStr,
        nullable: nullCount > 0,
      };

      if (nullCount < rowCount && uniqueCount <= 50) {
        const uniqueValues = col.unique().head(10).toArray();
        colInfo.sample_values = uniqueValues.map((v: unknown) => String(v));
      }

      columns[name] = colInfo;

      if (dtypeStr.includes('String') || dtypeStr.includes('Utf8')) {
        let isDateString = false;
        if (colInfo.sample_values && colInfo.sample_values.length > 0) {
          // Check if the majority of samples match common ISO date or timestamp formats
          const dateRegex = /^(\d{4}-\d{2}-\d{2})([T\s]\d{2}:\d{2}:\d{2}(\.\d{1,3})?(Z|[+-]\d{2}:\d{2})?)?$/;
          const matchCount = colInfo.sample_values.filter((v: string) => dateRegex.test(String(v))).length;
          if (matchCount > 0 && matchCount >= colInfo.sample_values.length * 0.5) {
            isDateString = true;
          }
        }

        if (isDateString) {
          timeFields.push(name);
        } else {
          categoricalFields.push(name);
        }
      } else if (dtypeStr.includes('Date') || dtypeStr.includes('Datetime') || dtypeStr.includes('Time')) {
        timeFields.push(name);
      }
    }

    return {
      profile: {
        columns,
        row_count: rowCount,
        inferred: {
          categorical_fields: categoricalFields,
          time_fields: timeFields,
        },
      },
      flat_data: records,
    };
  }

  toDataFrame(data: DataRecord[]): pl.DataFrame {
    return pl.readRecords(data, { inferSchemaLength: 100 });
  }
}
