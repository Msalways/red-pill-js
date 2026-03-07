"use client";

import { useState, useEffect, useRef } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  PieChart, Pie, LineChart, Line, AreaChart, Area, ScatterChart, Scatter,
  RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, Cell
} from 'recharts';
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, BarElement, ArcElement, Title, Tooltip as ChartTooltip, Legend as ChartLegend } from 'chart.js';
import Chart from 'chart.js/auto';
import dynamic from 'next/dynamic';

const ReactApexChart = dynamic(() => import('react-apexcharts'), { ssr: false });
const ReactECharts = dynamic(() => import('echarts-for-react'), { ssr: false });

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, ArcElement, Title, ChartTooltip, ChartLegend);

interface ChartData {
  x: string | number;
  y: number;
  series?: string | number;
  label_x?: string;
  label_y?: string;
  label_series?: string;
}

interface Metadata {
  chartType: string;
  xAxis: { field: string; label: string };
  yAxis: { field: string; label: string };
  series?: { field: string; label: string };
  warnings?: string[];
  originalCount?: number;
  filteredCount?: number;
}

interface SavedSpec {
  spec: any;
  metadata: Metadata;
  timestamp: string;
}

const CHART_LIBRARIES = [
  { id: 'recharts', name: 'Recharts', description: 'React SVG charts' },
  { id: 'chartjs', name: 'Chart.js', description: 'Canvas-based charts' },
  { id: 'apexcharts', name: 'ApexCharts', description: 'Interactive SVG charts' },
  { id: 'echarts', name: 'Apache ECharts', description: 'Powerful canvas charting' },
];

