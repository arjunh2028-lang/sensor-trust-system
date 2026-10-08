import React from 'react';
import { Compass, AlertTriangle, ShieldCheck, Flame, CheckCircle, Snowflake } from 'lucide-react';

export function VerdictBanner({ assessment, metadata, onRecalibrate }) {
  if (!assessment || !metadata) return null;

  let bannerClass = 'border-emerald-900/50 bg-emerald-950/10';
  let badgeClass = 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30';
  let badgeText = 'NORMAL OPERATION';
  let title = 'Physical Condition & Sensor Integrity Verified';
  let summary = 'Measurement conforms to physical thermodynamics. Slew rate within bounds, co-located sensors confirm environmental ambient stability.';
  let Icon = CheckCircle;

  const rawVal = assessment.value ?? assessment.raw_value ?? 0;
  const driftVal = assessment.drift_metric ?? assessment.indicators?.drift_metric ?? 0;
  const status = assessment.status || assessment.classification || 'NORMAL';

  if (status === 'STANDBY') {
    bannerClass = 'border-slate-800 bg-[#111622]';
    badgeClass = 'bg-slate-800 text-slate-300 border-slate-700';
    badgeText = '⏸️ AWAITING CSV STREAM';
    title = 'Sensor Dual-Assessment Pipeline on Standby';
    summary = 'Automatic background simulation is disabled. The system will NOT simulate any sensor readings until you upload or ingest a sensor CSV file above.';
    Icon = Compass;
  } else if (status === 'GENUINE_CRITICAL_RISK' || status === 'GENUINE_CRITICAL_ALARM') {
    bannerClass = 'border-rose-500/70 bg-rose-950/20 glow-rose';
    badgeClass = 'bg-rose-500/20 text-rose-400 border-rose-500/40 animate-pulse';
    badgeText = '🚨 GENUINE CRITICAL RISK';
    title = `EMERGENCY HAZARD CONFIRMED: ${assessment.sensor_id}`;
    summary = `Physical parameter breached safety limit (${rawVal} ${metadata.unit} >= ${metadata.critical_threshold_high} ${metadata.unit}). Verified by peer consensus & thermodynamic plausibility. IMMEDIATE ACTION REQUIRED.`;
    Icon = Flame;
  } else if (status === 'FALSE_ALARM_SUPPRESSED' || assessment.is_false_alarm_suppressed) {
    bannerClass = 'border-purple-500/70 bg-purple-950/25 glow-purple';
    badgeClass = 'bg-purple-500/20 text-purple-300 border-purple-500/40';
    badgeText = '🛡️ FALSE ALARM SUPPRESSED';
    title = `FALSE ALARM SUPPRESSED (${assessment.primary_cause || 'Threshold Breach'})`;
    summary = `Raw threshold breach detected (${rawVal} ${metadata.unit}), but sensor trust score is degraded (${Math.round(assessment.trust_score * 100)}%). Multi-sensor consensus and slew validation isolated this as a hardware/EMI anomaly. Evacuation suppressed.`;
    Icon = ShieldCheck;
  } else if (status === 'DRIFT_DETECTED' || status === 'SENSOR_DEGRADED_MAINTENANCE') {
    bannerClass = 'border-amber-500/60 bg-amber-950/15 glow-amber';
    badgeClass = 'bg-amber-500/20 text-amber-400 border-amber-500/40';
    badgeText = '⚠️ SENSOR DEGRADED / DRIFT';
    title = `Maintenance Advisory: ${assessment.sensor_id} Calibration Drifting`;
    summary = `Residual trend is drifting (${driftVal > 0 ? '+' : ''}${driftVal.toFixed(4)} /s). Environmental conditions remain safe. Recalibration scheduled.`;
    Icon = AlertTriangle;
  } else if (status === 'STUCK_FLATLINE' || status === 'OFFLINE' || status === 'SENSOR_STUCK_OFFLINE') {
    bannerClass = 'border-cyan-500/60 bg-cyan-950/15';
    badgeClass = 'bg-cyan-500/20 text-cyan-400 border-cyan-500/40';
    badgeText = '❄️ SENSOR STUCK / FROZEN';
    title = `Hardware Freeze Detected: ${assessment.sensor_id}`;
    summary = `Signal variance collapsed to 0 over sliding window. ADC output is frozen at ${rawVal} ${metadata.unit}. Sensor trust marked zero.`;
    Icon = Snowflake;
  }

  const timeVal = assessment.timestamp ? (typeof assessment.timestamp === 'number' ? assessment.timestamp * 1000 : Date.parse(assessment.timestamp)) : Date.now();
  const timeStr = new Date(timeVal).toLocaleTimeString();

  return (
    <div className={`hud-card p-5 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 transition-all duration-300 ${bannerClass}`}>
      <div className="space-y-1.5 flex items-start gap-3.5">
        <div className="mt-1">
          <Icon className="w-6 h-6 text-current" />
        </div>
        <div>
          <div className="flex items-center space-x-3 mb-1">
            <span className={`px-2.5 py-1 rounded-md text-xs font-bold font-mono uppercase border ${badgeClass}`}>
              {badgeText}
            </span>
            <span className="text-xs text-slate-400 font-mono">Updated {timeStr}</span>
          </div>
          <h3 className="text-lg font-bold text-white">{title}</h3>
          <p className="text-xs text-slate-300 max-w-2xl mt-0.5 leading-relaxed">
            {summary}
          </p>
        </div>
      </div>

      <div className="flex items-center space-x-3 w-full md:w-auto justify-end">
        <button
          onClick={onRecalibrate}
          className="px-3.5 py-2 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition flex items-center gap-2"
        >
          <Compass className="w-4 h-4 text-cyan-400" /> Zero Recalibrate
        </button>
      </div>
    </div>
  );
}
