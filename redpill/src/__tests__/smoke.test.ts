import { describe, it, expect } from 'vitest';
import { DataFlattener, DataNormalizer } from '../processor.js';
import { Executor } from '../executor.js';
import { ChartSpecSchema } from '../schema.js';
import { Redpill } from '../client.js';

// ─── DataFlattener ───────────────────────────────────────────────────────────

describe('DataFlattener', () => {
    const flattener = new DataFlattener();

    it('flattens a nested object with dot notation keys', () => {
        const result = flattener.flatten({ user: { name: 'Alice', city: 'NY' }, score: 10 });
        expect(result).toEqual({ 'user.name': 'Alice', 'user.city': 'NY', score: 10 });
    });

    it('returns null for null input', () => {
        expect(flattener.flatten(null)).toBeNull();
    });

    it('processes an array of objects', () => {
        const records = flattener.process([
            { a: 1, b: { c: 2 } },
            { a: 3, b: { c: 4 } },
        ]);
        expect(records).toHaveLength(2);
        expect(records[0]).toEqual({ a: 1, 'b.c': 2 });
        expect(records[1]).toEqual({ a: 3, 'b.c': 4 });
    });

    it('processes a wrapped object { key: [...] }', () => {
        const records = flattener.process({ tickets: [{ id: 1, status: 'open' }] });
        expect(records).toHaveLength(1);
        expect(records[0]).toMatchObject({ id: 1, status: 'open' });
    });

    it('drops nested arrays inside records', () => {
        const result = flattener.flatten({ name: 'Bob', tags: ['a', 'b'] });
        expect(result).toEqual({ name: 'Bob' });
        expect(result).not.toHaveProperty('tags');
    });

    it('returns empty array for empty array input', () => {
        expect(flattener.process([])).toEqual([]);
    });
});

// ─── DataNormalizer ──────────────────────────────────────────────────────────

describe('DataNormalizer', () => {
    const normalizer = new DataNormalizer();

    it('infers "number" type for numeric values', () => {
        expect(normalizer.inferFieldType([1, 2, 3, 4, 5])).toBe('number');
    });

    it('infers "string" type for string values', () => {
        expect(normalizer.inferFieldType(['open', 'closed', 'pending'])).toBe('string');
    });

    it('infers "number" for currency strings', () => {
        expect(normalizer.inferFieldType(['$1,200', '$500', '$3,400'])).toBe('number');
    });

    it('detects currency in string values', () => {
        expect(normalizer.detectCurrency(['$1,200', '$500', '$300'])).toBe('currency');
    });

    it('returns null currency when no currency symbols', () => {
        expect(normalizer.detectCurrency([100, 200, 300])).toBeNull();
    });

    it('parses a numeric string to a number', () => {
        expect(normalizer.parseNumber('1,234.56')).toBeCloseTo(1234.56);
    });

    it('parses a currency string to a number', () => {
        expect(normalizer.parseNumber('$1,200')).toBe(1200);
    });

    it('returns null when value is not parseable', () => {
        expect(normalizer.parseNumber('hello')).toBeNull();
    });

    it('normalises a whole dataset correctly', () => {
        const { normalized, metadata } = normalizer.normalizeData([
            { status: 'open', amount: '$1,200' },
            { status: 'closed', amount: '$500' },
        ]);
        expect(normalized[0].amount).toBe(1200);
        expect(metadata.currency).toHaveProperty('amount');
    });
});

// ─── ChartSpecSchema (Zod) ───────────────────────────────────────────────────

describe('ChartSpecSchema', () => {
    it('parses a valid minimal spec', () => {
        const spec = ChartSpecSchema.parse({
            chartType: 'bar',
            xAxis: { field: 'status' },
            yAxis: { field: 'count', aggregation: 'count' },
        });
        expect(spec.chartType).toBe('bar');
        expect(spec.xAxis.field).toBe('status');
    });

    it('throws on an invalid chart type', () => {
        expect(() =>
            ChartSpecSchema.parse({
                chartType: 'unknown_type',
                xAxis: { field: 'a' },
                yAxis: { field: 'b' },
            })
        ).toThrow();
    });

    it('accepts all supported chart types', () => {
        const types = ['bar', 'horizontal_bar', 'line', 'area', 'pie', 'donut',
            'scatter', 'bubble', 'radar', 'gauge', 'funnel',
            'heatmap', 'treemap', 'waterfall', 'candlestick', 'polar'];
        for (const chartType of types) {
            expect(() =>
                ChartSpecSchema.parse({ chartType, xAxis: { field: 'x' }, yAxis: { field: 'y' } })
            ).not.toThrow();
        }
    });

    it('validates filter operators', () => {
        const spec = ChartSpecSchema.parse({
            chartType: 'bar',
            xAxis: { field: 'status' },
            yAxis: { field: 'count' },
            params: {
                filters: [{ field: 'priority', operator: 'eq', value: 'high' }],
            },
        });
        expect(spec.params?.filters?.[0].operator).toBe('eq');
    });
});

// ─── Executor ────────────────────────────────────────────────────────────────

