# Redpill → Chart Library Integration Guide

This guide shows developers exactly how to take the output of Redpill's `execute()` call and feed it into every major JavaScript / Python charting library. The same `ChartDataResult` shape is produced by both the **JS SDK** and the **Python SDK** (returned via an API).

---

## Understanding the Output Shape

Before looking at individual libraries, understand the two objects you always work with:

### `ChartDataResult.data` — the rows

```ts
type ChartDataItem = {
  x: string | number;         // X-axis value (category, date, label)
  y: number;                  // Y-axis numeric value
  series?: string | number;   // Series/group identifier (present when breakdown is requested)
  labelX?: string;            // Display label for x axis
  labelY?: string;            // Display label for y axis
  labelSeries?: string;       // Display label for series dimension
};
```

**Example — simple (no series):**
```json
[
  { "x": "open",   "y": 42, "labelX": "Status", "labelY": "Count" },
  { "x": "closed", "y": 18, "labelX": "Status", "labelY": "Count" },
  { "x": "pending","y":  7, "labelX": "Status", "labelY": "Count" }
]
```

**Example — with series (breakdown):**
```json
[
  { "x": "open",   "y": 20, "series": "high",   "labelX": "Status", "labelY": "Count", "labelSeries": "Priority" },
  { "x": "open",   "y": 22, "series": "low",    "labelX": "Status", "labelY": "Count", "labelSeries": "Priority" },
  { "x": "closed", "y": 10, "series": "high",   "labelX": "Status", "labelY": "Count", "labelSeries": "Priority" },
  { "x": "closed", "y":  8, "series": "low",    "labelX": "Status", "labelY": "Count", "labelSeries": "Priority" }
]
```

### `ChartDataResult.metadata`

```ts
type ChartMetadata = {
  chartType: string;                          // "bar" | "line" | "pie" | ...
  xAxis: { field: string; label: string };
  yAxis: { field: string; label: string };
  series?: { field: string; label: string };  // present if series used
  warnings?: string[];                        // non-fatal warnings
  originalCount?: number;
  filteredCount?: number;
  currency?: Record<string, string>;          // e.g. { "revenue": "currency" }
};
```

### Key transformation helpers

You'll reach for these helper utilities repeatedly across libraries:

```ts
// Unique series values for grouped/multi-line charts
function getSeriesKeys(data: ChartDataItem[]): (string | number)[] {
  return [...new Set(data.map(d => d.series).filter(Boolean))] as (string | number)[];
}

// Unique x-axis categories
function getCategories(data: ChartDataItem[]): (string | number)[] {
  return [...new Set(data.map(d => d.x))];
}

// Group data by series key — returns map of series → {x, y}[]
function groupBySeries(data: ChartDataItem[]): Map<string | number, { x: string | number; y: number }[]> {
  const map = new Map<string | number, { x: string | number; y: number }[]>();
  for (const item of data) {
    const key = item.series ?? '__default__';
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push({ x: item.x, y: item.y });
  }
  return map;
}

// Pie/donut — aggregate y per x (already aggregated by executor, but safe to re-group)
function toPieData(data: ChartDataItem[]) {
  return data.map(d => ({ name: d.x, value: d.y }));
}
```

---

## 1. Recharts

**Install:** `npm install recharts`

Recharts expects data as an array of plain objects. The Redpill output maps to it almost directly.

### Bar Chart

```tsx
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import type { ChartDataResult } from 'redpill';

const COLORS = ['#6366f1', '#f59e0b', '#10b981', '#ef4444', '#3b82f6', '#8b5cf6'];

function RedpillBarChart({ result }: { result: ChartDataResult }) {
  const { data, metadata } = result;
  const seriesKeys = getSeriesKeys(data);
  const hasSeries = seriesKeys.length > 0;

  // Recharts needs one object per x-category, with series values as keys
  const chartData = hasSeries
    ? getCategories(data).map(cat => {
        const row: Record<string, unknown> = { x: cat };
        for (const item of data.filter(d => d.x === cat)) {
          row[String(item.series)] = item.y;
        }
        return row;
      })
    : data.map(d => ({ x: d.x, y: d.y }));

  return (
    <ResponsiveContainer width="100%" height={400}>
      <BarChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="x" label={{ value: metadata.xAxis.label, position: 'insideBottom', offset: -5 }} />
        <YAxis label={{ value: metadata.yAxis.label, angle: -90, position: 'insideLeft' }} />
        <Tooltip />
        <Legend />
        {hasSeries
          ? seriesKeys.map((key, i) => (
              <Bar key={String(key)} dataKey={String(key)} fill={COLORS[i % COLORS.length]} />
            ))
          : <Bar dataKey="y" name={metadata.yAxis.label} fill={COLORS[0]} />
        }
      </BarChart>
    </ResponsiveContainer>
  );
}
```

### Line Chart

```tsx
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

function RedpillLineChart({ result }: { result: ChartDataResult }) {
  const { data, metadata } = result;
  const seriesKeys = getSeriesKeys(data);
  const hasSeries = seriesKeys.length > 0;

  const chartData = hasSeries
    ? getCategories(data).map(cat => {
        const row: Record<string, unknown> = { x: cat };
        for (const item of data.filter(d => d.x === cat)) {
          row[String(item.series)] = item.y;
        }
        return row;
      })
    : data.map(d => ({ x: d.x, y: d.y }));

  return (
    <ResponsiveContainer width="100%" height={400}>
      <LineChart data={chartData}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="x" />
        <YAxis />
        <Tooltip />
        <Legend />
        {hasSeries
          ? seriesKeys.map((key, i) => (
              <Line key={String(key)} type="monotone" dataKey={String(key)}
                stroke={COLORS[i % COLORS.length]} strokeWidth={2} dot={false} />
            ))
          : <Line type="monotone" dataKey="y" name={metadata.yAxis.label}
              stroke={COLORS[0]} strokeWidth={2} />
        }
      </LineChart>
    </ResponsiveContainer>
  );
}
```

