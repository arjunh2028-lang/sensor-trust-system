"""
FastAPI Backend Core for Sentinel AI.
Conforms strictly to Technical Specification Section 1, 2, 4, and 5:
- Ingestion endpoint: POST /api/v1/telemetry
- Real-time status: GET /api/v1/sensors/status
- Filtered alert logs: GET /api/v1/alerts
- SSE streaming: GET /api/v1/telemetry/stream
- HTTP Polling & React SPA serving
- Secure configuration via .env / backend.config
"""

import asyncio
from contextlib import asynccontextmanager
import csv
import io
import json
import os
import time
from typing import List, Union, Optional
from fastapi import FastAPI, HTTPException, Query, Request, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, StreamingResponse

from backend.config import settings
from backend.models import (
    SensorTelemetryPayload,
    SensorStatusResponse,
    AlertRecord,
    FaultInjectionRequest,
    SystemSummaryResponse
)
from backend.storage import TimeSeriesStorageManager, SPEC_SENSORS
from backend.pipeline.dual_evaluator import DualAssessmentEngine
from backend.simulator import TelemetrySimulator

# Core singletons
storage = TimeSeriesStorageManager(history_limit=500)
engine = DualAssessmentEngine(SPEC_SENSORS)
simulator = TelemetrySimulator(SPEC_SENSORS)

sim_running = True
sim_active = False  # Paused by default: do NOT simulate until CSV uploaded or scenario triggered


async def background_telemetry_loop():
    """
    Background simulation worker advancing real-time telemetry only when sim_active is True.
    Does NOT simulate values until activated.
    """
    while sim_running:
        if not sim_active:
            await asyncio.sleep(1.0)
            continue

        try:
            start_t = time.time()
            packets = simulator.step(timestamp=start_t)
            for p in packets:
                storage.ensure_sensor(p.sensor_id)
                status, alert = engine.process_telemetry(p)
                storage.latest_status[p.sensor_id] = status
                storage.history[p.sensor_id].append({
                    "timestamp": p.epoch_timestamp(),
                    "raw_value": status.value,
                    "baseline_value": status.baseline_value,
                    "confidence_lower": status.confidence_lower,
                    "confidence_upper": status.confidence_upper,
                    "rolling_mean": status.rolling_mean,
                    "rolling_std": status.rolling_std,
                    "reconstruction_error": status.reconstruction_error,
                    "trust_score": status.trust_score,
                    "status": status.status
                })
                if alert:
                    storage.log_alert(alert)

            # Check Rule 2: any sensor missing for > 3x interval flagged OFFLINE
            for sid, meta in SPEC_SENSORS.items():
                if engine.sliding_buffers[sid].check_is_offline(time.time()):
                    if sid in storage.latest_status:
                        curr = storage.latest_status[sid]
                        storage.latest_status[sid] = SensorStatusResponse(
                            sensor_id=sid,
                            trust_score=0.0,
                            status="OFFLINE",
                            is_false_alarm_suppressed=True,
                            explanation="Sensor state flagged OFFLINE: no telemetry received for >3x sampling interval.",
                            metric_type=meta.metric_type,
                            value=curr.value,
                            unit=meta.unit,
                            rolling_mean=curr.rolling_mean,
                            rolling_std=curr.rolling_std,
                            location_zone=meta.location_zone
                        )

            elapsed = time.time() - start_t
            sleep_sec = max(0.2, 2.0 - elapsed)
            await asyncio.sleep(sleep_sec)
        except Exception as e:
            print(f"Error in background telemetry loop: {e}")
            await asyncio.sleep(2.0)


@asynccontextmanager
async def lifespan(app: FastAPI):
    sim_task = asyncio.create_task(background_telemetry_loop())
    yield
    global sim_running
    sim_running = False
    sim_task.cancel()


app = FastAPI(
    title="SENTINEL AI - Sensor Trust, Drift & False-Alarm Detection",
    version="2.0.0",
    description="Specification-compliant AI Platform evaluating sensor trust, drift, and suppressing false alarms.",
    lifespan=lifespan
)

