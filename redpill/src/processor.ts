export interface DataRecord {
  [key: string]: unknown;
}

export interface FieldMetadata {
  types: Record<string, string>;
  currency: Record<string, string>;
}

export class DataFlattener {
  flatten(data: unknown, prefix = ''): DataRecord | null {
    if (data === null || data === undefined) {
      return null;
    }

    if (typeof data === 'object' && !Array.isArray(data)) {
      const result: DataRecord = {};
      for (const [key, value] of Object.entries(data as DataRecord)) {
        const newKey = prefix ? `${prefix}.${key}` : key;
        if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
          const nested = this.flatten(value, newKey);
          if (nested) {
            Object.assign(result, nested);
          }
        } else if (Array.isArray(value)) {
          continue;
        } else {
          result[newKey] = value;
        }
      }
      return result;
    }

    return null;
  }

  process(data: unknown, sampleSize = 100): DataRecord[] {
    if (Array.isArray(data)) {
      const records: DataRecord[] = [];
      for (const item of data) {
        const flat = this.flatten(item);
        if (flat) {
          records.push(flat);
        }
      }
      return records;
    }

    if (typeof data === 'object' && data !== null) {
      const dataObj = data as DataRecord;
      for (const value of Object.values(dataObj)) {
        if (Array.isArray(value)) {
          return this.process(value, sampleSize);
        }
      }
    }

    return [];
  }
}

const CURRENCY_SYMBOLS = ['$', '€', '£', '¥', '₹', '₽', '₩'];
const CURRENCY_CODES = [
  'USD',
  'EUR',
  'GBP',
  'JPY',
  'CNY',
  'INR',
  'AUD',
  'CAD',
  'CHF',
];

export class DataNormalizer {
  isNumericString(value: unknown): boolean {
    if (typeof value !== 'string') return false;
    const cleaned = this.cleanNumericString(value);
    if (!cleaned) return false;
    return !isNaN(parseFloat(cleaned));
  }

  cleanNumericString(value: string): string | null {
    if (typeof value !== 'string') return null;
    let cleaned = value;
    for (const symbol of CURRENCY_SYMBOLS) {
      cleaned = cleaned.replace(symbol, '');
    }
    cleaned = cleaned.replace(/,/g, '');
    cleaned = cleaned.trim();
    return cleaned || null;
  }

  parseNumber(value: unknown): number | null {
    if (value === null || value === undefined) return null;
    if (typeof value === 'number') return value;
    if (typeof value === 'string') {
      const cleaned = this.cleanNumericString(value);
      if (cleaned) {
        const num = parseFloat(cleaned);
        return isNaN(num) ? null : num;
      }
    }
    return null;
  }

  parseDate(value: unknown): string | null {
    if (value === null || value === undefined) return null;
    if (value instanceof Date) return value.toISOString();
    if (typeof value === 'string') {
      const trimmed = value.trim();
      const date = new Date(trimmed);
      if (!isNaN(date.getTime())) {
        return date.toISOString();
      }
    }
    return null;
  }

  inferFieldType(values: unknown[]): string {
    const nonNull = values.filter((v) => v !== null && v !== undefined);
    if (nonNull.length === 0) return 'unknown';

    let dateCount = 0;
    for (const v of nonNull.slice(0, 10)) {
      if (this.parseDate(v)) dateCount++;
    }
    if (dateCount >= nonNull.slice(0, 10).length * 0.8) return 'date';

    let numCount = 0;
    for (const v of nonNull.slice(0, 10)) {
      if (this.parseNumber(v)) numCount++;
    }
    if (numCount >= nonNull.slice(0, 10).length * 0.8) return 'number';

    return 'string';
  }

  detectCurrency(values: unknown[]): string | null {
    let currencyCount = 0;
    let checked = 0;

    for (const v of values.slice(0, 30)) {
      if (typeof v === 'string' && v.trim()) {
        checked++;
        const trimmed = v.trim();

        if (CURRENCY_SYMBOLS.some((c) => trimmed.startsWith(c) || trimmed.endsWith(c))) {
          currencyCount++;
          continue;
        }

        const codeMatch = CURRENCY_CODES.some((code) =>
          new RegExp(`\\b${code}\\b`, 'i').test(v)
        );
        if (codeMatch) currencyCount++;
      }
    }

    if (checked > 0 && currencyCount >= checked * 0.5) {
      return 'currency';
    }
    return null;
  }

  normalizeDataRecord(record: DataRecord, fieldTypes: Record<string, string>): DataRecord {
    const normalized: DataRecord = {};
    for (const [key, value] of Object.entries(record)) {
      const fieldType = fieldTypes[key] || 'string';
      if (fieldType === 'number') {
        const num = this.parseNumber(value);
        normalized[key] = num !== null ? num : value;
      } else if (fieldType === 'date') {
        const dt = this.parseDate(value);
        normalized[key] = dt || value;
      } else {
        normalized[key] = value;
      }
    }
    return normalized;
  }

  normalizeData(data: DataRecord[]): { normalized: DataRecord[]; metadata: FieldMetadata } {
    if (!data || data.length === 0) {
      return { normalized: [], metadata: { types: {}, currency: {} } };
    }

    const fieldTypes: Record<string, string> = {};
    const fieldCurrency: Record<string, string> = {};
    const keys = new Set<string>();

    for (const record of data.slice(0, 50)) {
      for (const key of Object.keys(record)) {
        keys.add(key);
      }
    }

    for (const key of keys) {
      const values = data.slice(0, 50).map((r) => r[key]);
      fieldTypes[key] = this.inferFieldType(values);
      if (fieldTypes[key] === 'number') {
        const currency = this.detectCurrency(values);
        if (currency) fieldCurrency[key] = currency;
      }
    }

    const normalized = data.map((record) => this.normalizeDataRecord(record, fieldTypes));

    return {
      normalized,
      metadata: { types: fieldTypes, currency: fieldCurrency },
    };
  }
}