### Pie / Donut Chart

```tsx
import { PieChart, Pie, Cell, Tooltip, Legend } from 'recharts';

function RedpillPieChart({ result, isDonut = false }: { result: ChartDataResult; isDonut?: boolean }) {
  const pieData = result.data.map(d => ({ name: String(d.x), value: d.y }));

  return (
    <PieChart width={400} height={400}>
      <Pie
        data={pieData}
        dataKey="value"
        nameKey="name"
        cx="50%"
        cy="50%"
        outerRadius={150}
        innerRadius={isDonut ? 80 : 0}
        label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(1)}%`}
      >
        {pieData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
      </Pie>
      <Tooltip formatter={(value: number) => value.toLocaleString()} />
      <Legend />
    </PieChart>
  );
}
```

### Scatter Chart

```tsx
import { ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';

function RedpillScatterChart({ result }: { result: ChartDataResult }) {
  const scatterData = result.data.map(d => ({ x: d.x, y: d.y }));
  return (
    <ScatterChart width={400} height={400}>
      <CartesianGrid />
      <XAxis dataKey="x" name={result.metadata.xAxis.label} type="number" />
      <YAxis dataKey="y" name={result.metadata.yAxis.label} />
      <Tooltip cursor={{ strokeDasharray: '3 3' }} />
      <Scatter data={scatterData} fill={COLORS[0]} />
    </ScatterChart>
  );
}
```

### Universal Adapter

```tsx
import type { ChartDataResult } from 'redpill';

function RedpillChart({ result }: { result: ChartDataResult }) {
  const type = result.metadata.chartType;
  switch (type) {
    case 'bar':
    case 'horizontal_bar': return <RedpillBarChart result={result} />;
    case 'line':
    case 'area':           return <RedpillLineChart result={result} />;
    case 'pie':            return <RedpillPieChart result={result} />;
    case 'donut':          return <RedpillPieChart result={result} isDonut />;
    case 'scatter':        return <RedpillScatterChart result={result} />;
    default:               return <RedpillBarChart result={result} />;
  }
}
```

---

## 2. Chart.js (via `react-chartjs-2`)

**Install:** `npm install chart.js react-chartjs-2`

Chart.js uses a `{ labels, datasets }` structure. The adapter below converts Redpill output into this shape.

### Setup (register Chart.js components — do this once in your app)

```ts
import {
  Chart as ChartJS, CategoryScale, LinearScale, BarElement,
  PointElement, LineElement, ArcElement, Title, Tooltip, Legend,
  Filler,
} from 'chart.js';

ChartJS.register(
  CategoryScale, LinearScale, BarElement, PointElement,
  LineElement, ArcElement, Title, Tooltip, Legend, Filler
);
```

### Adapter function

```ts
import type { ChartDataResult, ChartDataItem } from 'redpill';
import type { ChartData, ChartOptions } from 'chart.js';

const DEFAULT_COLORS = [
  'rgba(99, 102, 241, 0.8)',   // indigo
  'rgba(245, 158, 11, 0.8)',   // amber
  'rgba(16, 185, 129, 0.8)',   // emerald
  'rgba(239, 68, 68, 0.8)',    // red
  'rgba(59, 130, 246, 0.8)',   // blue
  'rgba(139, 92, 246, 0.8)',   // violet
];

export function toChartJsData(result: ChartDataResult): ChartData {
  const { data, metadata } = result;
  const seriesKeys = getSeriesKeys(data);
  const categories = getCategories(data);
  const hasSeries = seriesKeys.length > 0;

  if (hasSeries) {
    const grouped = groupBySeries(data);
    const datasets = Array.from(grouped.entries()).map(([key, items], i) => ({
      label: String(key),
      data: categories.map(cat => items.find(d => d.x === cat)?.y ?? 0),
      backgroundColor: DEFAULT_COLORS[i % DEFAULT_COLORS.length],
      borderColor: DEFAULT_COLORS[i % DEFAULT_COLORS.length].replace('0.8', '1'),
      borderWidth: 1,
    }));
    return { labels: categories.map(String), datasets };
  }

  return {
    labels: data.map(d => String(d.x)),
    datasets: [{
      label: metadata.yAxis.label,
      data: data.map(d => d.y),
      backgroundColor: DEFAULT_COLORS,
      borderColor: DEFAULT_COLORS.map(c => c.replace('0.8', '1')),
      borderWidth: 1,
    }],
  };
}

export function toChartJsOptions(result: ChartDataResult): ChartOptions {
  const { metadata } = result;
  return {
    responsive: true,
    plugins: {
      legend: { position: 'top' },
      title: { display: true, text: metadata.xAxis.label + ' vs ' + metadata.yAxis.label },
    },
    scales: {
      x: { title: { display: true, text: metadata.xAxis.label } },
      y: { title: { display: true, text: metadata.yAxis.label } },
    },
  };
}
```

### Bar Chart

```tsx
import { Bar } from 'react-chartjs-2';

function ChartJsBar({ result }: { result: ChartDataResult }) {
  return <Bar data={toChartJsData(result)} options={toChartJsOptions(result)} />;
}
```

### Line Chart

```tsx
import { Line } from 'react-chartjs-2';

function ChartJsLine({ result }: { result: ChartDataResult }) {
  const chartData = toChartJsData(result);
  // Add fill for area chart effect
  chartData.datasets = chartData.datasets.map(ds => ({
    ...ds,
    fill: true,
    tension: 0.4,
  }));
  return <Line data={chartData} options={toChartJsOptions(result)} />;
}
```

### Pie / Doughnut Chart

```tsx
import { Pie, Doughnut } from 'react-chartjs-2';

function ChartJsPie({ result, isDonut = false }: { result: ChartDataResult; isDonut?: boolean }) {
  const pieData: ChartData<'pie'> = {
    labels: result.data.map(d => String(d.x)),
    datasets: [{
      data: result.data.map(d => d.y),
      backgroundColor: DEFAULT_COLORS,
      borderWidth: 2,
      borderColor: '#fff',
    }],
  };
  const Component = isDonut ? Doughnut : Pie;
  return <Component data={pieData} />;
}
```

### Scatter / Bubble Chart

```tsx
import { Scatter } from 'react-chartjs-2';

function ChartJsScatter({ result }: { result: ChartDataResult }) {
  const scatterData: ChartData<'scatter'> = {
    datasets: [{
      label: result.metadata.yAxis.label,
      data: result.data.map(d => ({ x: d.x as number, y: d.y })),
      backgroundColor: DEFAULT_COLORS[0],
    }],
  };
  return <Scatter data={scatterData} />;
}

// Bubble chart (requires a 'r' radius field — map from a third dimension if available)
function ChartJsBubble({ result }: { result: ChartDataResult }) {
  const { Bubble } = require('react-chartjs-2');
  const bubbleData = {
    datasets: [{
      label: result.metadata.yAxis.label,
      data: result.data.map(d => ({
        x: d.x as number,
        y: d.y,
        r: Math.sqrt(d.y) / 2,  // radius proportional to value
      })),
      backgroundColor: DEFAULT_COLORS[0],
    }],
  };
  return <Bubble data={bubbleData} />;
}
```

---

## 3. ECharts (via `echarts-for-react`)

**Install:** `npm install echarts echarts-for-react`

ECharts uses an `option` object. The adapter below creates the full ECharts `option` from Redpill output.

### Adapter function

```ts
import type { ChartDataResult } from 'redpill';

export function toEChartsOption(result: ChartDataResult): object {
  const { data, metadata } = result;
  const seriesKeys = getSeriesKeys(data);
  const categories = getCategories(data).map(String);
  const hasSeries = seriesKeys.length > 0;
  const type = metadata.chartType;

  const baseOption = {
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    legend: hasSeries ? { data: seriesKeys.map(String) } : undefined,
    grid: { left: '3%', right: '4%', bottom: '3%', containLabel: true },
    toolbox: { feature: { saveAsImage: {} } },
  };

  // Pie / Donut
  if (type === 'pie' || type === 'donut') {
    return {
      ...baseOption,
      tooltip: { trigger: 'item', formatter: '{a} <br/>{b}: {c} ({d}%)' },
      series: [{
        name: metadata.yAxis.label,
        type: 'pie',
        radius: type === 'donut' ? ['40%', '70%'] : '70%',
        data: data.map(d => ({ name: String(d.x), value: d.y })),
        emphasis: { itemStyle: { shadowBlur: 10, shadowOffsetX: 0, shadowColor: 'rgba(0,0,0,0.5)' } },
        label: { formatter: '{b}: {d}%' },
      }],
    };
  }

  // Scatter
  if (type === 'scatter') {
    return {
      ...baseOption,
      xAxis: { type: 'value', name: metadata.xAxis.label },
      yAxis: { type: 'value', name: metadata.yAxis.label },
      series: [{
        type: 'scatter',
        symbolSize: 10,
        data: data.map(d => [d.x, d.y]),
      }],
    };
  }

  // Radar
  if (type === 'radar') {
    return {
      ...baseOption,
      radar: { indicator: data.map(d => ({ name: String(d.x), max: Math.max(...data.map(i => i.y)) * 1.2 })) },
      series: [{
        type: 'radar',
        data: [{ value: data.map(d => d.y), name: metadata.yAxis.label }],
      }],
    };
  }

  // Heatmap
  if (type === 'heatmap') {
    return {
      ...baseOption,
      xAxis: { type: 'category', data: categories },
      yAxis: { type: 'value', name: metadata.yAxis.label },
      visualMap: { min: 0, max: Math.max(...data.map(d => d.y)), calculable: true },
      series: [{ type: 'heatmap', data: data.map(d => [d.x, d.y, d.y]) }],
    };
  }

  // Bar / Line / Area / Horizontal Bar (default)
  const isHorizontal = type === 'horizontal_bar';
  const isLine = type === 'line' || type === 'area';

  let series;
  if (hasSeries) {
    const grouped = groupBySeries(data);
    series = Array.from(grouped.entries()).map(([key, items]) => ({
      name: String(key),
      type: isLine ? 'line' : 'bar',
      stack: metadata.chartType === 'area' || metadata.chartType === 'bar' ? undefined : 'total',
      areaStyle: type === 'area' ? {} : undefined,
      smooth: isLine,
      data: categories.map(cat => items.find(d => String(d.x) === cat)?.y ?? 0),
    }));
  } else {
    series = [{
      name: metadata.yAxis.label,
      type: isLine ? 'line' : 'bar',
      areaStyle: type === 'area' ? { opacity: 0.3 } : undefined,
      smooth: isLine,
      data: data.map(d => d.y),
    }];
  }

  return {
    ...baseOption,
    xAxis: isHorizontal
      ? { type: 'value', name: metadata.yAxis.label }
      : { type: 'category', data: categories, name: metadata.xAxis.label },
    yAxis: isHorizontal
      ? { type: 'category', data: categories, name: metadata.xAxis.label }
      : { type: 'value', name: metadata.yAxis.label },
    series,
  };
}
```

### React component

```tsx
import ReactECharts from 'echarts-for-react';

function EChartsRedpill({ result }: { result: ChartDataResult }) {
  const option = toEChartsOption(result);
  return <ReactECharts option={option} style={{ height: 400 }} />;
}
```

---

## 4. ApexCharts (via `react-apexcharts`)

**Install:** `npm install apexcharts react-apexcharts`

ApexCharts uses a `series` + `options` pair. Series format differs between chart types.

### Adapter function

```ts
import type { ChartDataResult } from 'redpill';

export function toApexConfig(result: ChartDataResult) {
  const { data, metadata } = result;
  const type = metadata.chartType;
  const seriesKeys = getSeriesKeys(data);
  const categories = getCategories(data).map(String);
  const hasSeries = seriesKeys.length > 0;

  // --- Pie / Donut ---
  if (type === 'pie' || type === 'donut') {
    return {
      series: data.map(d => d.y),
      options: {
        chart: { type: type === 'donut' ? 'donut' : 'pie' as const },
        labels: data.map(d => String(d.x)),
        legend: { position: 'bottom' as const },
        dataLabels: { formatter: (val: number) => `${val.toFixed(1)}%` },
      },
    };
  }

  // --- Scatter ---
  if (type === 'scatter') {
    return {
      series: [{ name: metadata.yAxis.label, data: data.map(d => ({ x: d.x, y: d.y })) }],
      options: {
        chart: { type: 'scatter' as const, zoom: { enabled: true, type: 'xy' } },
        xaxis: { type: 'numeric' as const, title: { text: metadata.xAxis.label } },
        yaxis: { title: { text: metadata.yAxis.label } },
      },
    };
  }

  // --- Radar ---
  if (type === 'radar') {
    return {
      series: [{ name: metadata.yAxis.label, data: data.map(d => d.y) }],
      options: {
        chart: { type: 'radar' as const },
        xaxis: { categories: data.map(d => String(d.x)) },
      },
    };
  }

  // --- Bar / Line / Area / Horizontal Bar ---
  const apexType =
    type === 'line' ? 'line' :
    type === 'area' ? 'area' :
    type === 'horizontal_bar' ? 'bar' : 'bar';

  let series;
  if (hasSeries) {
    const grouped = groupBySeries(data);
    series = Array.from(grouped.entries()).map(([key, items]) => ({
      name: String(key),
      data: categories.map(cat => items.find(d => String(d.x) === cat)?.y ?? 0),
    }));
  } else {
    series = [{ name: metadata.yAxis.label, data: data.map(d => d.y) }];
  }

  return {
    series,
    options: {
      chart: {
        type: apexType as 'bar' | 'line' | 'area',
        stacked: false,
        toolbar: { show: true },
      },
      plotOptions: {
        bar: { horizontal: type === 'horizontal_bar', borderRadius: 4 },
      },
      xaxis: {
        categories,
        title: { text: type === 'horizontal_bar' ? metadata.yAxis.label : metadata.xAxis.label },
      },
      yaxis: {
        title: { text: type === 'horizontal_bar' ? metadata.xAxis.label : metadata.yAxis.label },
      },
      stroke: type === 'line' || type === 'area' ? { curve: 'smooth' as const, width: 2 } : undefined,
      fill: type === 'area' ? { type: 'gradient', gradient: { shadeIntensity: 1, opacityFrom: 0.7, opacityTo: 0.1 } } : undefined,
      dataLabels: { enabled: false },
      legend: { position: 'top' as const },
      tooltip: { shared: true, intersect: false },
    },
  };
}
```

### React component

```tsx
import ReactApexChart from 'react-apexcharts';

function ApexChartRedpill({ result }: { result: ChartDataResult }) {
  const { series, options } = toApexConfig(result);
  const apexType = result.metadata.chartType === 'donut' ? 'donut' :
                   result.metadata.chartType === 'pie' ? 'pie' :
                   result.metadata.chartType === 'line' ? 'line' :
                   result.metadata.chartType === 'area' ? 'area' : 'bar';

  return (
    <ReactApexChart
      type={apexType}
      series={series}
      options={options}
      height={400}
    />
  );
}
```

---

## 5. Plotly.js (via `react-plotly.js`)

**Install:** `npm install plotly.js react-plotly.js`  
*TypeScript:* `npm install -D @types/plotly.js`

### Adapter function

```ts
import type { ChartDataResult } from 'redpill';
import type { Data, Layout } from 'plotly.js';

export function toPlotlyTraces(result: ChartDataResult): { data: Data[]; layout: Partial<Layout> } {
  const { data, metadata } = result;
  const type = metadata.chartType;
  const seriesKeys = getSeriesKeys(data);
  const hasSeries = seriesKeys.length > 0;

  const layout: Partial<Layout> = {
    title: { text: `${metadata.xAxis.label} vs ${metadata.yAxis.label}` },
    xaxis: { title: { text: metadata.xAxis.label } },
    yaxis: { title: { text: metadata.yAxis.label } },
    legend: { orientation: 'h', y: -0.2 },
    margin: { t: 40, b: 80 },
    autosize: true,
  };

  if (type === 'pie' || type === 'donut') {
    return {
      data: [{
        type: 'pie',
        labels: data.map(d => String(d.x)),
        values: data.map(d => d.y),
        hole: type === 'donut' ? 0.4 : 0,
        textinfo: 'label+percent',
      }],
      layout: { ...layout, xaxis: undefined, yaxis: undefined },
    };
  }

  if (type === 'scatter') {
    return {
      data: [{
        type: 'scatter',
        mode: 'markers',
        x: data.map(d => d.x),
        y: data.map(d => d.y),
        marker: { size: 8 },
        name: metadata.yAxis.label,
      }],
      layout,
    };
  }

  if (type === 'heatmap') {
    const xs = getCategories(data).map(String);
    return {
      data: [{
        type: 'heatmap',
        x: data.map(d => String(d.x)),
        z: [data.map(d => d.y)],
        colorscale: 'Viridis',
      }],
      layout,
    };
  }

  const plotlyType =
    type === 'bar' || type === 'horizontal_bar' ? 'bar' :
    type === 'area' ? 'scatter' : 'scatter';

  const orientation = type === 'horizontal_bar' ? 'h' : 'v';

  const makeTrace = (items: { x: string | number; y: number }[], name: string, color?: string): Data => ({
    type: plotlyType as 'bar' | 'scatter',
    orientation,
    x: orientation === 'h' ? items.map(d => d.y) : items.map(d => d.x),
    y: orientation === 'h' ? items.map(d => d.x) : items.map(d => d.y),
    name,
    mode: type === 'line' || type === 'area' ? 'lines' : undefined,
    fill: type === 'area' ? 'tozeroy' : undefined,
    line: type === 'line' || type === 'area' ? { shape: 'spline' } : undefined,
    marker: color ? { color } : undefined,
  });

  const PLOTLY_COLORS = ['#6366f1', '#f59e0b', '#10b981', '#ef4444', '#3b82f6', '#8b5cf6'];

  if (hasSeries) {
    const grouped = groupBySeries(data);
    const traces = Array.from(grouped.entries()).map(([key, items], i) =>
      makeTrace(items, String(key), PLOTLY_COLORS[i % PLOTLY_COLORS.length])
    );
    return { data: traces, layout };
  }

  return {
    data: [makeTrace(data.map(d => ({ x: d.x, y: d.y })), metadata.yAxis.label, PLOTLY_COLORS[0])],
    layout,
  };
}
```

### React component

```tsx
import Plot from 'react-plotly.js';

function PlotlyRedpill({ result }: { result: ChartDataResult }) {
  const { data: traces, layout } = toPlotlyTraces(result);
  return <Plot data={traces} layout={layout} style={{ width: '100%', height: 400 }} useResizeHandler />;
}
```

---

## 6. D3.js

**Install:** `npm install d3`  
*TypeScript:* `npm install -D @types/d3`

D3 gives you full control. Below are production-ready, self-contained React wrappers using the `useEffect+useRef` pattern.

### Bar Chart

```tsx
import { useEffect, useRef } from 'react';
import * as d3 from 'd3';
import type { ChartDataResult } from 'redpill';

export function D3BarChart({ result }: { result: ChartDataResult }) {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!svgRef.current || !result.data.length) return;
    const { data, metadata } = result;
    const margin = { top: 20, right: 20, bottom: 60, left: 60 };
    const width = 600 - margin.left - margin.right;
    const height = 400 - margin.top - margin.bottom;

    d3.select(svgRef.current).selectAll('*').remove();

    const svg = d3.select(svgRef.current)
      .attr('viewBox', `0 0 ${width + margin.left + margin.right} ${height + margin.top + margin.bottom}`)
      .append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);

    const x = d3.scaleBand()
      .domain(data.map(d => String(d.x)))
      .range([0, width])
      .padding(0.2);

    const y = d3.scaleLinear()
      .domain([0, d3.max(data, d => d.y)! * 1.1])
      .range([height, 0]);

    // Axes
    svg.append('g').attr('transform', `translate(0,${height})`).call(d3.axisBottom(x));
    svg.append('g').call(d3.axisLeft(y).ticks(6));

    // Axis labels
    svg.append('text').attr('x', width / 2).attr('y', height + 50)
      .attr('text-anchor', 'middle').text(metadata.xAxis.label);
    svg.append('text').attr('transform', 'rotate(-90)').attr('x', -height / 2).attr('y', -45)
      .attr('text-anchor', 'middle').text(metadata.yAxis.label);

    // Bars with transition
    svg.selectAll('.bar')
      .data(data)
      .join('rect')
      .attr('class', 'bar')
      .attr('x', d => x(String(d.x))!)
      .attr('width', x.bandwidth())
      .attr('y', height)
      .attr('height', 0)
      .attr('fill', '#6366f1')
      .attr('rx', 3)
      .transition().duration(800).ease(d3.easeCubicOut)
      .attr('y', d => y(d.y))
      .attr('height', d => height - y(d.y));

    // Tooltip
    const tooltip = d3.select(svgRef.current.parentElement)
      .append('div')
      .style('position', 'absolute')
      .style('background', 'rgba(0,0,0,0.7)')
      .style('color', '#fff')
      .style('padding', '6px 10px')
      .style('border-radius', '4px')
      .style('font-size', '12px')
      .style('pointer-events', 'none')
      .style('opacity', 0);

    svg.selectAll('.bar')
      .on('mouseover', (event, d: any) => {
        tooltip.transition().duration(200).style('opacity', 1);
        tooltip.html(`<b>${d.x}</b>: ${d.y.toLocaleString()}`);
      })
      .on('mousemove', (event) => {
        tooltip.style('left', `${event.offsetX + 10}px`).style('top', `${event.offsetY - 30}px`);
      })
      .on('mouseout', () => tooltip.transition().duration(300).style('opacity', 0));

    return () => { tooltip.remove(); };
  }, [result]);

  return <svg ref={svgRef} style={{ width: '100%', height: 400 }} />;
}
```

### Line Chart

```tsx
export function D3LineChart({ result }: { result: ChartDataResult }) {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!svgRef.current || !result.data.length) return;
    const { data, metadata } = result;
    const margin = { top: 20, right: 20, bottom: 60, left: 60 };
    const width = 600 - margin.left - margin.right;
    const height = 400 - margin.top - margin.bottom;

    d3.select(svgRef.current).selectAll('*').remove();
    const svg = d3.select(svgRef.current)
      .attr('viewBox', `0 0 ${width + margin.left + margin.right} ${height + margin.top + margin.bottom}`)
      .append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);

    const x = d3.scalePoint().domain(data.map(d => String(d.x))).range([0, width]);
    const y = d3.scaleLinear().domain([0, d3.max(data, d => d.y)! * 1.1]).range([height, 0]);

    svg.append('g').attr('transform', `translate(0,${height})`).call(d3.axisBottom(x));
    svg.append('g').call(d3.axisLeft(y));

    // Gridlines
    svg.append('g').attr('class', 'grid')
      .call(d3.axisLeft(y).ticks(6).tickSize(-width).tickFormat(() => ''))
      .selectAll('line').style('stroke', '#e5e7eb').style('stroke-dasharray', '3 3');

    const line = d3.line<(typeof data)[0]>()
      .x(d => x(String(d.x))!)
      .y(d => y(d.y))
      .curve(d3.curveMonotoneX);

    svg.append('path')
      .datum(data)
      .attr('fill', 'none')
      .attr('stroke', '#6366f1')
      .attr('stroke-width', 2.5)
      .attr('d', line)
      .attr('stroke-dasharray', function() { return (this as SVGPathElement).getTotalLength(); })
      .attr('stroke-dashoffset', function() { return (this as SVGPathElement).getTotalLength(); })
      .transition().duration(1000)
      .attr('stroke-dashoffset', 0);

    svg.selectAll('.dot')
      .data(data)
      .join('circle')
      .attr('class', 'dot')
      .attr('cx', d => x(String(d.x))!)
      .attr('cy', d => y(d.y))
      .attr('r', 4)
      .attr('fill', '#6366f1');
  }, [result]);

  return <svg ref={svgRef} style={{ width: '100%', height: 400 }} />;
}
```

---

## 7. Victory (React Native / Web)

**Install:** `npm install victory`

Victory is popular for React Native but works in React too. Data must be `[{ x, y }]` arrays.

### Adapter

```ts
function toVictoryData(data: ChartDataItem[]) {
  return data.map(d => ({ x: d.x, y: d.y, label: `${d.x}: ${d.y}` }));
}

