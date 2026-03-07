import { describe, it, expect } from 'vitest';
import { PolarsProcessor } from '../processor.js';
import { PolarsExecutor } from '../executor.js';
import { ChartSpecSchema } from '../schema.js';
import { Redpill } from '../client.js';

// ─── PolarsProcessor ────────────────────────────────────────────────────────
describe('PolarsProcessor', () => {
    const processor = new PolarsProcessor();

    it('processes an array of objects', () => {
        const { profile, flat_data } = processor.process([
            { a: 1, b: { c: 2 } },
            { a: 3, b: { c: 4 } },
        ]);
        expect(flat_data).toHaveLength(2);
        expect(flat_data[0]).toEqual({ a: 1, 'b.c': 2 });
    });

    it('processes wrapped objects and drops arrays correctly', () => {
        const { flat_data } = processor.process({ tickets: [{ id: 1, tags: ['a', 'b'] }] });
        expect(flat_data).toHaveLength(1);
        expect(flat_data[0]).toEqual({ id: 1 });
    });

    it('infers types correctly and collects categorical sample values', () => {
        const data = [
            { status: 'open', price: 100, date: '2024-01-01' },
            { status: 'closed', price: 200, date: '2024-01-02' },
        ];
        const { profile } = processor.process(data);

        expect(profile.row_count).toBe(2);
        expect(profile.inferred.categorical_fields).toContain('status');
        expect(profile.inferred.time_fields).toContain('date');

        // Assert sample_values were collected for categorical fields
        expect(profile.columns['status']?.sample_values).toEqual(
            expect.arrayContaining(['open', 'closed'])
        );
    });

    it('returns empty profile for empty array input', () => {
        const { profile, flat_data } = processor.process([]);
        expect(flat_data).toEqual([]);
        expect(profile.row_count).toBe(0);
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

// ─── PolarsExecutor ────────────────────────────────────────────────────────────────

describe('PolarsExecutor', () => {
    const executor = new PolarsExecutor();

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
        const open = result.data.find((d: any) => d.x === 'open');
        expect(open?.y).toBe(2);
    });

    it('sums amount by status correctly', () => {
        const result = executor.execute(
            { xAxis: { field: 'status' }, yAxis: { field: 'amount', aggregation: 'sum' } },
            rawData
        );
        const closed = result.data.find((d: any) => d.x === 'closed');
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
        const total = result.data.reduce((sum: number, d: any) => sum + d.y, 0);
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
        const ys = result.data.map((d: any) => d.y);
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
