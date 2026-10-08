import React from 'react';
import { BrainCircuit } from 'lucide-react';

export function ExplainabilityCard({ assessment }) {
  if (!assessment) return null;

  const defaultAttributions = {
    spatial_consensus: Math.max(0, 1.0 - (assessment.spatial_consensus_score ?? 1.0)),
    slew_violation: Math.max(0, 1.0 - (assessment.slew_rate_feasibility ?? 1.0)),
    drift_severity: Math.min(1.0, Math.abs(assessment.drift_metric ?? 0.0) * 12),
    noise_abnormality: Math.max(0, 1.0 - (assessment.noise_entropy_score ?? 1.0)),
    packet_loss: Math.max(0, 1.0 - (assessment.packet_integrity_score ?? 1.0))
  };

  const attributions = (assessment.feature_attributions && Object.keys(assessment.feature_attributions).length > 0)
    ? assessment.feature_attributions
    : defaultAttributions;

  const attribLabels = {
    spatial_consensus: 'Peer Divergence',
    slew_violation: 'Physical Slew Excess',
    drift_severity: 'Drift Gradient',
    noise_abnormality: 'Noise Anomaly / Flatline',
    packet_loss: 'Packet Loss Penalty'
  };

  return (
    <div className="hud-card p-5 space-y-4">
      <div className="flex items-center space-x-2">
        <BrainCircuit className="w-5 h-5 text-indigo-400" />
        <h3 className="text-sm font-bold uppercase tracking-wider text-slate-200">
          Explainable AI Reasoning & Diagnostics
        </h3>
      </div>

      {/* Narrative Box */}
      <div className="p-3.5 rounded-lg bg-slate-900/90 border border-slate-800">
        <p className="text-xs text-slate-400 uppercase font-mono tracking-wider mb-1">
          Diagnostic Narrative
        </p>
        <p className="text-sm text-slate-200 leading-relaxed font-sans">
          {assessment.explanation}
        </p>
      </div>

      {/* Attribution Bars */}
      <div>
        <p className="text-xs text-slate-400 uppercase font-mono tracking-wider mb-2.5">
          Anomaly Factor Attribution
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {Object.entries(attributions).map(([key, val]) => {
            const pct = Math.round(val * 100);
            const label = attribLabels[key] || key;
            return (
              <div key={key} className="space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="text-slate-400 font-mono">{label}</span>
                  <span className="text-slate-200 font-mono font-semibold">{pct}%</span>
                </div>
                <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-indigo-500 rounded-full transition-all duration-300"
                    style={{ width: `${pct}%` }}
                  ></div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
