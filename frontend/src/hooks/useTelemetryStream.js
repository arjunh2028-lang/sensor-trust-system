import { useState, useEffect, useRef, useCallback } from 'react';

export function useTelemetryStream(pollingIntervalMs = 2000) {
  const [sensors, setSensors] = useState({});
  const [latestAssessments, setLatestAssessments] = useState({});
  const [summary, setSummary] = useState(null);
  const [recentAnomalies, setRecentAnomalies] = useState([]);
  const [historyBuffers, setHistoryBuffers] = useState({});
  const [isConnected, setIsConnected] = useState(false);
  const [audioEnabled, setAudioEnabled] = useState(true);

  const audioCtxRef = useRef(null);
  const lastSoundRef = useRef(0);

  // Synthesize sound effects
  const playSound = useCallback((type) => {
    if (!audioEnabled) return;
    const now = Date.now();
    if (now - lastSoundRef.current < 3000) return;
    lastSoundRef.current = now;

    try {
      if (!audioCtxRef.current) {
        audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)();
      }
      const ctx = audioCtxRef.current;
      if (ctx.state === 'suspended') ctx.resume();

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);

      if (type === 'critical') {
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(880, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.35);
        gain.gain.setValueAtTime(0.25, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.4);
        osc.start();
        osc.stop(ctx.currentTime + 0.45);
      } else if (type === 'suppressed') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(520, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(1040, ctx.currentTime + 0.25);
        gain.gain.setValueAtTime(0.15, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
        osc.start();
        osc.stop(ctx.currentTime + 0.35);
      }
    } catch (e) {
      console.warn('Audio synthesis error:', e);
    }
  }, [audioEnabled]);

  // Periodic HTTP Polling (Specification Section 2: Standard HTTP Polling every 2–5s)
  const pollStatus = useCallback(async () => {
    try {
      // 1. Fetch /api/v1/sensors/status (Spec 4.2)
      const statusRes = await fetch('/api/v1/sensors/status');
      if (statusRes.ok) {
        const statuses = await statusRes.json();
        const aMap = {};
        const sMetaMap = {};

        statuses.forEach((s) => {
          aMap[s.sensor_id] = s;
          sMetaMap[s.sensor_id] = {
            sensor_id: s.sensor_id,
            name: `${s.location_zone} ${s.metric_type === 'temperature' ? 'Temperature' : s.metric_type === 'gas_co' ? 'Toxic Gas' : 'Pressure'}`,
            metric_type: s.metric_type,
            unit: s.unit,
            location_zone: s.location_zone,
            critical_threshold_high: s.metric_type === 'temperature' ? 55.0 : s.metric_type === 'gas_co' ? 35.0 : 135.0
          };

          if (s.status === 'GENUINE_CRITICAL_RISK') playSound('critical');
          else if (s.status === 'FALSE_ALARM_SUPPRESSED' || s.is_false_alarm_suppressed) playSound('suppressed');
        });

        setSensors((prev) => ({ ...prev, ...sMetaMap }));
        setLatestAssessments((prev) => ({ ...prev, ...aMap }));
        setIsConnected(true);

        // Update history buffers
        setHistoryBuffers((prev) => {
          const next = { ...prev };
          statuses.forEach((s) => {
            const arr = next[s.sensor_id] ? [...next[s.sensor_id]] : [];
            arr.push({
              timestamp: Date.now() / 1000,
              raw_value: s.value,
              baseline_value: s.baseline_value,
              confidence_lower: s.confidence_lower,
              confidence_upper: s.confidence_upper,
              rolling_mean: s.rolling_mean,
              rolling_std: s.rolling_std,
              reconstruction_error: s.reconstruction_error,
              trust_score: s.trust_score,
              status: s.status
            });
            if (arr.length > 80) arr.shift();
            next[s.sensor_id] = arr;
          });
          return next;
        });
      }

      // 2. Fetch /api/v1/alerts (Spec 4.3)
      const alertsRes = await fetch('/api/v1/alerts?limit=25');
      if (alertsRes.ok) {
        const alerts = await alertsRes.json();
        setRecentAnomalies(alerts);
      }

      // 3. Fetch /api/v1/system/summary
      const summaryRes = await fetch('/api/v1/system/summary');
      if (summaryRes.ok) {
        const sum = await summaryRes.json();
        setSummary(sum);
      }
    } catch (e) {
      console.warn('HTTP Polling error:', e);
      setIsConnected(false);
    }
  }, [playSound]);

  // Initial load of full history
  const fetchInitialHistory = useCallback(async () => {
    try {
      const res = await fetch('/api/v1/sensors/status');
      if (res.ok) {
        const statuses = await res.json();
        const hBuffers = {};
        for (const s of statuses) {
          try {
            const hRes = await fetch(`/api/v1/sensors/${s.sensor_id}/history?limit=70`);
            if (hRes.ok) {
              const hData = await hRes.json();
              hBuffers[s.sensor_id] = hData.history;
            }
          } catch (err) {
            console.warn(`Error loading history for ${s.sensor_id}`, err);
          }
        }
        setHistoryBuffers(hBuffers);
      }
    } catch (e) {
      console.warn('Initial history fetch error:', e);
    }
  }, []);

  // Polling Interval Lifecycle (HTTP Polling)
  useEffect(() => {
    fetchInitialHistory();
    pollStatus();

    const intervalId = setInterval(pollStatus, pollingIntervalMs);
    return () => clearInterval(intervalId);
  }, [fetchInitialHistory, pollStatus, pollingIntervalMs]);

  // Actions
  const injectFault = async (faultType, sensorId = 'ALL') => {
    try {
      const payload = {
        sensor_id: faultType === 'genuine_environmental_event' ? 'ALL' : sensorId,
        fault_type: faultType,
        intensity: 1.0,
        duration_seconds: 35.0
      };
      await fetch('/api/v1/simulate/fault', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      pollStatus();
    } catch (e) {
      console.error('Error injecting fault:', e);
    }
  };

  const clearAllFaults = async () => {
    try {
      await fetch('/api/v1/simulate/clear', { method: 'POST' });
      pollStatus();
    } catch (e) {
      console.error('Error clearing faults:', e);
    }
  };

  const recalibrateSensor = async (sensorId) => {
    try {
      await fetch(`/api/v1/sensors/${sensorId}/calibrate`, { method: 'POST' });
      const res = await fetch(`/api/v1/sensors/${sensorId}/history?limit=70`);
      if (res.ok) {
        const data = await res.json();
        setHistoryBuffers((prev) => ({ ...prev, [sensorId]: data.history }));
      }
      pollStatus();
    } catch (e) {
      console.error('Error recalibrating sensor:', e);
    }
  };

  return {
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
    refresh: pollStatus
  };
}
