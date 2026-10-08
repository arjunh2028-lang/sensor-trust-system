import { useState, useEffect, useRef, useCallback } from 'react';

export function useTelemetryWebSocket() {
  const [sensors, setSensors] = useState({});
  const [latestAssessments, setLatestAssessments] = useState({});
  const [summary, setSummary] = useState(null);
  const [recentAnomalies, setRecentAnomalies] = useState([]);
  const [historyBuffers, setHistoryBuffers] = useState({});
  const [isConnected, setIsConnected] = useState(false);
  const [audioEnabled, setAudioEnabled] = useState(true);

  const audioCtxRef = useRef(null);
  const lastSoundRef = useRef(0);
  const wsRef = useRef(null);

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

  // Load initial sensors
  const fetchInitialData = useCallback(async () => {
    try {
      const res = await fetch('/api/sensors');
      const data = await res.json();
      const sMap = {};
      const aMap = {};
      data.sensors.forEach(item => {
        sMap[item.metadata.sensor_id] = item.metadata;
        if (item.latest_assessment) {
          aMap[item.metadata.sensor_id] = item.latest_assessment;
        }
      });
      setSensors(sMap);
      setLatestAssessments(prev => ({ ...prev, ...aMap }));

      // Fetch history for all sensors
      const hBuffers = {};
      for (const sid of Object.keys(sMap)) {
        try {
          const hRes = await fetch(`/api/sensors/${sid}/history?limit=70`);
          const hData = await hRes.json();
          hBuffers[sid] = hData.history;
        } catch (e) {
          console.warn(`Error loading history for ${sid}:`, e);
        }
      }
      setHistoryBuffers(hBuffers);
    } catch (e) {
      console.error('Error fetching initial sensor fleet:', e);
    }
  }, []);

  // WebSocket Connection Lifecycle
  useEffect(() => {
    fetchInitialData();

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;

    let reconnectTimer = null;

    function connect() {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        setIsConnected(true);
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === 'telemetry_tick' || msg.type === 'initial_snapshot') {
            if (msg.summary) setSummary(msg.summary);
            if (msg.recent_anomalies) setRecentAnomalies(msg.recent_anomalies);

            if (msg.assessments) {
              setLatestAssessments(prev => ({ ...prev, ...msg.assessments }));

              // Check if any genuine critical or suppressed alarm occurred
              Object.values(msg.assessments).forEach(a => {
                if (a.classification === 'GENUINE_CRITICAL_ALARM') playSound('critical');
                else if (a.classification === 'FALSE_ALARM_SUPPRESSED') playSound('suppressed');
              });

              // Append to history buffers
              setHistoryBuffers(prev => {
                const next = { ...prev };
                Object.entries(msg.assessments).forEach(([sid, assessment]) => {
                  const arr = next[sid] ? [...next[sid]] : [];
                  arr.push(assessment);
                  if (arr.length > 80) arr.shift();
                  next[sid] = arr;
                });
                return next;
              });
            }
          }
        } catch (e) {
          console.error('Error parsing WS message:', e);
        }
      };

      ws.onclose = () => {
        setIsConnected(false);
        reconnectTimer = setTimeout(connect, 3000);
      };

      ws.onerror = () => {
        ws.close();
      };
    }

    connect();

    return () => {
      if (wsRef.current) wsRef.current.close();
      if (reconnectTimer) clearTimeout(reconnectTimer);
    };
  }, [fetchInitialData, playSound]);

  // Actions
  const injectFault = async (faultType, sensorId = 'ALL') => {
    try {
      const payload = {
        sensor_id: faultType === 'genuine_environmental_event' ? 'ALL' : sensorId,
        fault_type: faultType,
        intensity: 1.0,
        duration_seconds: 35.0
      };
      await fetch('/api/simulate/fault', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
    } catch (e) {
      console.error('Error injecting fault:', e);
    }
  };

  const clearAllFaults = async () => {
    try {
      await fetch('/api/simulate/clear', { method: 'POST' });
    } catch (e) {
      console.error('Error clearing faults:', e);
    }
  };

  const recalibrateSensor = async (sensorId) => {
    try {
      await fetch(`/api/sensors/${sensorId}/calibrate`, { method: 'POST' });
      const res = await fetch(`/api/sensors/${sensorId}/history?limit=70`);
      const data = await res.json();
      setHistoryBuffers(prev => ({ ...prev, [sensorId]: data.history }));
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
    refresh: fetchInitialData
  };
}
