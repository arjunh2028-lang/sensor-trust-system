/**
 * SENTINEL AI - Frontend Dashboard Application
 * Real-time WebSocket telemetry ingestion, Chart.js time-series streaming,
 * dual-assessment classification, and explainable trust diagnostics.
 */

// Application State
const state = {
  selectedSensorId: 'SEN-TEMP-01',
  sensors: {},
  latestAssessments: {},
  summary: null,
  recentAnomalies: [],
  historyBuffers: {}, // sensor_id -> array of {timestamp, raw, baseline, lower, upper}
  chart: null,
  ws: null,
  audioEnabled: true,
  audioCtx: null,
  lastSoundTime: 0
};

// Web Audio synthesizer for alert tones
function playSound(type) {
  if (!state.audioEnabled) return;
  const now = Date.now();
  if (now - state.lastSoundTime < 3000) return; // Rate-limit sound triggers
  state.lastSoundTime = now;

  try {
    if (!state.audioCtx) {
      state.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    const ctx = state.audioCtx;
    if (ctx.state === 'suspended') ctx.resume();

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    if (type === 'critical') {
      // Urgent siren ping (Genuine Emergency)
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.35);
      gain.gain.setValueAtTime(0.25, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.4);
      osc.start();
      osc.stop(ctx.currentTime + 0.45);
    } else if (type === 'suppressed') {
      // Soft high-tech shield suppression chime
      osc.type = 'sine';
      osc.frequency.setValueAtTime(520, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(1040, ctx.currentTime + 0.25);
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
      osc.start();
      osc.stop(ctx.currentTime + 0.35);
    }
  } catch (e) {
    console.warn('Audio playback error:', e);
  }
}

// Initialize Chart.js
function initChart() {
  const ctx = document.getElementById('telemetryChart').getContext('2d');

  // Gradient for Raw Telemetry
  const rawGradient = ctx.createLinearGradient(0, 0, 0, 300);
  rawGradient.addColorStop(0, 'rgba(6, 182, 212, 0.3)');
  rawGradient.addColorStop(1, 'rgba(6, 182, 212, 0.0)');

  // Shading for 3-Sigma confidence envelope
  const boundsGradient = ctx.createLinearGradient(0, 0, 0, 300);
  boundsGradient.addColorStop(0, 'rgba(71, 85, 105, 0.2)');
  boundsGradient.addColorStop(1, 'rgba(71, 85, 105, 0.05)');

  state.chart = new Chart(ctx, {
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
          pointHoverRadius: 5,
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
      animation: {
        duration: 250,
        easing: 'linear'
      },
      interaction: {
        mode: 'index',
        intersect: false
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: 'rgba(17, 24, 39, 0.95)',
          titleFont: { family: 'JetBrains Mono', size: 12 },
          bodyFont: { family: 'JetBrains Mono', size: 11 },
          borderColor: '#374151',
          borderWidth: 1,
          padding: 10,
          boxPadding: 4
        }
      },
      scales: {
        x: {
          grid: { color: 'rgba(30, 41, 59, 0.6)' },
          ticks: {
            color: '#64748b',
            font: { family: 'JetBrains Mono', size: 10 },
            maxTicksLimit: 8
          }
        },
        y: {
          grid: { color: 'rgba(30, 41, 59, 0.6)' },
          ticks: {
            color: '#94a3b8',
            font: { family: 'JetBrains Mono', size: 11 }
          }
        }
      }
    }
  });
}

// Fetch Initial Sensor Metadata & History
async function fetchInitialData() {
  try {
    const res = await fetch('/api/sensors');
    const data = await res.json();
    data.sensors.forEach(item => {
      state.sensors[item.metadata.sensor_id] = item.metadata;
      if (item.latest_assessment) {
        state.latestAssessments[item.metadata.sensor_id] = item.latest_assessment;
      }
    });

    renderSensorCards();
    await loadSensorHistory(state.selectedSensorId);
  } catch (e) {
    console.error('Error fetching initial sensors:', e);
  }
}