function toVictorySeriesData(data: ChartDataItem[]) {
  const grouped = groupBySeries(data);
  return Array.from(grouped.entries()).map(([key, items]) => ({
    key: String(key),
    data: items.map(d => ({ x: d.x, y: d.y })),
  }));
}
```

### Bar Chart

```tsx
import { VictoryBar, VictoryChart, VictoryAxis, VictoryTheme, VictoryTooltip } from 'victory';

function VictoryBarChart({ result }: { result: ChartDataResult }) {
  const { data, metadata } = result;
  const seriesKeys = getSeriesKeys(data);
  const hasSeries = seriesKeys.length > 0;

  return (
    <VictoryChart theme={VictoryTheme.material} domainPadding={20} height={400}>
      <VictoryAxis label={metadata.xAxis.label} />
      <VictoryAxis dependentAxis label={metadata.yAxis.label} />
      {hasSeries
        ? toVictorySeriesData(data).map(({ key, data: seriesData }, i) => (
            <VictoryBar key={key} data={seriesData} labelComponent={<VictoryTooltip />}
              style={{ data: { fill: COLORS[i] } }} />
          ))
        : <VictoryBar data={toVictoryData(data)} labelComponent={<VictoryTooltip />}
            style={{ data: { fill: '#6366f1' } }} />
      }
    </VictoryChart>
  );
}
```

### Pie Chart

```tsx
import { VictoryPie } from 'victory';

