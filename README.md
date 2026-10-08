# SENTINEL AI: Sensor Trust, Drift & False-Alarm Detection System
### Technical Architecture & Operational Guide (Conforms to Specification v2.0)

---

## 1. System Architecture Overview

SENTINEL AI is structured into three decoupled tiers:

1. **Ingestion & Storage Layer:**
   - Handles time-series telemetry processing.
   - **Sliding-Window Buffering:** In-memory & TimescaleDB-ready sliding window of the last $N$ readings per sensor to compute rolling means and standard deviations.
   - **Missing Data Handling:** If a packet is missing for $> 3 \times$ the sampling interval, flags sensor state as `OFFLINE` rather than generating false anomaly spikes.
   - **Spike Filtering:** Hard physical limits executed first to drop corrupt packets before AI inference.

2. **AI & Core Analytics Layer (Python / FastAPI):**
   - **PyTorch Temporal Autoencoder:** Learns multi-dimensional temporal reconstruction patterns and computes reconstruction errors ($MSE$).
   - **Spatial Cross-Sensor Correlation:** Evaluates agreement across peer sensors in the same physical sector (Sector-A, Sector-B).
   - **Thermodynamic Slew Limiter:** Validates rate-of-change against physical thermodynamic bounds.
   - **CUSUM / Regression Drift Tracker:** Tracks monotonic residual drift slopes.
   - **First-Difference Variance & Entropy:** Detects frozen ADC flatlines.
   - **Explainability Calculations:** Generates interpretable sensor-health indicators and reasoning for every anomaly flag.

3. **Frontend Interface (React + Vite):**
   - Renders real-time telemetry, trust scores, and alert logs using **HTTP Polling (2s)** and **Server-Sent Events (SSE)**.
   - Dropped raw WebSockets in favor of robust HTTP Polling / SSE communication.

---

## 2. Specification Data Ingestion Schema

Every telemetry packet sent to `POST /api/v1/telemetry` adheres to:

```json
{
  "sensor_id": "sensor_env_04",
  "timestamp": "2026-10-06T21:30:00Z",
  "metric_type": "temperature",
  "value": 42.5,
  "unit": "Celsius",
  "metadata": {
    "location_zone": "Sector-B",
    "firmware_version": "v2.1.4"
  }
}
```

---

## 3. Specification API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/v1/telemetry` | Ingests single or multi-sensor time-series readings. |
| `GET` | `/api/v1/sensors/status` | Returns trust scores, drift flags, and health status for all sensors. |
| `GET` | `/api/v1/alerts` | Fetches filtered alert logs, separating genuine hazards from suppressed faults. |
| `GET` | `/api/v1/telemetry/stream` | Server-Sent Events (SSE) streaming updates. |
| `GET` | `/api/v1/sensors/{id}/history` | Sliding-window history with rolling stats & baseline bounds. |
| `GET` | `/api/v1/system/summary` | Fleet trust score, active sensors, alert counters. |
| `POST` | `/api/v1/simulate/fault` | Injects test scenarios (drift, spike, stuck, drop, genuine disaster). |
| `POST` | `/api/v1/simulate/clear` | Clears all faults and restores baseline. |
| `POST` | `/api/v1/sensors/{id}/calibrate` | Zero-recalibrates sensor and clears drift. |
| `GET` | `/` | Serves production React Single-Page Application (SPA). |

### Example Response from `GET /api/v1/sensors/status`:
```json
[
  {
    "sensor_id": "sensor_env_04",
    "trust_score": 0.42,
    "status": "DRIFT_DETECTED",
    "is_false_alarm_suppressed": true,
    "explanation": "Gradual upward calibration drift detected over 4 hours compared to neighboring sensors in Sector-B."
  }
]
```

---

## 4. Security & Environment Configuration

Configuration is managed via `.env` (see `.env.example`):
```env
APP_ENV=development
DEBUG=true
PORT=8000
DATABASE_URL=postgresql://user:password@localhost:5432/sensordb
ALERT_WEBHOOK_SECRET=your_secure_webhook_secret_here
EXTERNAL_NOTIFIER_API_KEY=your_third_party_sms_or_pagerduty_key
```

PostgreSQL / TimescaleDB schema is located at:
`backend/database/timescale_schema.sql`

---

## 5. Verification & Testing

Run the specification test suite:
```powershell
python -m backend.test_pipeline
```

**Results:**
```
[PASS] Ingestion schema and sliding-window rolling statistics verified
[PASS] Rule 3: Hard physical limits spike filtering verified
[PASS] Transient spike false-alarm suppression verified
[PASS] Specification 4.2 drift detection example verified
[PASS] Genuine environmental hazard detection (alarm NOT suppressed) verified

ALL SPECIFICATION TESTS PASSED PERFECTLY!
```

---

## 6. Running the System

Start the server:
```powershell
python run_server.py
```
Open **`http://localhost:8000/`** in your browser.