// Load historical data for a specific sensor
async function loadSensorHistory(sensorId) {
  try {
    const res = await fetch(`/api/sensors/${sensorId}/history?limit=70`);
    const data = await res.json();
    state.historyBuffers[sensorId] = data.history;
    updateChart(sensorId);
  } catch (e) {
    console.error('Error loading history for', sensorId, e);
  }
}

// Update Chart.js with latest points
function updateChart(sensorId) {
  if (!state.chart) return;
  const history = state.historyBuffers[sensorId] || [];
  const meta = state.sensors[sensorId];
  if (!meta) return;

  const labels = [];
  const rawData = [];
  const baseData = [];
  const upperData = [];
  const lowerData = [];
  const critData = [];

  history.forEach(item => {
    const date = new Date(item.timestamp * 1000);
    const timeStr = date.toTimeString().split(' ')[0];
    labels.push(timeStr);
    rawData.push(item.raw_value);
    baseData.push(item.baseline_value);
    upperData.push(item.confidence_upper);
    lowerData.push(item.confidence_lower);
    critData.push(meta.critical_threshold_high);
  });

  state.chart.data.labels = labels;
  state.chart.data.datasets[0].data = rawData;
  state.chart.data.datasets[1].data = baseData;
  state.chart.data.datasets[2].data = upperData;
  state.chart.data.datasets[3].data = lowerData;
  state.chart.data.datasets[4].data = critData;

  // Title update
  document.getElementById('chart-sensor-title').textContent = sensorId;
  document.getElementById('chart-sensor-metric').textContent = `${meta.zone} • ${meta.name} (${meta.unit})`;

  state.chart.update('none'); // Fast update without heavy animation
}

// Render Grid of Sensor Cards
function renderSensorCards() {
  const container = document.getElementById('sensor-cards-grid');
  container.innerHTML = '';

  Object.values(state.sensors).forEach(meta => {
    const sid = meta.sensor_id;
    const assessment = state.latestAssessments[sid];
    const isSelected = sid === state.selectedSensorId;

    let trustColor = 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20';
    let trustText = 'TRUSTED';
    let valStr = assessment ? `${assessment.raw_value.toFixed(1)} ${meta.unit}` : `-- ${meta.unit}`;
    let trustScore = assessment ? `${Math.round(assessment.trust_score * 100)}%` : '100%';

    let cardBorder = isSelected ? 'border-cyan-500 shadow-lg shadow-cyan-500/15' : 'border-slate-800 hover:border-slate-700';
    let cardBg = isSelected ? 'bg-slate-900/90' : 'bg-[#111622]';

    if (assessment) {
      if (assessment.classification === 'GENUINE_CRITICAL_ALARM') {
        cardBorder = 'border-rose-500 glow-rose';
        trustColor = 'text-rose-400 bg-rose-500/20 border-rose-500/40';
        trustText = 'CRITICAL';
      } else if (assessment.classification === 'FALSE_ALARM_SUPPRESSED') {
        cardBorder = 'border-purple-500 glow-purple';
        trustColor = 'text-purple-400 bg-purple-500/20 border-purple-500/40';
        trustText = 'SUPPRESSED';
      } else if (assessment.trust_status === 'DEGRADED') {
        trustColor = 'text-amber-400 bg-amber-500/20 border-amber-500/40';
        trustText = 'DEGRADED';
      } else if (assessment.trust_status === 'FAULTY' || assessment.trust_status === 'COMPROMISED') {
        trustColor = 'text-rose-400 bg-rose-500/20 border-rose-500/40';
        trustText = 'FAULTY';
      }
    }

    const card = document.createElement('div');
    card.className = `p-3.5 rounded-xl border cursor-pointer transition-all ${cardBorder} ${cardBg}`;
    card.onclick = () => selectSensor(sid);

    card.innerHTML = `
      <div class="flex items-center justify-between mb-1.5">
        <span class="text-xs font-mono font-bold text-slate-200">${sid}</span>
        <span class="text-[10px] font-mono px-1.5 py-0.5 rounded border ${trustColor}">${trustText}</span>
      </div>
      <p class="text-[11px] text-slate-400 truncate mb-2">${meta.name}</p>
      <div class="flex items-baseline justify-between">
        <span class="text-base font-bold font-mono text-white">${valStr}</span>
        <span class="text-[11px] font-mono text-slate-400">${trustScore} Trust</span>
      </div>
    `;

    container.appendChild(card);
  });

  if (window.lucide) lucide.createIcons();
}