function VictoryPieChart({ result }: { result: ChartDataResult }) {
  return (
    <VictoryPie
      data={result.data.map(d => ({ x: String(d.x), y: d.y }))}
      colorScale={['#6366f1', '#f59e0b', '#10b981', '#ef4444', '#3b82f6']}
      labels={({ datum }) => `${datum.x}: ${datum.y}`}
    />
  );
}
```

---

## 8. Python: Matplotlib / Seaborn / Plotly

When using the **Python SDK**, `ChartDataResult.data` is a list of dicts. The same transformation logic applies.

### Setup helpers (Python)

```python
from redpill.spec.schema import ChartDataResult
from typing import Any

def get_series_keys(data: list[dict]) -> list[Any]:
    return list(dict.fromkeys(d["series"] for d in data if "series" in d))

def get_categories(data: list[dict]) -> list[Any]:
    return list(dict.fromkeys(d["x"] for d in data))

def group_by_series(data: list[dict]) -> dict[Any, list[dict]]:
    groups: dict[Any, list[dict]] = {}
    for item in data:
        key = item.get("series", "__default__")
        groups.setdefault(key, []).append(item)
    return groups
```

### Matplotlib

```python
import matplotlib.pyplot as plt
import matplotlib.patches as mpatches
import numpy as np