# Rule 1 from Checklist: CORS middleware enabled for React
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# --- SPECIFICATION SECTION 4: API ENDPOINTS ---

@app.post("/api/v1/telemetry")
async def ingest_telemetry(payload: Union[List[SensorTelemetryPayload], SensorTelemetryPayload]):
    """
    Endpoint 1 (Spec 4.1): Ingest Telemetry Data
    Receives raw single- or multi-sensor time-series readings adhering to Spec Section 3.
    """
    items = payload if isinstance(payload, list) else [payload]
    processed_count = 0
    dropped_count = 0

    for item in items:
        storage.ensure_sensor(item.sensor_id)
        status, alert = engine.process_telemetry(item)
        if status.status == "CORRUPT_PACKET_DROPPED":
            dropped_count += 1
            continue

        storage.latest_status[item.sensor_id] = status
        storage.history[item.sensor_id].append({
            "timestamp": item.epoch_timestamp(),
            "raw_value": status.value,
            "baseline_value": status.baseline_value,
            "confidence_lower": status.confidence_lower,
            "confidence_upper": status.confidence_upper,
            "rolling_mean": status.rolling_mean,
            "rolling_std": status.rolling_std,
            "reconstruction_error": status.reconstruction_error,
            "trust_score": status.trust_score,
            "status": status.status
        })
        if alert:
            storage.log_alert(alert)
        processed_count += 1

    return {
        "status": "success",
        "processed": processed_count,
        "dropped_corrupt": dropped_count,
        "active_sensors": len(storage.latest_status)
    }