// Select a sensor to inspect
function selectSensor(sensorId) {
  state.selectedSensorId = sensorId;
  renderSensorCards();
  loadSensorHistory(sensorId);
  const assessment = state.latestAssessments[sensorId];
  if (assessment) {
    updateVerdictAndDiagnostics(assessment);
  }
}

// Update Dual-Assessment Banner & Health Diagnostics Panel
function updateVerdictAndDiagnostics(assessment) {
  if (!assessment) return;
  const meta = state.sensors[assessment.sensor_id];
  if (!meta) return;

  const banner = document.getElementById('dual-verdict-banner');
  const badge = document.getElementById('verdict-badge');
  const title = document.getElementById('verdict-title');
  const summary = document.getElementById('verdict-summary');
  const timeEl = document.getElementById('verdict-time');

  timeEl.textContent = new Date(assessment.timestamp * 1000).toLocaleTimeString();

  // Reset classes
  banner.className = 'hud-card p-5 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 transition-all duration-300 ';

  if (assessment.classification === 'GENUINE_CRITICAL_ALARM') {
    banner.classList.add('border-rose-500/70', 'bg-rose-950/20', 'glow-rose');
    badge.className = 'px-2.5 py-1 rounded-md text-xs font-bold font-mono uppercase bg-rose-500/20 text-rose-400 border border-rose-500/40 animate-pulse';
    badge.textContent = '🚨 GENUINE CRITICAL RISK';
    title.textContent = `EMERGENCY HAZARD CONFIRMED: ${assessment.sensor_id}`;
    summary.textContent = `Physical parameter breached safety limit (${assessment.raw_value} ${meta.unit} >= ${meta.critical_threshold_high} ${meta.unit}). Verified by peer consensus & thermodynamic plausibility. IMMEDIATE ACTION REQUIRED.`;
    playSound('critical');
  } else if (assessment.classification === 'FALSE_ALARM_SUPPRESSED') {
    banner.classList.add('border-purple-500/70', 'bg-purple-950/25', 'glow-purple');
    badge.className = 'px-2.5 py-1 rounded-md text-xs font-bold font-mono uppercase bg-purple-500/20 text-purple-300 border border-purple-500/40';
    badge.textContent = '🛡️ FALSE ALARM SUPPRESSED';
    title.textContent = `FALSE ALARM SUPPRESSED (${assessment.primary_cause})`;
    summary.textContent = `Raw threshold breach detected (${assessment.raw_value} ${meta.unit}), but sensor trust score is degraded (${Math.round(assessment.trust_score * 100)}%). Multi-sensor consensus and slew validation isolated this as a hardware/EMI anomaly. Evacuation suppressed.`;
    playSound('suppressed');
  } else if (assessment.classification === 'SENSOR_DEGRADED_MAINTENANCE') {
    banner.classList.add('border-amber-500/60', 'bg-amber-950/15', 'glow-amber');
    badge.className = 'px-2.5 py-1 rounded-md text-xs font-bold font-mono uppercase bg-amber-500/20 text-amber-400 border border-amber-500/40';
    badge.textContent = '⚠️ SENSOR DEGRADED / DRIFT';
    title.textContent = `Maintenance Advisory: ${assessment.sensor_id} Calibration Drifting`;
    summary.textContent = `Residual trend is drifting (${assessment.indicators.drift_metric > 0 ? '+' : ''}${assessment.indicators.drift_metric.toFixed(4)} /s). Environmental conditions remain safe. Recalibration scheduled.`;
  } else if (assessment.classification === 'SENSOR_STUCK_OFFLINE') {
    banner.classList.add('border-cyan-500/60', 'bg-cyan-950/15');
    badge.className = 'px-2.5 py-1 rounded-md text-xs font-bold font-mono uppercase bg-cyan-500/20 text-cyan-400 border border-cyan-500/40';
    badge.textContent = '❄️ SENSOR STUCK / FROZEN';
    title.textContent = `Hardware Freeze Detected: ${assessment.sensor_id}`;
    summary.textContent = `Signal variance collapsed to 0 over sliding window. ADC output is frozen at ${assessment.raw_value}. Sensor trust marked zero.`;
  } else {
    // Normal
    banner.classList.add('border-emerald-900/50', 'bg-emerald-950/10');
    badge.className = 'px-2.5 py-1 rounded-md text-xs font-bold font-mono uppercase bg-emerald-500/20 text-emerald-400 border border-emerald-500/30';
    badge.textContent = 'NORMAL OPERATION';
    title.textContent = 'Physical Condition & Sensor Integrity Verified';
    summary.textContent = 'Measurement conforms to physical thermodynamics. Slew rate within bounds, co-located sensors confirm environmental ambient stability.';
  }

  // Update Explainability Narrative
  document.getElementById('explainability-narrative').textContent = assessment.explanation;

  // Render Feature Attribution Bars
  const attribContainer = document.getElementById('attribution-bars-container');
  attribContainer.innerHTML = '';
  const attributions = assessment.feature_attributions || {};
  const attribLabels = {
    spatial_consensus: 'Peer Divergence',
    slew_violation: 'Physical Slew Excess',
    drift_severity: 'Drift Gradient',
    noise_abnormality: 'Noise Anomaly / Flatline',
    packet_loss: 'Packet Loss Penalty'
  };

  Object.entries(attributions).forEach(([key, val]) => {
    const pct = Math.round(val * 100);
    const label = attribLabels[key] || key;
    const barEl = document.createElement('div');
    barEl.className = 'space-y-1';
    barEl.innerHTML = `
      <div class="flex justify-between text-xs">
        <span class="text-slate-400 font-mono">${label}</span>
        <span class="text-slate-200 font-mono font-semibold">${pct}%</span>
      </div>
      <div class="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
        <div class="h-full bg-indigo-500 rounded-full transition-all duration-300" style="width: ${pct}%"></div>
      </div>
    `;
    attribContainer.appendChild(barEl);
  });

  // Update Right-Hand Health & Trust Diagnostics Panel
  const trustBadge = document.getElementById('health-panel-trust-badge');
  const trustPct = Math.round(assessment.trust_score * 100);
  trustBadge.textContent = `TRUST: ${trustPct}%`;
  trustBadge.className = `px-2 py-0.5 rounded text-xs font-mono font-bold ${
    trustPct >= 80 ? 'bg-emerald-500/20 text-emerald-400' :
    trustPct >= 60 ? 'bg-amber-500/20 text-amber-400' :
    'bg-rose-500/20 text-rose-400'
  }`;

  // Indicator 1: Consensus
  const indConsensus = assessment.indicators.spatial_consensus_score;
  document.getElementById('ind-consensus-val').textContent = `${(indConsensus * 100).toFixed(1)}%`;
  document.getElementById('ind-consensus-bar').style.width = `${Math.round(indConsensus * 100)}%`;
  document.getElementById('ind-consensus-bar').className = `h-full metric-progress-bar ${
    indConsensus >= 0.7 ? 'bg-cyan-400' : indConsensus >= 0.4 ? 'bg-amber-400' : 'bg-rose-500'
  }`;

  // Indicator 2: Slew Feasibility
  const indSlew = assessment.indicators.slew_rate_feasibility;
  document.getElementById('ind-slew-val').textContent = indSlew.toFixed(2);
  document.getElementById('ind-slew-bar').style.width = `${Math.round(indSlew * 100)}%`;
  document.getElementById('ind-slew-bar').className = `h-full metric-progress-bar ${
    indSlew >= 0.7 ? 'bg-emerald-400' : indSlew >= 0.4 ? 'bg-amber-400' : 'bg-rose-500'
  }`;

  // Indicator 3: Drift Metric
  const indDrift = assessment.indicators.drift_metric;
  document.getElementById('ind-drift-val').textContent = `${indDrift > 0 ? '+' : ''}${indDrift.toFixed(4)} /s`;
  const driftBarPct = Math.min(100, Math.round(Math.abs(indDrift) * 600));
  document.getElementById('ind-drift-bar').style.width = `${driftBarPct}%`;
  document.getElementById('ind-drift-bar').className = `h-full metric-progress-bar ${
    Math.abs(indDrift) < 0.03 ? 'bg-emerald-400' : Math.abs(indDrift) < 0.06 ? 'bg-amber-400' : 'bg-rose-500'
  }`;

  // Indicator 4: Noise Entropy
  const indNoise = assessment.indicators.noise_entropy_score;
  const noiseText = indNoise < 0.1 ? 'FLATLINE FROZEN' : indNoise < 0.5 ? 'EXCESSIVE JITTER' : 'HEALTHY (1.0)';
  document.getElementById('ind-noise-val').textContent = noiseText;
  document.getElementById('ind-noise-bar').style.width = `${Math.round(indNoise * 100)}%`;
  document.getElementById('ind-noise-bar').className = `h-full metric-progress-bar ${
    indNoise >= 0.7 ? 'bg-indigo-400' : 'bg-rose-500'
  }`;

  // Indicator 5: Packet Integrity
  const indPacket = assessment.indicators.packet_integrity_score;
  document.getElementById('ind-packet-val').textContent = `${Math.round(indPacket * 100)}% ${indPacket < 0.9 ? '(Dropping)' : '(Clean)'}`;
  document.getElementById('ind-packet-bar').style.width = `${Math.round(indPacket * 100)}%`;
  document.getElementById('ind-packet-bar').className = `h-full metric-progress-bar ${
    indPacket >= 0.8 ? 'bg-blue-400' : 'bg-amber-400'
  }`;
}

