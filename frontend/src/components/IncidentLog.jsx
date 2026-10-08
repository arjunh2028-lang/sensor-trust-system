import React from 'react';
import { ListFilter } from 'lucide-react';

export function IncidentLog({ anomalies = [] }) {
  return (
    <div className="hud-card p-5 space-y-4">
      <div className="flex items-center justify-between border-b border-slate-800 pb-3">
        <div className="flex items-center space-x-2">
          <ListFilter className="w-5 h-5 text-purple-400" />
          <h3 className="text-sm font-bold uppercase tracking-wider text-slate-200">
            Suppression & Hazard Log
          </h3>
        </div>
        <span className="text-xs text-slate-500 font-mono">Live Audit Trail</span>
      </div>

      <div className="space-y-2.5 max-h-[380px] overflow-y-auto pr-1">
        {anomalies.length === 0 ? (
          <div className="p-3 rounded-lg bg-slate-900/60 border border-slate-800/80 text-xs text-slate-400 text-center">
            No anomalies recorded yet. Fleet operating within baseline parameters.
          </div>
        ) : (
          anomalies.map((evt, idx) => {
            const timeVal = evt.timestamp ? (typeof evt.timestamp === 'number' ? evt.timestamp * 1000 : Date.parse(evt.timestamp)) : Date.now();
            const timeStr = new Date(timeVal).toLocaleTimeString();
            let badgeClass = 'bg-amber-500/20 text-amber-400 border-amber-500/40';
            let badgeText = '⚠️ DEGRADED';
            let borderClass = 'border-amber-900/50 bg-amber-950/15';

            if (evt.alert_type === 'GENUINE_HAZARD' || evt.classification === 'GENUINE_CRITICAL_ALARM') {
              badgeClass = 'bg-rose-500/20 text-rose-400 border-rose-500/40';
              badgeText = '🚨 GENUINE RISK';
              borderClass = 'border-rose-900/50 bg-rose-950/15';
            } else if (evt.is_false_alarm_suppressed || evt.is_alarm_suppressed || evt.alert_type === 'SUPPRESSED_SENSOR_FAULT') {
              badgeClass = 'bg-purple-500/20 text-purple-300 border-purple-500/40';
              badgeText = '🛡️ SUPPRESSED';
              borderClass = 'border-purple-900/50 bg-purple-950/15';
            }

            const zoneName = evt.location_zone || evt.zone || 'Zone';

            return (
              <div key={evt.alert_id || evt.event_id || idx} className={`p-3 rounded-lg border ${borderClass} space-y-1.5 transition`}>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-mono font-bold text-slate-200">
                    {evt.sensor_id} ({zoneName})
                  </span>
                  <div className="flex items-center space-x-2">
                    <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded border ${badgeClass}`}>
                      {badgeText}
                    </span>
                    <span className="text-[10px] text-slate-500 font-mono">{timeStr}</span>
                  </div>
                </div>
                <p className="text-xs font-medium text-slate-200">{evt.summary}</p>
                <p className="text-[11px] text-slate-400 leading-snug line-clamp-2">{evt.explanation}</p>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