COLORS = ["#6366f1", "#f59e0b", "#10b981", "#ef4444", "#3b82f6", "#8b5cf6"]

def plot_redpill(result: ChartDataResult):
    data = result.data
    metadata = result.metadata
    chart_type = metadata.get("chartType", "bar")
    series_keys = get_series_keys(data)
    categories = get_categories(data)
    has_series = bool(series_keys)

    fig, ax = plt.subplots(figsize=(10, 6))

    if chart_type in ("pie", "donut"):
        labels = [str(d["x"]) for d in data]
        values = [d["y"] for d in data]
        wedge_props = {"width": 0.5} if chart_type == "donut" else {}
        ax.pie(values, labels=labels, autopct="%1.1f%%", colors=COLORS[:len(data)],
               wedgeprops=wedge_props)
        ax.set_title(f"{metadata['xAxis']['label']} Distribution")

    elif chart_type == "scatter":
        xs = [d["x"] for d in data]
        ys = [d["y"] for d in data]
        ax.scatter(xs, ys, color=COLORS[0], alpha=0.7)
        ax.set_xlabel(metadata["xAxis"]["label"])
        ax.set_ylabel(metadata["yAxis"]["label"])

    elif chart_type in ("bar", "horizontal_bar"):
        x_pos = np.arange(len(categories))
        if has_series:
            grouped = group_by_series(data)
            width = 0.8 / len(series_keys)
            patches = []
            for i, (key, items) in enumerate(grouped.items()):
                cat_map = {str(d["x"]): d["y"] for d in items}
                ys = [cat_map.get(str(cat), 0) for cat in categories]
                offset = (i - len(series_keys) / 2 + 0.5) * width
                if chart_type == "horizontal_bar":
                    ax.barh([p + offset for p in x_pos], ys, width, color=COLORS[i % len(COLORS)], label=str(key))
                else:
                    ax.bar(x_pos + offset, ys, width, color=COLORS[i % len(COLORS)], label=str(key))
                patches.append(mpatches.Patch(color=COLORS[i % len(COLORS)], label=str(key)))
            ax.legend(handles=patches)
        else:
            ys = [d["y"] for d in data]
            if chart_type == "horizontal_bar":
                ax.barh(x_pos, ys, color=COLORS[0])
                ax.set_yticks(x_pos)
                ax.set_yticklabels([str(c) for c in categories])
            else:
                ax.bar(x_pos, ys, color=COLORS[0])
                ax.set_xticks(x_pos)
                ax.set_xticklabels([str(c) for c in categories], rotation=45, ha="right")

        if chart_type == "horizontal_bar":
            ax.set_xlabel(metadata["yAxis"]["label"])
            ax.set_ylabel(metadata["xAxis"]["label"])
        else:
            ax.set_xlabel(metadata["xAxis"]["label"])
            ax.set_ylabel(metadata["yAxis"]["label"])

    elif chart_type in ("line", "area"):
        if has_series:
            grouped = group_by_series(data)
            for i, (key, items) in enumerate(grouped.items()):
                cat_map = {str(d["x"]): d["y"] for d in items}
                ys = [cat_map.get(str(cat), 0) for cat in categories]
                ax.plot(categories, ys, color=COLORS[i % len(COLORS)], label=str(key), linewidth=2)
                if chart_type == "area":
                    ax.fill_between(range(len(categories)), ys, alpha=0.2, color=COLORS[i % len(COLORS)])
            ax.legend()
        else:
            ys = [d["y"] for d in data]
            ax.plot(categories, ys, color=COLORS[0], linewidth=2)
            if chart_type == "area":
                ax.fill_between(range(len(categories)), ys, alpha=0.2, color=COLORS[0])
        ax.set_xlabel(metadata["xAxis"]["label"])
        ax.set_ylabel(metadata["yAxis"]["label"])

    plt.tight_layout()
    plt.show()