// Update Top KPI ribbon
function updateKpiSummary(summary) {
  if (!summary) return;
  document.getElementById('kpi-fleet-trust').textContent = `${Math.round(summary.overall_system_health * 100)}%`;
  document.getElementById('kpi-suppressed-count').textContent = summary.active_suppressed_alarms;
  document.getElementById('kpi-genuine-count').textContent = summary.active_critical_alarms;
  document.getElementById('kpi-drift-count').textContent = summary.sensors_drifting;
  document.getElementById('kpi-active-sensors').textContent = `${summary.active_sensors_count} / 6`;

  const hazardCard = document.getElementById('kpi-hazard-card');
  if (summary.active_critical_alarms > 0) {
    hazardCard.className = 'hud-card p-4 flex items-center justify-between border-rose-500 bg-rose-950/20 glow-rose';
  } else {
    hazardCard.className = 'hud-card p-4 flex items-center justify-between';
  }
}

// Render Incident Stream / Suppression Log
function renderIncidentLog(anomalies) {
  const container = document.getElementById('incident-log-container');
  if (!anomalies || anomalies.length === 0) {
    return;
  }

  container.innerHTML = '';
  anomalies.forEach(evt => {
    const timeStr = new Date(evt.timestamp * 1000).toLocaleTimeString();
    let badgeClass = '';
    let badgeText = '';
    let borderClass = 'border-slate-800';

    if (evt.classification === 'GENUINE_CRITICAL_ALARM') {
      badgeClass = 'bg-rose-500/20 text-rose-400 border-rose-500/40';
      badgeText = '🚨 GENUINE RISK';
      borderClass = 'border-rose-900/50 bg-rose-950/15';
    } else if (evt.is_alarm_suppressed) {
      badgeClass = 'bg-purple-500/20 text-purple-300 border-purple-500/40';
      badgeText = '🛡️ SUPPRESSED';
      borderClass = 'border-purple-900/50 bg-purple-950/15';
    } else {
      badgeClass = 'bg-amber-500/20 text-amber-400 border-amber-500/40';
      badgeText = '⚠️ DEGRADED';
      borderClass = 'border-amber-900/50 bg-amber-950/15';
    }

    const item = document.createElement('div');
    item.className = `p-3 rounded-lg border ${borderClass} space-y-1.5 transition`;
    item.innerHTML = `
      <div class="flex items-center justify-between">
        <span class="text-xs font-mono font-bold text-slate-200">${evt.sensor_id} (${evt.zone})</span>
        <div class="flex items-center space-x-2">
          <span class="text-[10px] font-mono px-1.5 py-0.5 rounded border ${badgeClass}">${badgeText}</span>
          <span class="text-[10px] text-slate-500 font-mono">${timeStr}</span>
        </div>
      </div>
      <p class="text-xs font-medium text-slate-200">${evt.summary}</p>
      <p class="text-[11px] text-slate-400 leading-snug line-clamp-2">${evt.explanation}</p>
    `;
    container.appendChild(item);
  });
}