@app.post("/api/v1/telemetry/csv")
async def ingest_csv_telemetry(
    file: Optional[UploadFile] = File(None),
    request: Request = None
):
    """
    Direct CSV Data Ingestion Endpoint
    Supports schema: ["timestamp", "sensor_id", "reading_value", "status_flag"]
    Also accepts standard aliases (time, sensor, value, reading, etc.).
    Can accept multipart file upload, raw text/csv body, or JSON payload.
    """
    csv_text = ""
    if file is not None:
        content = await file.read()
        csv_text = content.decode("utf-8", errors="replace")
    elif request is not None:
        content_type = request.headers.get("content-type", "")
        if "application/json" in content_type:
            try:
                body = await request.json()
                if isinstance(body, dict):
                    if "csv_content" in body:
                        csv_text = body["csv_content"]
                    elif "filename" in body or "file_path" in body:
                        path = body.get("filename") or body.get("file_path")
                        if os.path.exists(path):
                            with open(path, "r", encoding="utf-8") as f:
                                csv_text = f.read()
            except Exception:
                pass
        if not csv_text:
            body_bytes = await request.body()
            csv_text = body_bytes.decode("utf-8", errors="replace")

    if not csv_text.strip():
        raise HTTPException(status_code=400, detail="Empty CSV data provided")

    # Parse CSV lines
    reader = csv.reader(io.StringIO(csv_text.strip()))
    header = next(reader, None)
    if not header:
        raise HTTPException(status_code=400, detail="CSV header row missing")

    header_clean = [h.strip().lower() for h in header]
    # Map header indices
    col_map = {}
    for idx, col in enumerate(header_clean):
        if col in ("timestamp", "ts", "time", "datetime"):
            col_map["timestamp"] = idx
        elif col in ("sensor_id", "sensor", "id", "device_id"):
            col_map["sensor_id"] = idx
        elif col in ("reading_value", "value", "reading", "val", "metric_value"):
            col_map["value"] = idx
        elif col in ("status_flag", "status", "flag"):
            col_map["status_flag"] = idx

    if "sensor_id" not in col_map or "value" not in col_map:
        raise HTTPException(
            status_code=400,
            detail=f"CSV header must contain 'sensor_id' and 'reading_value' (found: {header})"
        )

    global sim_active
    sim_active = False  # keep background simulation disabled so uploaded CSV values remain intact
    storage.reset()  # clear standby state and load uploaded CSV data

    processed_count = 0
    dropped_count = 0
    drift_count = 0
    suppressed_count = 0
    genuine_hazard_count = 0
    alerts_generated = []

    for row_idx, row in enumerate(reader):
        if not row or len(row) <= max(col_map.values()):
            continue

        try:
            sid = row[col_map["sensor_id"]].strip()
            raw_val = float(row[col_map["value"]].strip())
            ts_val = row[col_map["timestamp"]].strip() if "timestamp" in col_map else time.time()

            payload = SensorTelemetryPayload(
                sensor_id=sid,
                timestamp=ts_val,
                metric_type="temperature",
                value=raw_val,
                unit="Celsius",
                metadata={"location_zone": "Sector-A", "firmware_version": "v2.1.4"}
            )

            storage.ensure_sensor(sid)
            status, alert = engine.process_telemetry(payload)

            if status.status == "CORRUPT_PACKET_DROPPED":
                dropped_count += 1
                alerts_generated.append({
                    "row": row_idx + 1,
                    "sensor_id": sid,
                    "value": raw_val,
                    "type": "CORRUPT_PACKET_DROPPED",
                    "explanation": status.explanation
                })
                continue

            storage.latest_status[sid] = status
            storage.history[sid].append({
                "timestamp": payload.epoch_timestamp(),
                "raw_value": status.value,
                "baseline_value": status.baseline_value,
                "confidence_lower": status.confidence_lower,
                "confidence_upper": status.confidence_upper,
                "rolling_mean": status.rolling_mean,
                "rolling_std": status.rolling_std,
                "reconstruction_error": status.reconstruction_error,
                "trust_score": status.trust_score,
                "status": status.status
            })

            if status.status == "DRIFT_DETECTED":
                drift_count += 1
            if status.is_false_alarm_suppressed:
                suppressed_count += 1
            if status.status == "GENUINE_CRITICAL_RISK":
                genuine_hazard_count += 1

            if alert:
                storage.log_alert(alert)
                alerts_generated.append({
                    "row": row_idx + 1,
                    "sensor_id": sid,
                    "value": raw_val,
                    "type": alert.alert_type,
                    "status": status.status,
                    "summary": alert.summary,
                    "trust_score": alert.trust_score,
                    "explanation": alert.explanation
                })

            processed_count += 1
        except Exception as e:
            continue

    return {
        "status": "success",
        "total_rows_parsed": processed_count + dropped_count,
        "processed_count": processed_count,
        "dropped_corrupt_count": dropped_count,
        "summary": {
            "corrupt_spikes_dropped": dropped_count,
            "drift_detected_count": drift_count,
            "false_alarms_suppressed": suppressed_count,
            "genuine_hazards": genuine_hazard_count,
            "total_alerts": len(alerts_generated)
        },
        "alerts_sample": alerts_generated[:20]
    }


@app.get("/api/v1/sensors/status", response_model=List[SensorStatusResponse])
def get_sensors_status():
    """
    Endpoint 2 (Spec 4.2): Fetch Real-Time Sensor Trust & Health Status
    Returns current trust score, drift flag, and health status for all active sensors.
    """
    return storage.get_all_status()


@app.get("/api/v1/alerts", response_model=List[AlertRecord])
def get_alerts(
    alert_type: Optional[str] = Query(
        None,
        description="Filter by 'GENUINE_HAZARD' or 'SUPPRESSED_SENSOR_FAULT'"
    ),
    limit: int = Query(default=50, le=200)
):
    """
    Endpoint 3 (Spec 4.3): Retrieve Alert Logs
    Fetches filtered alert logs, separating genuine environmental hazards from suppressed sensor faults.
    """
    return storage.get_alerts(alert_type=alert_type, limit=limit)