export default function ExecutorPage() {
  const [prompt, setPrompt] = useState('');
  const [data, setData] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ chartData: ChartData[]; metadata: Metadata; spec: any } | null>(null);
  const [error, setError] = useState('');
  const [selectedLibrary, setSelectedLibrary] = useState('recharts');
  const [savedSpecs, setSavedSpecs] = useState<SavedSpec[]>([]);
  const [localStorageKey, setLocalStorageKey] = useState('redpillx-js-specs');

  useEffect(() => {
    const saved = localStorage.getItem(localStorageKey);
    if (saved) {
      try {
        setSavedSpecs(JSON.parse(saved));
      } catch (e) {
        console.error('Failed to parse saved specs', e);
      }
    }
  }, [localStorageKey]);

  const saveToLocalStorage = (spec: any, metadata: Metadata) => {
    const newSpec: SavedSpec = {
      spec,
      metadata,
      timestamp: new Date().toISOString(),
    };
    const current = JSON.parse(localStorage.getItem(localStorageKey) || '[]');
    const updated = [newSpec, ...current].slice(0, 10);
    setSavedSpecs(updated);
    localStorage.setItem(localStorageKey, JSON.stringify(updated));
  };

  const loadSpec = (saved: SavedSpec) => {
    setResult({
      chartData: [],
      metadata: saved.metadata,
      spec: saved.spec,
    });
  };

  const clearSpecs = () => {
    setSavedSpecs([]);
    localStorage.removeItem(localStorageKey);
  };

  const handleGenerate = async () => {
    if (!prompt || !data) {
      setError('Please enter both prompt and data');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const parsedData = JSON.parse(data);
      const response = await fetch('/api/chart', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: parsedData, prompt }),
      });

      const responseData = await response.json();

      if (!response.ok) {
        throw new Error(responseData.error || 'Failed to generate chart');
      }

      setResult(responseData);
      saveToLocalStorage(responseData.spec, responseData.metadata);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const handleTestExecutor = async () => {
    if (!data || !result?.spec) {
      setError('Please enter data and generate a spec first');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const parsedData = JSON.parse(data);
      const response = await fetch('/api/chart/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: parsedData, spec: result.spec }),
      });

      const responseData = await response.json();

      if (!response.ok) {
        throw new Error(responseData.error || 'Failed to execute');
      }

      setResult({
        ...result,
        chartData: responseData.chartData,
        metadata: { ...result.metadata, ...responseData.metadata },
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const renderRecharts = (chartData: ChartData[], metadata: Metadata) => {
    const chartType = metadata.chartType;
    const formattedData = chartData.map(d => ({
      name: d.x,
      value: d.y,
      series: d.series,
    }));
    const seriesLabels = [...new Set(formattedData.map(d => d.series).filter(Boolean))];
    const colors = ['#4F46E5', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#06B6D4', '#84CC16', '#F97316', '#14B8A6'];

    if (chartType === 'pie' || chartType === 'donut') {
      return (
        <ResponsiveContainer width="100%" height={400}>
          <PieChart>
            <Pie
              data={formattedData}
              dataKey="value"
              nameKey="name"
              cx="50%"
              cy="50%"
              outerRadius={150}
              innerRadius={chartType === 'donut' ? 60 : 0}
              label
            >
              {formattedData.map((entry, i) => (
                <Cell key={`cell-${i}`} fill={colors[i % colors.length]} />
              ))}
            </Pie>
            <Tooltip />
            <Legend />
          </PieChart>
        </ResponsiveContainer>
      );
    }

    if (chartType === 'horizontal_bar') {
      return (
        <ResponsiveContainer width="100%" height={Math.max(400, formattedData.length * 40)}>
          <BarChart data={formattedData} layout="vertical">
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis type="number" />
            <YAxis type="category" dataKey="name" width={100} />
            <Tooltip />
            <Legend />
            <Bar dataKey="value" fill="#4F46E5" />
          </BarChart>
        </ResponsiveContainer>
      );
    }

    if (chartType === 'line') {
      return (
        <ResponsiveContainer width="100%" height={400}>
          <LineChart data={formattedData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="name" />
            <YAxis />
            <Tooltip />
            <Legend />
            {seriesLabels.length > 0 ? (
              seriesLabels.map((s, i) => (
                <Line key={s as string} type="monotone" data={formattedData.filter(d => d.series === s)} dataKey="value" name={s as string} stroke={colors[i % colors.length]} />
              ))
            ) : (
              <Line type="monotone" dataKey="value" stroke="#4F46E5" />
            )}
          </LineChart>
        </ResponsiveContainer>
      );
    }

    if (chartType === 'area') {
      return (
        <ResponsiveContainer width="100%" height={400}>
          <AreaChart data={formattedData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="name" />
            <YAxis />
            <Tooltip />
            <Legend />
            {seriesLabels.length > 0 ? (
              seriesLabels.map((s, i) => (
                <Area key={s as string} type="monotone" data={formattedData.filter(d => d.series === s)} dataKey="value" name={s as string} fill={colors[i % colors.length]} stroke={colors[i % colors.length]} />
              ))
            ) : (
              <Area type="monotone" dataKey="value" fill="#4F46E5" stroke="#4F46E5" />
            )}
          </AreaChart>
        </ResponsiveContainer>
      );
    }

    if (chartType === 'scatter') {
      return (
        <ResponsiveContainer width="100%" height={400}>
          <ScatterChart>
            <CartesianGrid />
            <XAxis dataKey="x" type="number" />
            <YAxis dataKey="y" type="number" />
            <Tooltip />
            <Scatter data={chartData} fill="#4F46E5" />
          </ScatterChart>
        </ResponsiveContainer>
      );
    }

    if (chartType === 'radar') {
      const radarData = formattedData.map(d => ({
        subject: d.name,
        A: d.value,
        fullMark: Math.max(...formattedData.map(x => x.value)) * 1.2,
      }));
      return (
        <ResponsiveContainer width="100%" height={400}>
          <RadarChart cx="50%" cy="50%" outerRadius="80%" data={radarData}>
            <PolarGrid />
            <PolarAngleAxis dataKey="subject" />
            <PolarRadiusAxis angle={30} domain={[0, 'auto']} />
            <Radar name="Value" dataKey="A" stroke="#4F46E5" fill="#4F46E5" fillOpacity={0.6} />
            <Legend />
            <Tooltip />
          </RadarChart>
        </ResponsiveContainer>
      );
    }

    if (chartType === 'bar') {
      return (
        <ResponsiveContainer width="100%" height={400}>
          <BarChart data={formattedData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="name" />
            <YAxis />
            <Tooltip />
            <Legend />
            {seriesLabels.length > 0 ? (
              seriesLabels.map((s, i) => (
                <Bar 
                  key={s as string} 
                  dataKey="value" 
                  name={s as string} 
                  fill={colors[i % colors.length]} 
                  stackId="a" 
                />
              ))
            ) : (
              <Bar dataKey="value" fill="#4F46E5" />
            )}
          </BarChart>
        </ResponsiveContainer>
      );
    };

    // Default to bar
    return (
      <ResponsiveContainer width="100%" height={400}>
        <BarChart data={formattedData}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="name" />
          <YAxis />
          <Tooltip />
          <Legend />
          <Bar dataKey="value" fill="#4F46E5" />
        </BarChart>
      </ResponsiveContainer>
    );
  };

  const chartJSRef = useRef<HTMLCanvasElement>(null);
  const chartJSInstance = useRef<Chart | null>(null);

  useEffect(() => {
    if (!chartJSRef.current || selectedLibrary !== 'chartjs' || !result?.chartData) return;
    
    const ctx = chartJSRef.current.getContext('2d');
    if (!ctx) return;

    if (chartJSInstance.current) {
      chartJSInstance.current.destroy();
    }

    const chartData = result.chartData;
    const metadata = result.metadata;
    const chartType = metadata.chartType;
    
    const formattedData = chartData.map(d => ({ x: d.x, y: d.y }));
    const labels = formattedData.map(d => d.x);
    const values = formattedData.map(d => d.y);

    const colors = ['#4F46E5', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#06B6D4', '#84CC16'];

    let chartConfig: any = {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label: metadata.yAxis?.label || 'Value',
          data: values,
          backgroundColor: colors,
          borderColor: colors[0],
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        indexAxis: 'x',
        plugins: {
          legend: { display: true },
        },
      },
    };

    if (chartType === 'pie' || chartType === 'donut') {
      chartConfig = {
        type: 'pie',
        data: {
          labels,
          datasets: [{
            data: values,
            backgroundColor: colors,
          }],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: true } },
        },
      };
    } else if (chartType === 'donut') {
      chartConfig.options.cutout = '60%';
    } else if (chartType === 'line') {
      chartConfig.type = 'line';
      chartConfig.data.datasets[0].borderColor = colors[0];
      chartConfig.data.datasets[0].backgroundColor = colors[0];
      chartConfig.data.datasets[0].fill = false;
      chartConfig.data.datasets[0].tension = 0.4;
    } else if (chartType === 'area') {
      chartConfig.type = 'line';
      chartConfig.data.datasets[0].borderColor = colors[0];
      chartConfig.data.datasets[0].backgroundColor = colors[0] + '80';
      chartConfig.data.datasets[0].fill = true;
      chartConfig.data.datasets[0].tension = 0.4;
    } else if (chartType === 'horizontal_bar') {
      chartConfig.options.indexAxis = 'y';
    } else if (chartType === 'radar') {
      chartConfig = {
        type: 'radar',
        data: {
          labels,
          datasets: [{
            label: metadata.yAxis?.label || 'Value',
            data: values,
            backgroundColor: colors[0] + '80',
            borderColor: colors[0],
            pointBackgroundColor: colors[0],
          }],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: true } },
          scales: {
            r: {
              beginAtZero: true,
            },
          },
        },
      };
    } else if (chartType === 'doughnut') {
      chartConfig.type = 'doughnut';
      chartConfig.data.datasets[0].backgroundColor = colors;
      chartConfig.options = {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '60%',
        plugins: { legend: { display: true } },
      };
    }

    chartJSInstance.current = new Chart(ctx, chartConfig);

    return () => {
      if (chartJSInstance.current) {
        chartJSInstance.current.destroy();
        chartJSInstance.current = null;
      }
    };
  }, [result, selectedLibrary]);

  const renderChartJS = () => {
    return <canvas ref={chartJSRef} style={{ height: '400px' }} />;
  };

  const getApexChartOptions = (chartType: string, chartData: ChartData[], metadata: Metadata) => {
    const colors = ['#4F46E5', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#06B6D4'];
    const labels = chartData.map(d => d.x);
    const values = chartData.map(d => d.y);
    const series = chartData.map(d => ({ x: d.x, y: d.y }));

    const baseOptions: any = {
      chart: {
        height: 400,
        toolbar: { show: true },
        zoom: { enabled: true },
      },
      colors,
      labels,
      xaxis: { categories: labels },
      tooltip: { theme: 'light' },
      legend: { position: 'top' },
      plotOptions: {},
    };

    switch (chartType) {
      case 'pie':
        return { ...baseOptions, chart: { ...baseOptions.chart, type: 'pie' }, series: values };
      case 'donut':
        return {
          ...baseOptions,
          chart: { ...baseOptions.chart, type: 'donut' },
          series: values,
          plotOptions: { pie: { donut: { size: '65%', labels: { show: true } } } }
        };
      case 'line':
        return { ...baseOptions, chart: { ...baseOptions.chart, type: 'line', toolbar: { show: true } }, series: [{ name: 'Value', data: values }] };
      case 'area':
        return { ...baseOptions, chart: { ...baseOptions.chart, type: 'area', stacked: false }, series: [{ name: 'Value', data: values }] };
      case 'bar':
        return { ...baseOptions, chart: { ...baseOptions.chart, type: 'bar' }, series: [{ name: 'Value', data: values }] };
      case 'horizontal_bar':
        return { ...baseOptions, chart: { ...baseOptions.chart, type: 'bar', horizontal: true }, series: [{ name: 'Value', data: values }] };
      case 'radar':
        return {
          ...baseOptions,
          chart: { ...baseOptions.chart, type: 'radar' },
          series: [{ name: 'Value', data: values }],
          xaxis: { categories: labels },
          yaxis: { show: true }
        };
      case 'scatter':
        return {
          ...baseOptions,
          chart: { ...baseOptions.chart, type: 'scatter' },
          series: [{ name: 'Point', data: series }]
        };
      default:
        return { ...baseOptions, chart: { ...baseOptions.chart, type: 'bar' }, series: [{ name: 'Value', data: values }] };
    }
  };

  const renderApexCharts = () => {
    if (!result?.chartData?.length) return <div>No data</div>;
    const options = getApexChartOptions(result.metadata.chartType, result.chartData, result.metadata);
    return (
      <div style={{ height: '400px' }}>
        <ReactApexChart options={options} series={options.series || []} type={options.chart?.type || 'bar'} height={400} />
      </div>
    );
  };

  const getEChartsOption = (chartType: string, chartData: ChartData[], metadata: Metadata) => {
    const colors = ['#4F46E5', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#06B6D4'];
    const labels = chartData.map(d => d.x);
    const values = chartData.map(d => d.y);

    const baseOption = {
      color: colors,
      tooltip: { trigger: 'axis' },
      legend: { data: ['Value'], top: 0 },
      grid: { left: '3%', right: '4%', bottom: '3%', containLabel: true },
    };

    switch (chartType) {
      case 'pie':
      case 'donut':
        return {
          ...baseOption,
          tooltip: { trigger: 'item', formatter: '{a} <br/>{b}: {c} ({d}%)' },
          series: [{
            name: 'Value',
            type: 'pie',
            radius: chartType === 'donut' ? ['40%', '70%'] : '55%',
            data: chartData.map((d, i) => ({ value: d.y, name: d.x })),
            emphasis: { itemStyle: { shadowBlur: 10, shadowOffsetX: 0, shadowColor: 'rgba(0, 0, 0, 0.5)' } },
          }]
        };
      case 'line':
        return {
          ...baseOption,
          xAxis: { type: 'category', data: labels },
          yAxis: { type: 'value' },
          series: [{ name: 'Value', type: 'line', data: values, smooth: true, areaStyle: {} }]
        };
      case 'area':
        return {
          ...baseOption,
          xAxis: { type: 'category', data: labels },
          yAxis: { type: 'value' },
          series: [{ name: 'Value', type: 'line', data: values, smooth: true, areaStyle: {}, stack: 'Total' }]
        };
      case 'bar':
        return {
          ...baseOption,
          xAxis: { type: 'category', data: labels },
          yAxis: { type: 'value' },
          series: [{ name: 'Value', type: 'bar', data: values }]
        };
      case 'horizontal_bar':
        return {
          ...baseOption,
          xAxis: { type: 'value' },
          yAxis: { type: 'category', data: labels },
          series: [{ name: 'Value', type: 'bar', data: values }]
        };
      case 'radar':
        return {
          ...baseOption,
          tooltip: {},
          radar: {
            indicator: labels.map(l => ({ name: l, max: Math.max(...values) * 1.2 })),
            shape: 'polygon',
          },
          series: [{
            type: 'radar',
            data: [{ value: values, name: 'Value' }]
          }]
        };
      case 'scatter':
        return {
          ...baseOption,
          xAxis: {},
          yAxis: {},
          series: [{
            type: 'scatter',
            symbolSize: 12,
            data: chartData.map(d => [d.x, d.y])
          }]
        };
      case 'bubble':
        return {
          ...baseOption,
          xAxis: {},
          yAxis: {},
          series: [{
            type: 'scatter',
            symbolSize: (data: number[]) => data[2] || 10,
            data: chartData.map((d, i) => [d.x, d.y, Math.random() * 30 + 10])
          }]
        };
      case 'gauge':
        return {
          series: [{
            type: 'gauge',
            startAngle: 180,
            endAngle: 0,
            min: 0,
            max: 100,
            splitNumber: 5,
            itemStyle: { color: '#4F46E5' },
            progress: { show: true, width: 18 },
            pointer: { show: false },
            axisLine: { lineStyle: { width: 18 } },
            axisTick: { show: false },
            splitLine: { length: 15, lineStyle: { width: 2, color: '#999' } },
            axisLabel: { distance: 25, color: '#999', fontSize: 12 },
            detail: { valueAnimation: true, fontSize: 30, offsetCenter: [0, '30%'] },
            data: [{ value: values[0] || 50, name: 'Score' }]
          }]
        };
      case 'funnel':
        return {
          tooltip: { trigger: 'item', formatter: '{a} <br/>{b} : {c}%' },
          series: [{
            name: 'Funnel',
            type: 'funnel',
            left: '10%',
            top: 10,
            bottom: 10,
            width: '80%',
            min: 0,
            max: 100,
            minSize: '0%',
            maxSize: '100%',
            sort: 'descending',
            gap: 2,
            label: { show: true, position: 'inside' },
            labelLine: { length: 10, lineStyle: { width: 1, type: 'solid' } },
            itemStyle: { borderColor: '#fff', borderWidth: 1 },
            emphasis: { label: { fontSize: 16 } },
            data: chartData.map((d, i) => ({ value: d.y, name: d.x }))
          }]
        };
      case 'treemap':
        return {
          tooltip: { formatter: '{b}: {c}' },
          series: [{
            type: 'treemap',
            data: chartData.map((d, i) => ({ value: d.y, name: d.x })),
            label: { show: true, formatter: '{b}: {c}' },
            breadcrumb: { show: false },
          }]
        };
      case 'heatmap':
        return {
          tooltip: { position: 'top' },
          grid: { height: '70%', top: '10%' },
          xAxis: { type: 'category', data: labels, splitArea: { show: true } },
          yAxis: { type: 'category', data: ['Metric'], splitArea: { show: true } },
          visualMap: { min: 0, max: Math.max(...values), calculable: true, orient: 'horizontal', left: 'center', bottom: '0%' },
          series: [{
            type: 'heatmap',
            data: chartData.map((d, i) => [i, 0, d.y]),
            label: { show: true }
          }]
        };
      case 'waterfall':
        return {
          tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
          xAxis: { type: 'category', data: labels },
          yAxis: { type: 'value' },
          series: [{
            type: 'bar',
            data: values,
            itemStyle: { color: '#4F46E5' },
            label: { show: true, position: 'top' }
          }]
        };
      case 'candlestick':
        return {
          tooltip: { trigger: 'axis', axisPointer: { type: 'cross' } },
          xAxis: { type: 'category', data: labels },
          yAxis: { scale: true, splitArea: { show: true } },
          series: [{
            type: 'candlestick',
            data: chartData.map((d, i) => [d.y * 0.9, d.y, d.y * 0.85, d.y * 0.95]),
            itemStyle: { color: '#10B981', color0: '#EF4444', borderColor: '#10B981', borderColor0: '#EF4444' }
          }]
        };
      case 'polar':
        return {
          angleAxis: { type: 'category', data: labels },
          radiusAxis: { min: 0 },
          polar: {},
          series: [{ type: 'bar', data: values, coordinateSystem: 'polar' }]
        };
      default:
        return {
          ...baseOption,
          xAxis: { type: 'category', data: labels },
          yAxis: { type: 'value' },
          series: [{ name: 'Value', type: 'bar', data: values }]
        };
    }
  };

  const renderECharts = () => {
    if (!result?.chartData?.length) return <div>No data</div>;
    const option = getEChartsOption(result.metadata.chartType, result.chartData, result.metadata);
    return (
      <div style={{ height: '400px' }}>
        <ReactECharts option={option} style={{ height: '100%', width: '100%' }} />
      </div>
    );
  };

  const renderChart = () => {
    if (!result?.chartData?.length) {
      return (
        <div className="h-[400px] flex items-center justify-center text-gray-400">
          <p>No chart data to display</p>
        </div>
      );
    }

    switch (selectedLibrary) {
      case 'recharts':
        return renderRecharts(result.chartData, result.metadata);
      case 'chartjs':
        return (
          <div style={{ height: '400px' }}>
            {renderChartJS()}
          </div>
        );
      case 'apexcharts':
        return renderApexCharts();
      case 'echarts':
        return renderECharts();
      default:
        return renderRecharts(result.chartData, result.metadata);
    }
  };

  const sampleLargeData = () => {
    const categories = ["Electronics", "Clothing", "Food", "Books", "Sports", "Home", "Toys", "Health"];
    const paymentMethods = ["credit_card", "debit_card", "paypal", "cash", "crypto", "bank_transfer"];
    const statuses = ["completed", "pending", "cancelled", "refunded", "processing"];
    const regions = ["North", "South", "East", "West", "Central"];
    const warehouses = ["WH-NY", "WH-LA", "WH-CHI", "WH-HOU", "WH-SEA"];
    const tiers = ["bronze", "silver", "gold", "platinum"];
    const currencies = ["$", "€", "£", "¥", "₹"];
    const currencyCodes = ["USD", "EUR", "GBP", "JPY", "INR"];
    
    // Generate dates for last 30 days
    const generateDate = (daysAgo: number) => {
      const date = new Date();
      date.setDate(date.getDate() - daysAgo);
      return date.toISOString().split('T')[0];
    };
    
    const orders = [];
    for (let i = 0; i < 1000; i++) {
      const currencySym = currencies[Math.floor(Math.random() * currencies.length)];
      const currencyCode = currencyCodes[Math.floor(Math.random() * currencyCodes.length)];
      const category = categories[Math.floor(Math.random() * categories.length)];
      const region = regions[Math.floor(Math.random() * regions.length)];
      const warehouse = warehouses[Math.floor(Math.random() * warehouses.length)];
      
      orders.push({
        id: `ORD-${String(i + 1).padStart(5, '0')}`,
        order_date: generateDate(Math.floor(Math.random() * 30)), // Last 30 days
        customer: {
          id: `CUS-${Math.floor(Math.random() * 9000) + 1000}`,
          name: `Customer ${Math.floor(Math.random() * 500) + 1}`,
          email: `user${Math.floor(Math.random() * 500)}@example.com`,
          tier: tiers[Math.floor(Math.random() * tiers.length)],
          location: {
            city: ["New York", "Los Angeles", "Chicago", "Houston", "Seattle"][Math.floor(Math.random() * 5)],
            state: ["NY", "CA", "IL", "TX", "WA"][Math.floor(Math.random() * 5)],
            zip: String(Math.floor(Math.random() * 90000) + 10000),
            country: ["USA", "Canada", "UK", "Germany", "Japan"][Math.floor(Math.random() * 5)]
          }
        },
        financials: {
          subtotal: `${currencySym}${Math.floor(Math.random() * 1000) + 10}`,
          tax: `${currencySym}${Math.floor(Math.random() * 100) + 1}`,
          shipping: `${currencySym}${Math.floor(Math.random() * 50) + 5}`,
          discount: `${currencySym}${Math.floor(Math.random() * 100)}`,
          total: `${currencySym}${Math.floor(Math.random() * 1200) + 20}`,
          currency: currencyCode,
          exchange_rate: (Math.random() * 150 + 0.8).toFixed(2)
        },
        items: [
          {
            sku: `SKU-${Math.floor(Math.random() * 9000) + 1000}`,
            name: `Product ${Math.floor(Math.random() * 100) + 1}`,
            category: category,
            quantity: Math.floor(Math.random() * 10) + 1,
            unit_price: `${currencySym}${Math.floor(Math.random() * 500) + 5}`,
            weight_kg: (Math.random() * 25 + 0.1).toFixed(2)
          }
        ],
        shipping: {
          method: ["standard", "express", "overnight", "pickup"][Math.floor(Math.random() * 4)],
          carrier: ["FedEx", "UPS", "USPS", "DHL"][Math.floor(Math.random() * 4)],
          tracking: `TRK${Math.floor(Math.random() * 900000) + 100000}`,
          warehouse: warehouse,
          region: region,
          shipping_cost: `${currencySym}${Math.floor(Math.random() * 50) + 5}`
        },
        payment: {
          method: paymentMethods[Math.floor(Math.random() * paymentMethods.length)],
          status: statuses[Math.floor(Math.random() * statuses.length)],
          transaction_id: `TXN${Math.floor(Math.random() * 900000) + 100000}`
        },
        analytics: {
          page_views: Math.floor(Math.random() * 50) + 1,
          session_duration_sec: Math.floor(Math.random() * 1800) + 30,
          device_type: ["desktop", "mobile", "tablet"][Math.floor(Math.random() * 3)],
          browser: ["Chrome", "Firefox", "Safari", "Edge"][Math.floor(Math.random() * 4)],
          traffic_source: ["organic", "paid", "social", "direct", "referral"][Math.floor(Math.random() * 5)]
        },
        status: statuses[Math.floor(Math.random() * statuses.length)],
        priority: ["low", "medium", "high", "urgent"][Math.floor(Math.random() * 4)]
      });
    }

    setData(JSON.stringify({ orders }, null, 2));
    setPrompt('show me average shipping cost by city for last 1 week');
  };

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Redpill JS SDK Test</h1>
        <p className="text-gray-600 mb-8">Test chart generation with JavaScript SDK + OpenRouter</p>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left Panel - Input */}
          <div className="space-y-6">
            <div className="bg-white rounded-xl shadow-lg p-6">
              <h2 className="text-lg font-semibold text-gray-800 mb-4">JS SDK - OpenRouter</h2>
              <p className="text-sm text-gray-500">Using JavaScript SDK with OpenAI via OpenRouter</p>
            </div>

            <div className="bg-white rounded-xl shadow-lg p-6">
              <h2 className="text-lg font-semibold text-gray-800 mb-4">Chart Library</h2>
              <div className="space-y-2">
                {CHART_LIBRARIES.map(lib => (
                  <button
                    key={lib.id}
                    onClick={() => setSelectedLibrary(lib.id)}
                    className={`w-full text-left p-3 rounded-lg border ${
                      selectedLibrary === lib.id
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <div className="font-medium text-gray-900">{lib.name}</div>
                    <div className="text-sm text-gray-500">{lib.description}</div>
                  </button>
                ))}
              </div>
            </div>

            <div className="bg-white rounded-xl shadow-lg p-6">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-lg font-semibold text-gray-800">Input Data</h2>
                <button
                  onClick={sampleLargeData}
                  className="text-sm text-blue-600 hover:text-blue-700"
                >
                  Load 1000 records
                </button>
              </div>
              
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">Prompt</label>
                <input
                  type="text"
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="show me orders by category"
                  className="text-black w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  JSON Data {result?.spec && '(click execute to re-run with new data)'}
                </label>
                <textarea
                  value={data}
                  onChange={(e) => setData(e.target.value)}
                  placeholder='{"orders": [...]}'
                  rows={8}
                  className="text-black w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 font-mono text-xs"
                />
              </div>

              <div className="flex gap-2">
                <button
                  onClick={handleGenerate}
                  disabled={loading}
                  className="flex-1 bg-blue-600 text-white py-2 px-4 rounded-lg hover:bg-blue-700 disabled:bg-gray-400"
                >
                  {loading ? 'Processing...' : 'Generate Spec'}
                </button>
                {result?.spec && (
                  <button
                    onClick={handleTestExecutor}
                    disabled={loading}
                    className="flex-1 bg-green-600 text-white py-2 px-4 rounded-lg hover:bg-green-700 disabled:bg-gray-400"
                  >
                    Execute
                  </button>
                )}
              </div>

              {error && (
                <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                  {error}
                </div>
              )}
            </div>

            <div className="bg-white rounded-xl shadow-lg p-6">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-lg font-semibold text-gray-800">Saved Specs</h2>
                {savedSpecs.length > 0 && (
                  <button onClick={clearSpecs} className="text-sm text-red-600">
                    Clear All
                  </button>
                )}
              </div>
              {savedSpecs.length === 0 ? (
                <p className="text-gray-400 text-sm">No saved specs yet</p>
              ) : (
                <div className="space-y-2 max-h-[300px] overflow-y-auto">
                  {savedSpecs.map((spec, i) => (
                    <div
                      key={i}
                      onClick={() => loadSpec(spec)}
                      className="p-3 border border-gray-200 rounded-lg hover:border-blue-300 cursor-pointer"
                    >
                      <div className="text-sm font-medium text-gray-900">
                        {spec.metadata.chartType} - {spec.metadata.xAxis?.label}
                      </div>
                      <div className="text-xs text-gray-500">
                        {new Date(spec.timestamp).toLocaleString()}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Right Panel - Chart & Spec */}
          <div className="lg:col-span-2 space-y-6">
            <div className="bg-white rounded-xl shadow-lg p-6">
              <h2 className="text-lg font-semibold text-gray-800 mb-4">
                {selectedLibrary} Preview
              </h2>
              {renderChart()}
              
              {result?.metadata && (
                <div className="mt-4 p-4 bg-gray-50 rounded-lg text-sm">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <span className="font-medium">Chart Type:</span> {result.metadata.chartType}
                    </div>
                    <div>
                      <span className="font-medium">X-Axis:</span> {result.metadata.xAxis?.field}
                    </div>
                    <div>
                      <span className="font-medium">Y-Axis:</span> {result.metadata.yAxis?.field}
                    </div>
                    {result.metadata.series && (
                      <div>
                        <span className="font-medium">Series:</span> {result.metadata.series.field}
                      </div>
                    )}
                    {result.metadata.originalCount !== undefined && (
                      <div>
                        <span className="font-medium">Original Rows:</span> {result.metadata.originalCount}
                      </div>
                    )}
                    {result.metadata.filteredCount !== undefined && (
                      <div>
                        <span className="font-medium">Filtered Rows:</span> {result.metadata.filteredCount}
                      </div>
                    )}
                  </div>
                  {result.metadata.warnings && result.metadata.warnings.length > 0 && (
                    <div className="mt-3 p-2 bg-yellow-50 border border-yellow-200 rounded">
                      <span className="font-medium text-yellow-800">Warnings: </span>
                      <span className="text-yellow-700">{result.metadata.warnings.join(', ')}</span>
                    </div>
                  )}
                </div>
              )}
            </div>

            {result?.spec && (
              <div className="bg-white rounded-xl shadow-lg p-6">
                <h2 className="text-lg font-semibold text-gray-800 mb-4">Generated Spec</h2>
                <pre className="bg-gray-900 text-gray-100 p-4 rounded-lg overflow-x-auto text-xs">
                  {JSON.stringify(result.spec, null, 2)}
                </pre>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