// WebSocket Connection Management
function connectWebSocket() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${protocol}//${window.location.host}/ws`;
  const indicator = document.getElementById('conn-indicator');
  const statusEl = document.getElementById('conn-status');

  state.ws = new WebSocket(wsUrl);

  state.ws.onopen = () => {
    indicator.className = 'h-2.5 w-2.5 rounded-full bg-emerald-500 pulse-indicator';
    statusEl.textContent = 'STREAMING (1 Hz)';
  };

  state.ws.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data);
      if (msg.type === 'telemetry_tick' || msg.type === 'initial_snapshot') {
        state.summary = msg.summary;
        updateKpiSummary(msg.summary);

        // Update latest assessments
        Object.entries(msg.assessments || {}).forEach(([sid, assessment]) => {
          state.latestAssessments[sid] = assessment;

          // Append to history buffer
          if (!state.historyBuffers[sid]) {
            state.historyBuffers[sid] = [];
          }
          state.historyBuffers[sid].push(assessment);
          if (state.historyBuffers[sid].length > 90) {
            state.historyBuffers[sid].shift();
          }
        });

        renderSensorCards();

        // Update selected sensor visuals
        const selectedAssessment = state.latestAssessments[state.selectedSensorId];
        if (selectedAssessment) {
          updateVerdictAndDiagnostics(selectedAssessment);
          updateChart(state.selectedSensorId);
        }

        if (msg.recent_anomalies && msg.recent_anomalies.length > 0) {
          renderIncidentLog(msg.recent_anomalies);
        }
      }
    } catch (e) {
      console.error('Error handling WebSocket message:', e);
    }
  };

  state.ws.onclose = () => {
    indicator.className = 'h-2.5 w-2.5 rounded-full bg-rose-500';
    statusEl.textContent = 'DISCONNECTED (Retrying...)';
    setTimeout(connectWebSocket, 3000);
  };

  state.ws.onerror = (err) => {
    console.warn('WebSocket error, retrying in 3s:', err);
    state.ws.close();
  };
}

