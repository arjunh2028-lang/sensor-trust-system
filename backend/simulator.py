"""
Multi-Sensor Telemetry Simulator and Scenario Injector.
Produces payloads conforming strictly to Specification Section 3:
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
"""

import math
import random
import time
from datetime import datetime, timezone
from typing import Dict, List, Optional
from backend.models import (
    SensorRegistrationMeta,
    SensorTelemetryPayload,
    TelemetryMetadata,
    FaultInjectionRequest
)


class TelemetrySimulator:
    def __init__(self, sensors_meta: Dict[str, SensorRegistrationMeta]):
        self.sensors_meta = sensors_meta
        self.step_count = 0
        self.start_time = time.time()

        self.current_values: Dict[str, float] = {
            sid: meta.baseline_nominal for sid, meta in sensors_meta.items()
        }
        self.active_faults: Dict[str, Dict] = {}
        self.genuine_disaster_active = False
        self.genuine_disaster_start = 0.0
        self.genuine_disaster_duration = 35.0

    def inject_fault(self, req: FaultInjectionRequest):
        if req.fault_type == "none":
            self.active_faults.pop(req.sensor_id, None)
            if req.sensor_id == "ALL":
                self.active_faults.clear()
                self.genuine_disaster_active = False
            return

        if req.fault_type == "genuine_environmental_event":
            self.genuine_disaster_active = True
            self.genuine_disaster_start = time.time()
            self.genuine_disaster_duration = req.duration_seconds
            return

        self.active_faults[req.sensor_id] = {
            "type": req.fault_type,
            "intensity": req.intensity,
            "start_time": time.time(),
            "duration": req.duration_seconds,
            "drift_accum": 0.0,
            "frozen_val": self.current_values.get(req.sensor_id, 24.0)
        }

    def clear_all_faults(self):
        self.active_faults.clear()
        self.genuine_disaster_active = False
        for sid, meta in self.sensors_meta.items():
            self.current_values[sid] = meta.baseline_nominal

    def step(self, timestamp: Optional[float] = None) -> List[SensorTelemetryPayload]:
        now = timestamp if timestamp is not None else time.time()
        self.step_count += 1
        elapsed = now - self.start_time
        iso_ts = datetime.fromtimestamp(now, tz=timezone.utc).isoformat()

        # Update disaster progression
        disaster_temp_delta = 0.0
        disaster_gas_delta = 0.0
        if self.genuine_disaster_active:
            dis_elapsed = now - self.genuine_disaster_start
            if dis_elapsed <= self.genuine_disaster_duration:
                ramp = min(1.0, dis_elapsed / 12.0)
                disaster_temp_delta = 36.0 * ramp  # Sector-A heating to 59.5 C
                disaster_gas_delta = 32.0 * ramp
            else:
                self.genuine_disaster_active = False

        packets: List[SensorTelemetryPayload] = []

        for sid, meta in self.sensors_meta.items():
            fault_info = self.active_faults.get(sid)
            if fault_info and (now - fault_info["start_time"]) > fault_info["duration"]:
                self.active_faults.pop(sid, None)
                fault_info = None

            # Ambient baseline with subtle thermal inertia oscillation
            ambient_sine = math.sin(elapsed * 0.05 + hash(sid) % 10) * 0.35
            noise = random.gauss(0, 0.12)
            base_val = meta.baseline_nominal + ambient_sine + noise

            # Apply genuine disaster to Sector-A
            if meta.location_zone == "Sector-A" and self.genuine_disaster_active:
                if meta.metric_type == "temperature":
                    base_val += disaster_temp_delta
                elif meta.metric_type == "gas_co":
                    base_val += disaster_gas_delta

            # Injected fault behavior
            packet_dropped = False
            reported_val = base_val

            if fault_info:
                ftype = fault_info["type"]
                intensity = fault_info["intensity"]

                if ftype == "transient_spike":
                    f_elapsed = now - fault_info["start_time"]
                    if 1.0 <= f_elapsed <= 4.0:
                        spike_delta = (meta.critical_threshold_high - meta.baseline_nominal) * 1.6 * intensity
                        reported_val = base_val + spike_delta
                    else:
                        reported_val = base_val

                elif ftype == "gradual_drift":
                    # Monotonic upward drift (+0.85/step)
                    fault_info["drift_accum"] += 0.85 * intensity
                    reported_val = base_val + fault_info["drift_accum"]

                elif ftype == "stuck_flatline":
                    reported_val = round(fault_info["frozen_val"], 2)

                elif ftype == "intermittent_packet_loss":
                    # Drop packet to test Rule 2 missing data handling
                    if random.random() < 0.75:
                        packet_dropped = True

            self.current_values[sid] = reported_val

            if not packet_dropped:
                payload = SensorTelemetryPayload(
                    sensor_id=sid,
                    timestamp=iso_ts,
                    metric_type=meta.metric_type,
                    value=round(reported_val, 3),
                    unit=meta.unit,
                    metadata=TelemetryMetadata(
                        location_zone=meta.location_zone,
                        firmware_version=meta.firmware_version
                    )
                )
                packets.append(payload)

        return packets
