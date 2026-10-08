import React, { useEffect, useRef } from 'react';
import Chart from 'chart.js/auto';

export function TelemetryChart({ history = [], metadata }) {
  const canvasRef = useRef(null);
  const chartInstanceRef = useRef(null);

  useEffect(() => {
    if (!canvasRef.current) return;
    const ctx = canvasRef.current.getContext('2d');

    const rawGradient = ctx.createLinearGradient(0, 0, 0, 300);
    rawGradient.addColorStop(0, 'rgba(6, 182, 212, 0.3)');
    rawGradient.addColorStop(1, 'rgba(6, 182, 212, 0.0)');

    const boundsGradient = ctx.createLinearGradient(0, 0, 0, 300);
    boundsGradient.addColorStop(0, 'rgba(71, 85, 105, 0.2)');
    boundsGradient.addColorStop(1, 'rgba(71, 85, 105, 0.05)');

    const chart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: [],
        datasets: [
          {
            label: 'Raw Telemetry',
            data: [],
            borderColor: '#06b6d4',
            backgroundColor: rawGradient,
            borderWidth: 2,
            pointRadius: 2,
            tension: 0.2,
            fill: false,
            order: 1
          },
          {
            label: 'Kalman Baseline',
            data: [],
            borderColor: '#f59e0b',
            borderWidth: 2,
            borderDash: [4, 4],
            pointRadius: 0,
            tension: 0.2,
            fill: false,
            order: 2
          },
          {
            label: 'Upper 3-Sigma Bound',
            data: [],
            borderColor: 'rgba(148, 163, 184, 0.3)',
            borderWidth: 1,
            pointRadius: 0,
            fill: '+1',
            backgroundColor: boundsGradient,
            order: 3
          },
          {
            label: 'Lower 3-Sigma Bound',
            data: [],
            borderColor: 'rgba(148, 163, 184, 0.3)',
            borderWidth: 1,
            pointRadius: 0,
            fill: false,
            order: 4
          },
          {
            label: 'Critical Threshold',
            data: [],
            borderColor: '#f43f5e',
            borderWidth: 1.5,
            borderDash: [6, 4],
            pointRadius: 0,
            fill: false,
            order: 5
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 200, easing: 'linear' },
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: 'rgba(17, 24, 39, 0.95)',
            titleFont: { family: 'JetBrains Mono', size: 12 },
            bodyFont: { family: 'JetBrains Mono', size: 11 },
            borderColor: '#374151',
            borderWidth: 1,
            padding: 10
          }
        },
        scales: {
          x: {
            grid: { color: 'rgba(30, 41, 59, 0.6)' },
            ticks: { color: '#64748b', font: { family: 'JetBrains Mono', size: 10 }, maxTicksLimit: 8 }
          },
          y: {
            grid: { color: 'rgba(30, 41, 59, 0.6)' },
            ticks: { color: '#94a3b8', font: { family: 'JetBrains Mono', size: 11 } }
          }
        }
      }
    });

    chartInstanceRef.current = chart;

    return () => {
      chart.destroy();
    };
  }, []);

  // Update chart when history or metadata changes
  useEffect(() => {
    const chart = chartInstanceRef.current;
    if (!chart || !metadata) return;

    const labels = [];
    const rawData = [];
    const baseData = [];
    const upperData = [];
    const lowerData = [];
    const critData = [];

    history.forEach(item => {
      const timeVal = item.timestamp ? (typeof item.timestamp === 'number' ? item.timestamp * 1000 : Date.parse(item.timestamp)) : Date.now();
      const date = new Date(timeVal);
      labels.push(date.toTimeString().split(' ')[0]);
      rawData.push(item.value ?? item.raw_value ?? 0);
      baseData.push(item.baseline_value ?? 0);
      upperData.push(item.confidence_upper ?? 0);
      lowerData.push(item.confidence_lower ?? 0);
      critData.push(metadata.critical_threshold_high);
    });

    chart.data.labels = labels;
    chart.data.datasets[0].data = rawData;
    chart.data.datasets[1].data = baseData;
    chart.data.datasets[2].data = upperData;
    chart.data.datasets[3].data = lowerData;
    chart.data.datasets[4].data = critData;

    chart.update('none');
  }, [history, metadata]);

  return (
    <div className="hud-card p-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-4 gap-2">
        <div>
          <div className="flex items-center space-x-2">
            <h3 className="text-base font-bold text-white font-mono">{metadata?.sensor_id}</h3>
            <span className="text-xs px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-mono">
              {metadata?.location_zone || metadata?.zone} • {metadata?.name} ({metadata?.unit})
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            Raw Telemetry vs Adaptive Kalman Baseline & Dynamic &plusmn;3&sigma; Uncertainty Bounds
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 text-xs font-mono">
          <span className="flex items-center gap-1.5 text-cyan-400">
            <span className="w-3 h-0.5 bg-cyan-400 inline-block"></span> Raw Telemetry
          </span>
          <span className="flex items-center gap-1.5 text-amber-400">
            <span className="w-3 h-0.5 bg-amber-400 inline-block"></span> Kalman Baseline
          </span>
          <span className="flex items-center gap-1.5 text-slate-400">
            <span className="w-3 h-2 bg-slate-700/40 inline-block border border-slate-600"></span> &plusmn;3&sigma; Bounds
          </span>
          <span className="flex items-center gap-1.5 text-rose-400">
            <span className="w-3 h-0.5 bg-rose-500 border-dashed inline-block"></span> Critical Limit
          </span>
        </div>
      </div>

      <div className="relative w-full h-[340px]">
        <canvas ref={canvasRef}></canvas>
      </div>
    </div>
  );
}
