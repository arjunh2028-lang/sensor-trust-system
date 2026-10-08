import React from 'react';
import { Activity, Users, Gauge, TrendingUp, Waves, Radio } from 'lucide-react';

export function TrustDiagnostics({ assessment }) {
  if (!assessment) return null;

  const trustPct = Math.round((assessment.trust_score ?? 1.0) * 100);
  const indConsensus = assessment.spatial_consensus_score ?? assessment.indicators?.spatial_consensus_score ?? 1.0;
  const indSlew = assessment.slew_rate_feasibility ?? assessment.indicators?.slew_rate_feasibility ?? 1.0;
  const indDrift = assessment.drift_metric ?? assessment.indicators?.drift_metric ?? 0.0;
  const indNoise = assessment.noise_entropy_score ?? assessment.indicators?.noise_entropy_score ?? 1.0;
  const indPacket = assessment.packet_integrity_score ?? assessment.indicators?.packet_integrity_score ?? 1.0;

  const noiseText = indNoise < 0.1 ? 'FLATLINE FROZEN' : indNoise < 0.5 ? 'EXCESSIVE JITTER' : 'HEALTHY (1.0)';
  const driftBarPct = Math.min(100, Math.round(Math.abs(indDrift) * 600));

  return (
    <div className="hud-card p-5 space-y-4">
      <div className="flex items-center justify-between border-b border-slate-800 pb-3">
        <div className="flex items-center space-x-2">
          <Activity className="w-5 h-5 text-cyan-400" />
          <h3 className="text-sm font-bold uppercase tracking-wider text-slate-200">
            Sensor Health & Trust
          </h3>
        </div>
        <span
          className={`px-2 py-0.5 rounded text-xs font-mono font-bold ${
            assessment.status === 'STANDBY' ? 'bg-slate-800 text-slate-400 border border-slate-700' :
            trustPct >= 80 ? 'bg-emerald-500/20 text-emerald-400' :
            trustPct >= 60 ? 'bg-amber-500/20 text-amber-400' :
            'bg-rose-500/20 text-rose-400'
          }`}
        >
          {assessment.status === 'STANDBY' ? 'TRUST: STANDBY' : `TRUST: ${trustPct}%`}
        </span>
      </div>

      {/* Indicator 1: Spatial Consensus */}
      <div className="space-y-1.5">
        <div className="flex justify-between text-xs">
          <span className="text-slate-300 flex items-center gap-1.5">
            <Users className="w-3.5 h-3.5 text-cyan-400" /> Spatial Consensus Agreement
          </span>
          <span className="font-mono text-cyan-400 font-semibold">
            {(indConsensus * 100).toFixed(1)}%
          </span>
        </div>
        <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
          <div
            className={`h-full metric-progress-bar ${
              indConsensus >= 0.7 ? 'bg-cyan-400' : indConsensus >= 0.4 ? 'bg-amber-400' : 'bg-rose-500'
            }`}
            style={{ width: `${Math.round(indConsensus * 100)}%` }}
          ></div>
        </div>
        <p className="text-[11px] text-slate-400">Concordance with co-located peer cluster in Zone-A</p>
      </div>

      {/* Indicator 2: Physical Slew Rate Feasibility */}
      <div className="space-y-1.5">
        <div className="flex justify-between text-xs">
          <span className="text-slate-300 flex items-center gap-1.5">
            <Gauge className="w-3.5 h-3.5 text-emerald-400" /> Physical Slew Feasibility
          </span>
          <span className="font-mono text-emerald-400 font-semibold">
            {indSlew.toFixed(2)}
          </span>
        </div>
        <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
          <div
            className={`h-full metric-progress-bar ${
              indSlew >= 0.7 ? 'bg-emerald-400' : indSlew >= 0.4 ? 'bg-amber-400' : 'bg-rose-500'
            }`}
            style={{ width: `${Math.round(indSlew * 100)}%` }}
          ></div>
        </div>
        <p className="text-[11px] text-slate-400">Validates |dv/dt| against thermodynamic slew limits</p>
      </div>

      {/* Indicator 3: Residual Drift Metric */}
      <div className="space-y-1.5">
        <div className="flex justify-between text-xs">
          <span className="text-slate-300 flex items-center gap-1.5">
            <TrendingUp className="w-3.5 h-3.5 text-amber-400" /> Drift Gradient Slope
          </span>
          <span className="font-mono text-amber-400 font-semibold">
            {indDrift > 0 ? '+' : ''}{indDrift.toFixed(4)} /s
          </span>
        </div>
        <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
          <div
            className={`h-full metric-progress-bar ${
              Math.abs(indDrift) < 0.03 ? 'bg-emerald-400' : Math.abs(indDrift) < 0.06 ? 'bg-amber-400' : 'bg-rose-500'
            }`}
            style={{ width: `${driftBarPct}%` }}
          ></div>
        </div>
        <p className="text-[11px] text-slate-400">Sliding window linear regression on residuals</p>
      </div>

      {/* Indicator 4: Noise & Entropy */}
      <div className="space-y-1.5">
        <div className="flex justify-between text-xs">
          <span className="text-slate-300 flex items-center gap-1.5">
            <Waves className="w-3.5 h-3.5 text-indigo-400" /> Noise Entropy / Variance
          </span>
          <span className="font-mono text-indigo-400 font-semibold">
            {noiseText}
          </span>
        </div>
        <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
          <div
            className={`h-full metric-progress-bar ${indNoise >= 0.7 ? 'bg-indigo-400' : 'bg-rose-500'}`}
            style={{ width: `${Math.round(indNoise * 100)}%` }}
          ></div>
        </div>
        <p className="text-[11px] text-slate-400">Detects frozen ADC flatline vs excessive white noise</p>
      </div>

      {/* Indicator 5: Packet Stream Integrity */}
      <div className="space-y-1.5">
        <div className="flex justify-between text-xs">
          <span className="text-slate-300 flex items-center gap-1.5">
            <Radio className="w-3.5 h-3.5 text-blue-400" /> Stream Packet Integrity
          </span>
          <span className="font-mono text-blue-400 font-semibold">
            {Math.round(indPacket * 100)}% {indPacket < 0.9 ? '(Dropping)' : '(Clean)'}
          </span>
        </div>
        <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
          <div
            className={`h-full metric-progress-bar ${indPacket >= 0.8 ? 'bg-blue-400' : 'bg-amber-400'}`}
            style={{ width: `${Math.round(indPacket * 100)}%` }}
          ></div>
        </div>
        <p className="text-[11px] text-slate-400">Monitors arrival jitter, packet drops & network flap</p>
      </div>
    </div>
  );
}