describe('Executor', () => {
    const executor = new Executor();

    const rawData = [
        { status: 'open', priority: 'high', amount: 100 },
        { status: 'open', priority: 'low', amount: 200 },
        { status: 'closed', priority: 'high', amount: 300 },
        { status: 'closed', priority: 'low', amount: 400 },
        { status: 'pending', priority: 'high', amount: 150 },
    ];

    it('counts by status correctly', () => {
        const result = executor.execute(
            { xAxis: { field: 'status' }, yAxis: { field: 'status', aggregation: 'count' } },
            rawData
        );
        expect(result.data.length).toBe(3);
        const open = result.data.find(d => d.x === 'open');
        expect(open?.y).toBe(2);
    });

    it('sums amount by status correctly', () => {
        const result = executor.execute(
            { xAxis: { field: 'status' }, yAxis: { field: 'amount', aggregation: 'sum' } },
            rawData
        );
        const closed = result.data.find(d => d.x === 'closed');
        expect(closed?.y).toBe(700);
    });

    it('applies eq filter correctly', () => {
        const result = executor.execute(
            {
                xAxis: { field: 'status' },
                yAxis: { field: 'status', aggregation: 'count' },
                params: { filters: [{ field: 'priority', operator: 'eq', value: 'high' }] },
            },
            rawData
        );
        const total = result.data.reduce((sum, d) => sum + d.y, 0);
        expect(total).toBe(3); // 3 high priority records
    });

    it('applies limit correctly', () => {
        const result = executor.execute(
            {
                xAxis: { field: 'status' },
                yAxis: { field: 'status', aggregation: 'count' },
                params: { limit: 2 },
            },
            rawData
        );
        expect(result.data.length).toBe(2);
    });

    it('handles series (breakdown) correctly', () => {
        const result = executor.execute(
            {
                xAxis: { field: 'status' },
                yAxis: { field: 'status', aggregation: 'count' },
                series: { field: 'priority' },
            },
            rawData
        );
        // open-high=1, open-low=1, closed-high=1, closed-low=1, pending-high=1
        expect(result.data.length).toBe(5);
        expect(result.data[0]).toHaveProperty('series');
    });

    it('returns metadata with correct chartType', () => {
        const result = executor.execute(
            { chartType: 'line', xAxis: { field: 'status' }, yAxis: { field: 'status', aggregation: 'count' } },
            rawData
        );
        expect(result.metadata.chartType).toBe('line');
    });

    it('works with wrapped object input { key: [...] }', () => {
        const result = executor.execute(
            { xAxis: { field: 'status' }, yAxis: { field: 'status', aggregation: 'count' } },
            { tickets: rawData }
        );
        expect(result.data.length).toBeGreaterThan(0);
    });

    it('handles empty data gracefully', () => {
        const result = executor.execute(
            { xAxis: { field: 'status' }, yAxis: { field: 'status', aggregation: 'count' } },
            []
        );
        expect(result.data).toEqual([]);
    });

    it('applies sort asc correctly', () => {
        const result = executor.execute(
            {
                xAxis: { field: 'status' },
                yAxis: { field: 'status', aggregation: 'count' },
                params: { sort: { field: 'y', direction: 'asc' } },
            },
            rawData
        );
        const ys = result.data.map(d => d.y);
        expect(ys).toEqual([...ys].sort((a, b) => a - b));
    });

    it('adds a warning for empty filtered result', () => {
        const result = executor.execute(
            {
                xAxis: { field: 'status' },
                yAxis: { field: 'status', aggregation: 'count' },
                params: { filters: [{ field: 'status', operator: 'eq', value: 'nonexistent' }] },
            },
            rawData
        );
        expect(result.metadata.warnings).toBeDefined();
        expect(result.metadata.warnings?.[0]).toMatch(/empty/i);
    });
});

// ─── Redpill client ──────────────────────────────────────────────────────────

describe('Redpill client', () => {
    it('throws when build() is called without setLlm()', () => {
        expect(() => new Redpill().build()).toThrow();
    });

    it('does not throw when setLlm() is provided before build()', () => {
        const dummyLlm = async () => ({ content: '{}' });
        expect(() => new Redpill().setLlm(dummyLlm).build()).not.toThrow();
    });

    it('allows method chaining on config setters', () => {
        const dummyLlm = async () => ({ content: '{}' });
        const rp = new Redpill()
            .setLlm(dummyLlm)
            .temperature(0.3)
            .maxTokens(1000)
            .sampleSize(20)
            .debugMode(true)
            .build();
        // @ts-expect-error — accessing private for test purposes
        expect(rp.config.temperature).toBe(0.3);
        // @ts-expect-error
        expect(rp.config.maxTokens).toBe(1000);
        // @ts-expect-error
        expect(rp.config.sampleSize).toBe(20);
        // @ts-expect-error
        expect(rp.config.debugMode).toBe(true);
    });

    it('execute() works without needing LLM', () => {
        const dummyLlm = async () => ({ content: '{}' });
        const rp = new Redpill().setLlm(dummyLlm).build();
        const result = rp.execute(
            { xAxis: { field: 'status' }, yAxis: { field: 'status', aggregation: 'count' } },
            [{ status: 'open' }, { status: 'closed' }] as unknown as Record<string, unknown>
        );
        expect(result.data.length).toBe(2);
    });
});