// Scenario Fault Injection Handler
async function injectFault(faultType) {
  try {
    const payload = {
      sensor_id: faultType === 'genuine_environmental_event' ? 'ALL' : state.selectedSensorId,
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
}

// Clear all active faults
async function clearAllFaults() {
  try {
    await fetch('/api/simulate/clear', { method: 'POST' });
  } catch (e) {
    console.error('Error clearing faults:', e);
  }
}

// Zero-recalibrate the selected sensor
async function recalibrateSelectedSensor() {
  try {
    await fetch(`/api/sensors/${state.selectedSensorId}/calibrate`, { method: 'POST' });
    await loadSensorHistory(state.selectedSensorId);
  } catch (e) {
    console.error('Error recalibrating sensor:', e);
  }
}

// Audio Alarm Mute Toggle
document.getElementById('audio-toggle').addEventListener('click', () => {
  state.audioEnabled = !state.audioEnabled;
  const btn = document.getElementById('audio-toggle');
  btn.innerHTML = state.audioEnabled
    ? '<i data-lucide="volume-2" class="w-4 h-4 text-cyan-400"></i>'
    : '<i data-lucide="volume-x" class="w-4 h-4 text-slate-500"></i>';
  if (window.lucide) lucide.createIcons();
});

// Force refresh button
document.getElementById('refresh-btn').addEventListener('click', () => {
  fetchInitialData();
});

// Initialization Entrypoint
window.addEventListener('DOMContentLoaded', async () => {
  if (window.lucide) lucide.createIcons();
  initChart();
  await fetchInitialData();
  connectWebSocket();
});
