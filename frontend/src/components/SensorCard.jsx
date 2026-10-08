import React from 'react';

export function SensorCard({ metadata, assessment, isSelected, onClick }) {
  const sid = metadata.sensor_id;
  let trustColor = 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20';
  let trustText = 'TRUSTED';
  let cardBorder = isSelected ? 'border-cyan-500 shadow-lg shadow-cyan-500/15' : 'border-slate-800 hover:border-slate-700';
  let cardBg = isSelected ? 'bg-slate-900/90' : 'bg-[#111622]';

  const val = assessment ? (assessment.value ?? assessment.raw_value ?? 0) : null;
  const valStr = val !== null ? `${val.toFixed(1)} ${metadata.unit}` : `-- ${metadata.unit}`;
  const trustScore = assessment ? `${Math.round((assessment.trust_score ?? 1.0) * 100)}%` : '100%';

  if (assessment) {
    const status = assessment.status || assessment.classification || 'NORMAL';
    if (status === 'GENUINE_CRITICAL_RISK' || status === 'GENUINE_CRITICAL_ALARM') {
      cardBorder = 'border-rose-500 glow-rose';
      trustColor = 'text-rose-400 bg-rose-500/20 border-rose-500/40';
      trustText = 'CRITICAL';
    } else if (status === 'FALSE_ALARM_SUPPRESSED' || assessment.is_false_alarm_suppressed) {
      cardBorder = 'border-purple-500 glow-purple';
      trustColor = 'text-purple-400 bg-purple-500/20 border-purple-500/40';
      trustText = 'SUPPRESSED';
    } else if (status === 'DRIFT_DETECTED' || assessment.trust_status === 'DEGRADED') {
      trustColor = 'text-amber-400 bg-amber-500/20 border-amber-500/40';
      trustText = 'DRIFT';
    } else if (status === 'STUCK_FLATLINE' || status === 'OFFLINE' || assessment.trust_status === 'FAULTY' || assessment.trust_status === 'COMPROMISED') {
      trustColor = 'text-rose-400 bg-rose-500/20 border-rose-500/40';
      trustText = status === 'OFFLINE' ? 'OFFLINE' : 'FAULTY';
    }
  }

  return (
    <div
      onClick={onClick}
      className={`p-3.5 rounded-xl border cursor-pointer transition-all ${cardBorder} ${cardBg}`}
    >
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs font-mono font-bold text-slate-200">{sid}</span>
        <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded border ${trustColor}`}>{trustText}</span>
      </div>
      <p className="text-[11px] text-slate-400 truncate mb-2">{metadata.name}</p>
      <div className="flex items-baseline justify-between">
        <span className="text-base font-bold font-mono text-white">{valStr}</span>
        <span className="text-[11px] font-mono text-slate-400">{trustScore} Trust</span>
      </div>
    </div>
  );
}