```

### Plotly Python

```python
import plotly.graph_objects as go
import plotly.express as px

def plot_redpill_plotly(result: ChartDataResult) -> go.Figure:
    data = result.data
    metadata = result.metadata
    chart_type = metadata.get("chartType", "bar")
    series_keys = get_series_keys(data)
    categories = get_categories(data)
    has_series = bool(series_keys)

    if chart_type in ("pie", "donut"):
        fig = go.Figure(go.Pie(
            labels=[str(d["x"]) for d in data],
            values=[d["y"] for d in data],
            hole=0.4 if chart_type == "donut" else 0,
            textinfo="label+percent",
        ))

    elif chart_type == "scatter":
        fig = px.scatter(
            x=[d["x"] for d in data], y=[d["y"] for d in data],
            labels={"x": metadata["xAxis"]["label"], "y": metadata["yAxis"]["label"]}
        )

    elif chart_type in ("bar", "horizontal_bar"):
        orientation = "h" if chart_type == "horizontal_bar" else "v"
        if has_series:
            grouped = group_by_series(data)
            fig = go.Figure()
            for key, items in grouped.items():
                cat_map = {str(d["x"]): d["y"] for d in items}
                ys = [cat_map.get(str(cat), 0) for cat in categories]
                if orientation == "h":
                    fig.add_trace(go.Bar(y=categories, x=ys, name=str(key), orientation="h"))
                else:
                    fig.add_trace(go.Bar(x=categories, y=ys, name=str(key)))
        else:
            fig = go.Figure(go.Bar(
                x=[d["x"] for d in data] if orientation == "v" else [d["y"] for d in data],
                y=[d["y"] for d in data] if orientation == "v" else [d["x"] for d in data],
                orientation=orientation,
                marker_color="#6366f1",
            ))
        fig.update_layout(barmode="group")

    elif chart_type in ("line", "area"):
        if has_series:
            grouped = group_by_series(data)
            fig = go.Figure()
            for key, items in grouped.items():
                cat_map = {str(d["x"]): d["y"] for d in items}
                ys = [cat_map.get(str(cat), 0) for cat in categories]
                fig.add_trace(go.Scatter(
                    x=list(categories), y=ys, name=str(key), mode="lines",
                    fill="tozeroy" if chart_type == "area" else None,
                ))
        else:
            fig = go.Figure(go.Scatter(
                x=[d["x"] for d in data], y=[d["y"] for d in data],
                mode="lines", fill="tozeroy" if chart_type == "area" else None,
                line={"color": "#6366f1"},
            ))
    else:
        fig = go.Figure()

    fig.update_layout(
        title=f"{metadata['xAxis']['label']} vs {metadata['yAxis']['label']}",
        xaxis_title=metadata["xAxis"]["label"],
        yaxis_title=metadata["yAxis"]["label"],
        template="plotly_white",
        legend={"orientation": "h", "y": -0.2},
    )
    return fig


