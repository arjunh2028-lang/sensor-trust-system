import React, { useState } from 'react';
import {
  ShieldAlert,
  RotateCw,
  Volume2,
  VolumeX,
  CheckCheck,
  ShieldCheck,
  Flame,
  Wrench,
  Cpu,
  Layers
} from 'lucide-react';

import { useTelemetryStream } from './hooks/useTelemetryStream';
import { SensorCard } from './components/SensorCard';
import { VerdictBanner } from './components/VerdictBanner';
import { TelemetryChart } from './components/TelemetryChart';
import { ExplainabilityCard } from './components/ExplainabilityCard';
import { TrustDiagnostics } from './components/TrustDiagnostics';
import { IncidentLog } from './components/IncidentLog';
import { ScenarioRibbon } from './components/ScenarioRibbon';

export default function App() {
  const [selectedSensorId, setSelectedSensorId] = useState('sensor_env_04');

  const {
    sensors,
    latestAssessments,
    summary,
    recentAnomalies,
    historyBuffers,
    isConnected,
    audioEnabled,
    setAudioEnabled,
    injectFault,
    clearAllFaults,
    recalibrateSensor,
    refresh
  } = useTelemetryStream(2000);

  const selectedMeta = sensors[selectedSensorId] || {
    sensor_id: selectedSensorId,
    name: 'Sector-B Core Temperature',
    metric_type: 'temperature',
    unit: 'Celsius',
    location_zone: 'Sector-B',
    critical_threshold_high: 55.0
  };
  const selectedAssessment = latestAssessments[selectedSensorId];
  const selectedHistory = historyBuffers[selectedSensorId] || [];

  const fleetTrustPct = summary ? Math.round(summary.overall_system_health * 100) : 98;
  const suppressedCount = summary ? summary.active_suppressed_alarms : 0;
  const genuineCount = summary ? summary.active_critical_alarms : 0;
  const driftCount = summary ? summary.sensors_drifting : 0;
  const activeCount = summary ? summary.active_sensors_count : 6;

  return (
    <div className="bg-[#0a0d14] text-slate-100 min-h-screen flex flex-col antialiased">
      {/* TOP APP BAR */}
      <header className="border-b border-[#1e2638] bg-[#0d121c]/90 sticky top-0 z-50 backdrop-blur-md px-6 py-3.5 flex items-center justify-between">
        <div className="flex items-center space-x-3.5">
          <div className="h-9 w-9 rounded-lg bg-gradient-to-tr from-cyan-600 to-indigo-500 flex items-center justify-center shadow-lg shadow-cyan-500/20">
            <ShieldAlert className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="flex items-center space-x-2.5">
              <h1 className="text-lg font-bold tracking-tight text-white flex items-center gap-2">
                SENTINEL{' '}
                <span className="text-cyan-400 font-mono text-sm px-1.5 py-0.5 rounded bg-cyan-950/60 border border-cyan-800/60">
                  AI SPEC V2
                </span>
              </h1>
              <span className="text-xs px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 font-mono border border-slate-700">
                PyTorch &bull; React
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Sensor Trust, Drift & False-Alarm Detection System
            </p>
          </div>
        </div>

        {/* Live Status Controls (HTTP Polling / SSE) */}
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2 bg-slate-900/80 px-3 py-1.5 rounded-lg border border-slate-800">
            <span
              className={`h-2.5 w-2.5 rounded-full ${
                isConnected ? 'bg-emerald-500 pulse-indicator' : 'bg-rose-500'
              }`}
            ></span>
            <span className="text-xs font-mono text-slate-300">
              {isConnected ? 'HTTP POLLING (2s)' : 'CONNECTING...'}
            </span>
          </div>

          <button
            onClick={() => setAudioEnabled(!audioEnabled)}
            className="p-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-slate-200 border border-slate-800 transition-colors"
            title="Toggle Audio Alarms"
          >
            {audioEnabled ? (
              <Volume2 className="w-4 h-4 text-cyan-400" />
            ) : (
              <VolumeX className="w-4 h-4 text-slate-500" />
            )}
          </button>

          <button
            onClick={refresh}
            className="p-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-slate-200 border border-slate-800 transition-colors"
            title="Force Refresh"
          >
            <RotateCw className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* MAIN CONTAINER */}
      <main className="flex-1 p-6 space-y-6 max-w-[1800px] w-full mx-auto">
        {/* KPI RIBBON */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
          {/* Fleet Trust */}
          <div className="hud-card p-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-slate-400">Fleet Trust Score</p>
              <div className="flex items-baseline space-x-2 mt-1">
                <span className="text-2xl font-bold font-mono text-emerald-400">{fleetTrustPct}%</span>
                <span className="text-xs text-slate-500 font-mono">NOMINAL</span>
              </div>
            </div>
            <div className="h-10 w-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
              <CheckCheck className="w-5 h-5" />
            </div>
          </div>

          {/* False Alarms Suppressed */}
          <div className="hud-card p-4 flex items-center justify-between border-purple-900/40 bg-purple-950/10">
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-purple-300">
                False Alarms Suppressed
              </p>
              <div className="flex items-baseline space-x-2 mt-1">
                <span className="text-2xl font-bold font-mono text-purple-400">{suppressedCount}</span>
                <span className="text-xs text-purple-400/80 font-mono">PREVENTED</span>
              </div>
            </div>
            <div className="h-10 w-10 rounded-xl bg-purple-500/10 border border-purple-500/30 flex items-center justify-center text-purple-400">
              <ShieldCheck className="w-5 h-5" />
            </div>
          </div>

          {/* Genuine Hazards */}
          <div
            className={`hud-card p-4 flex items-center justify-between ${
              genuineCount > 0 ? 'border-rose-500 bg-rose-950/20 glow-rose' : ''
            }`}
          >
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-slate-400">Genuine Hazards</p>
              <div className="flex items-baseline space-x-2 mt-1">
                <span
                  className={`text-2xl font-bold font-mono ${
                    genuineCount > 0 ? 'text-rose-400' : 'text-slate-300'
                  }`}
                >
                  {genuineCount}
                </span>
                <span className="text-xs text-slate-500 font-mono">ACTIVE RISKS</span>
              </div>
            </div>
            <div
              className={`h-10 w-10 rounded-xl flex items-center justify-center ${
                genuineCount > 0
                  ? 'bg-rose-500/20 border border-rose-500/40 text-rose-400'
                  : 'bg-slate-800 border border-slate-700 text-slate-400'
              }`}
            >
              <Flame className="w-5 h-5" />
            </div>
          </div>

          {/* Drift Warnings */}
          <div className="hud-card p-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-slate-400">Drift / Calib Warnings</p>
              <div className="flex items-baseline space-x-2 mt-1">
                <span className="text-2xl font-bold font-mono text-amber-400">{driftCount}</span>
                <span className="text-xs text-slate-500 font-mono">MAINTENANCE</span>
              </div>
            </div>
            <div className="h-10 w-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
              <Wrench className="w-5 h-5" />
            </div>
          </div>

          {/* Clusters */}
          <div className="hud-card p-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-slate-400">Monitored Clusters</p>
              <div className="flex items-baseline space-x-2 mt-1">
                <span className="text-2xl font-bold font-mono text-cyan-400">{activeCount} / 6</span>
                <span className="text-xs text-slate-500 font-mono">SECTORS A & B</span>
              </div>
            </div>
            <div className="h-10 w-10 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400">
              <Cpu className="w-5 h-5" />
            </div>
          </div>
        </div>

        {/* SCENARIO INJECTOR */}
        <ScenarioRibbon
          onInject={injectFault}
          onClear={clearAllFaults}
          selectedSensorId={selectedSensorId}
          onCsvIngested={refresh}
        />

        {/* SENSOR GRID */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold tracking-wide uppercase text-slate-400 flex items-center gap-2">
              <Layers className="w-4 h-4 text-cyan-400" /> Telemetry Fleet Status (Click to inspect)
            </h2>
            <span className="text-xs text-slate-500 font-mono">
              Spatial Clusters: Sector-A (3x) &bull; Sector-B (3x)
            </span>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            {Object.values(sensors).map((meta) => (
              <SensorCard
                key={meta.sensor_id}
                metadata={meta}
                assessment={latestAssessments[meta.sensor_id]}
                isSelected={meta.sensor_id === selectedSensorId}
                onClick={() => setSelectedSensorId(meta.sensor_id)}
              />
            ))}
          </div>
        </div>

        {/* MAIN TWO-COLUMN INSPECTION LAYOUT */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* LEFT 2 COLUMNS */}
          <div className="lg:col-span-2 space-y-6">
            <VerdictBanner
              assessment={selectedAssessment}
              metadata={selectedMeta}
              onRecalibrate={() => recalibrateSensor(selectedSensorId)}
            />

            <TelemetryChart history={selectedHistory} metadata={selectedMeta} />

            <ExplainabilityCard assessment={selectedAssessment} />
          </div>

          {/* RIGHT COLUMN */}
          <div className="space-y-6">
            <TrustDiagnostics assessment={selectedAssessment} />

            <IncidentLog anomalies={recentAnomalies} />
          </div>
        </div>
      </main>

      {/* FOOTER */}
      <footer className="border-t border-slate-800 bg-[#0d121c] px-6 py-3 text-xs text-slate-500 flex flex-col md:flex-row items-center justify-between gap-2">
        <div>SENTINEL AI Dual-Assessment Sensor Integrity & Safety Defense Framework (React Edition)</div>
        <div className="font-mono text-slate-400">
          Adaptive Kalman Baseline &bull; Spatial Consensus &bull; Slew Feasibility &bull; CUSUM Drift
        </div>
      </footer>
    </div>
  );
}