# Server-Sent Events (SSE) streaming as specified: "HTTP Polling or Server-Sent Events (SSE). Drop raw WebSockets."
@app.get("/api/v1/telemetry/stream")
async def sse_telemetry_stream(request: Request):
    """
    Server-Sent Events (SSE) endpoint providing streaming updates for React dashboards without raw WebSockets.
    """
    async def event_generator():
        while True:
            if await request.is_disconnected():
                break

            data = {
                "timestamp": time.time(),
                "sensors": [s.model_dump() for s in storage.get_all_status()],
                "summary": storage.get_system_summary().model_dump(),
                "recent_alerts": [a.model_dump() for a in storage.get_alerts(limit=5)]
            }
            yield f"data: {json.dumps(data)}\n\n"
            await asyncio.sleep(2.0)

    return StreamingResponse(event_generator(), media_type="text/event-stream")


@app.get("/api/v1/sensors/{sensor_id}/history")
def get_sensor_history(sensor_id: str, limit: int = Query(default=70, le=300)):
    """Retrieve sliding-window history with rolling stats, reconstruction baselines, and bounds."""
    if sensor_id not in SPEC_SENSORS:
        raise HTTPException(status_code=404, detail="Sensor not found")
    history = storage.get_history(sensor_id, limit=limit)
    return {
        "sensor_id": sensor_id,
        "metadata": SPEC_SENSORS[sensor_id].model_dump(),
        "history": history
    }


@app.get("/api/v1/system/summary", response_model=SystemSummaryResponse)
def get_system_summary():
    """Retrieve overall system health, suppressed false alarm counters, and drift metrics."""
    return storage.get_system_summary()


@app.post("/api/v1/simulate/fault")
def inject_fault(req: FaultInjectionRequest):
    """
    Inject simulated sensor fault or genuine disaster scenario.
    Types: 'none', 'gradual_drift', 'transient_spike', 'stuck_flatline',
    'intermittent_packet_loss', 'genuine_environmental_event'.
    """
    global sim_active
    sim_active = True
    simulator.inject_fault(req)
    return {
        "status": "success",
        "message": f"Injected '{req.fault_type}' on '{req.sensor_id}'",
        "active_faults": simulator.active_faults,
        "genuine_disaster_active": simulator.genuine_disaster_active
    }


@app.post("/api/v1/simulate/clear")
def clear_faults():
    """Clear all active injected faults and return to standby."""
    global sim_active
    sim_active = False
    simulator.clear_all_faults()
    storage.reset()
    return {"status": "success", "message": "All faults cleared, system reset to Standby"}


@app.post("/api/v1/telemetry/reset")
def reset_telemetry():
    """Reset telemetry storage and keep simulation paused awaiting CSV upload."""
    global sim_active
    sim_active = False
    simulator.clear_all_faults()
    storage.reset()
    return {"status": "success", "message": "Reset to Standby awaiting CSV upload"}


@app.post("/api/v1/sensors/{sensor_id}/calibrate")
def recalibrate_sensor(sensor_id: str):
    """Zero-recalibrate sensor baseline and clear accumulated drift."""
    if sensor_id not in SPEC_SENSORS:
        raise HTTPException(status_code=404, detail="Sensor not found")
    engine.recalibrate_sensor(sensor_id)
    return {"status": "success", "message": f"Sensor {sensor_id} recalibrated"}


# --- FRONTEND REACT SPA SERVING ---
react_dist = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "frontend_dist"))
static_public = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "frontend", "public"))
frontend_dir = react_dist if os.path.exists(react_dist) else static_public

if os.path.exists(frontend_dir):
    assets_dir = os.path.join(frontend_dir, "assets")
    if os.path.exists(assets_dir):
        app.mount("/assets", StaticFiles(directory=assets_dir), name="assets")
    app.mount("/static", StaticFiles(directory=frontend_dir), name="static")

    @app.get("/{full_path:path}")
    def serve_frontend_spa(full_path: str = ""):
        target = os.path.join(frontend_dir, full_path)
        if full_path and os.path.isfile(target):
            return FileResponse(target)
        return FileResponse(os.path.join(frontend_dir, "index.html"))
