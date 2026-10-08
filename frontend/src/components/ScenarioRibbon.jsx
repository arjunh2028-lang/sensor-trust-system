import React, { useRef, useState } from 'react';
import { Sparkles, Flame, Zap, TrendingUp, Snowflake, WifiOff, XCircle, FileSpreadsheet, UploadCloud, CheckCircle2 } from 'lucide-react';

export function ScenarioRibbon({ onInject, onClear, selectedSensorId, onCsvIngested }) {
  const fileInputRef = useRef(null);
  const [ingestStatus, setIngestStatus] = useState(null);
  const [isUploading, setIsUploading] = useState(false);

  const handleMockCsvIngest = async () => {
    setIsUploading(true);
    setIngestStatus('Ingesting sensor_stream.csv...');
    try {
      const res = await fetch('/api/v1/telemetry/csv', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: 'sensor_stream.csv' })
      });
      if (res.ok) {
        const data = await res.json();
        setIngestStatus(
          `Parsed ${data.total_rows_parsed} rows: ${data.summary.corrupt_spikes_dropped} spike dropped, ${data.summary.drift_detected_count} drift flagged`
        );
        if (onCsvIngested) onCsvIngested();
      } else {
        setIngestStatus('Ingestion failed: server error');
      }
    } catch (e) {
      setIngestStatus('Ingestion failed: connection error');
    } finally {
      setIsUploading(false);
      setTimeout(() => setIngestStatus(null), 7000);
    }
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    setIngestStatus(`Uploading ${file.name}...`);
    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch('/api/v1/telemetry/csv', {
        method: 'POST',
        body: formData
      });
      if (res.ok) {
        const data = await res.json();
        setIngestStatus(
          `Ingested ${data.total_rows_parsed} rows from ${file.name} (${data.summary.corrupt_spikes_dropped} spikes dropped)`
        );
        if (onCsvIngested) onCsvIngested();
      } else {
        setIngestStatus('Failed to ingest uploaded CSV');
      }
    } catch (e) {
      setIngestStatus('Error uploading CSV');
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
      setTimeout(() => setIngestStatus(null), 7000);
    }
  };

  return (
    <div className="hud-card p-4 border-slate-800 bg-[#0e1422] space-y-3">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="flex items-center space-x-2.5">
          <div className="h-7 w-7 rounded bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
            <Sparkles className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-slate-200">
              Interactive Scenario & CSV Ingestion Pipeline
            </h2>
            <p className="text-xs text-slate-400">
              Inject real-time physical phenomena or ingest batch time-series CSV streams directly into the AI pipeline.
            </p>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Mock CSV Ingestion Action */}
          <button
            onClick={handleMockCsvIngest}
            disabled={isUploading}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-cyan-950/60 hover:bg-cyan-900/80 text-cyan-300 border border-cyan-700/60 transition flex items-center gap-1.5 shadow-sm shadow-cyan-900/30"
            title="Ingests sensor_stream.csv (100 rows with row 45 spike & row >70 drift)"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-cyan-400" />
            {isUploading ? 'Ingesting...' : 'Ingest Mock CSV (100 rows)'}
          </button>

          {/* Custom CSV File Upload Action */}
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileUpload}
            accept=".csv,text/csv"
            className="hidden"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition flex items-center gap-1.5"
            title="Upload custom sensor CSV stream"
          >
            <UploadCloud className="w-3.5 h-3.5 text-indigo-400" /> Upload CSV
          </button>

          <span className="h-4 w-px bg-slate-700 mx-1 hidden sm:inline-block"></span>

          <button
            onClick={() => onInject('none', selectedSensorId)}
            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition flex items-center gap-1.5"
          >
            <span className="h-2 w-2 rounded-full bg-emerald-400"></span> Normal Baseline
          </button>

          <button
            onClick={() => onInject('genuine_environmental_event', 'ALL')}
            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-rose-950/40 hover:bg-rose-900/60 text-rose-300 border border-rose-800/60 transition flex items-center gap-1.5"
          >
            <Flame className="w-3.5 h-3.5 text-rose-400" /> True Disaster
          </button>

          <button
            onClick={() => onInject('transient_spike', selectedSensorId)}
            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-purple-950/40 hover:bg-purple-900/60 text-purple-300 border border-purple-800/60 transition flex items-center gap-1.5"
          >
            <Zap className="w-3.5 h-3.5 text-purple-400" /> EMI Spike
          </button>

          <button
            onClick={() => onInject('gradual_drift', selectedSensorId)}
            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-amber-950/40 hover:bg-amber-900/60 text-amber-300 border border-amber-800/60 transition flex items-center gap-1.5"
          >
            <TrendingUp className="w-3.5 h-3.5 text-amber-400" /> Gradual Drift
          </button>

          <button
            onClick={() => onInject('stuck_flatline', selectedSensorId)}
            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-cyan-950/40 hover:bg-cyan-900/60 text-cyan-300 border border-cyan-800/60 transition flex items-center gap-1.5"
          >
            <Snowflake className="w-3.5 h-3.5 text-cyan-400" /> ADC Freeze
          </button>

          <button
            onClick={onClear}
            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-white border border-slate-700 transition flex items-center gap-1.5"
          >
            <XCircle className="w-3.5 h-3.5" /> Clear
          </button>
        </div>
      </div>

      {ingestStatus && (
        <div className="flex items-center gap-2 px-3 py-2 rounded bg-cyan-950/50 border border-cyan-800/60 text-xs text-cyan-300 font-mono animate-fadeIn">
          <CheckCircle2 className="w-4 h-4 text-cyan-400 shrink-0" />
          <span>{ingestStatus}</span>
        </div>
      )}
    </div>
  );
}