# Usage
result = rp.execute(spec, data)
fig = plot_redpill_plotly(result)
fig.show()                # interactive browser
fig.write_image("chart.png")  # static export (needs kaleido)
```

---

## 9. End-to-End: API → Chart (Next.js Example)

This shows the complete flow from a Next.js API route to a rendered chart, matching the pattern used by the Redpill reference webapp.

### `/app/api/chart/route.ts` (already in the JS webapp)

```ts
// POST /api/chart  { data, prompt }
// Returns: { spec, chartData, metadata }
```

### `ChartRenderer.tsx` — auto-selects the right library

```tsx
'use client';
import { useState } from 'react';
import type { ChartDataResult } from 'redpill';

type ApiResponse = { spec: any; chartData: any[]; metadata: any };

export function ChartRenderer() {
  const [result, setResult] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(false);

  async function generateChart(data: unknown, prompt: string) {
    setLoading(true);
    const res = await fetch('/api/chart', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data, prompt }),
    });
    const json = await res.json();
    setResult(json);
    setLoading(false);
  }

  // Reconstruct ChartDataResult from API response
  const chartResult: ChartDataResult | null = result
    ? { data: result.chartData, metadata: result.metadata }
    : null;

  return (
    <div>
      <button onClick={() => generateChart(myData, "tickets by status")} disabled={loading}>
        {loading ? 'Generating...' : 'Generate Chart'}
      </button>
      {chartResult && <ApexChartRedpill result={chartResult} />}
    </div>
  );
}
```

---

## 10. Output Data Shape Quick Reference

| Library | Input format needed | Adapter to use |
|---------|---------------------|----------------|
| **Recharts** | `[{ x, y, [seriesKey]: value }]` | pivot `data` by category |
| **Chart.js** | `{ labels: [], datasets: [{ data: [] }] }` | `toChartJsData()` |
| **ECharts** | `{ xAxis: {...}, series: [{data:[]}] }` | `toEChartsOption()` |
| **ApexCharts** | `{ series: [{name, data:[]}], options: {} }` | `toApexConfig()` |
| **Plotly** | `[{ type, x:[], y:[] }]` + `layout` | `toPlotlyTraces()` |
| **D3.js** | raw `data` array (direct DOM manipulation) | use helpers directly |
| **Victory** | `[{ x, y }]` per series | `toVictoryData()` |
| **Matplotlib** | lists of x/y values | `plot_redpill()` |
| **Plotly Python** | `go.Figure` + traces | `plot_redpill_plotly()` |

---

## 11. Currency & Formatting

When `metadata.currency` contains entries (e.g. `{ "revenue": "currency" }`), format y-axis values accordingly:

```ts
function formatValue(value: number, yField: string, currency: Record<string, string>): string {
  if (currency[yField]) {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
  }
  return value.toLocaleString();
}
```

```python
# Python equivalent
def format_value(value: float, y_field: str, currency: dict) -> str:
    if y_field in currency:
        return f"${value:,.2f}"
    return f"{value:,}"
```

---

## 12. Displaying Warnings

Always surface `metadata.warnings` to the user:

```tsx
function WarningBanner({ result }: { result: ChartDataResult }) {
  if (!result.metadata.warnings?.length) return null;
  return (
    <div className="bg-yellow-50 border border-yellow-200 rounded p-3 mb-4">
      {result.metadata.warnings.map((w, i) => (
        <p key={i} className="text-yellow-800 text-sm">⚠️ {w}</p>
      ))}
    </div>
  );
}
```

---

*For the full `ChartSpec` reference, filter operators, and chart type list see [README.md](./README.md).*
