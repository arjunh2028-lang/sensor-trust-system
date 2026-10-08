"""
Storage and Telemetry Registry for Sentinel AI.
Maintains sliding-window buffers, TimescaleDB-ready time-series cache, and alert audit logs.
"""

from collections import deque
import time
from typing import Dict, List, Optional
from backend.models import (
    SensorRegistrationMeta,
    SensorTelemetryPayload,
    SensorStatusResponse,
    AlertRecord,
    SystemSummaryResponse
)
from backend.pipeline.sliding_window import SensorSlidingWindowBuffer


SPEC_SENSORS: Dict[str, SensorRegistrationMeta] = {
    "sensor_env_01": SensorRegistrationMeta(
        sensor_id="sensor_env_01",
        name="Sector-A Ambient Temperature",
        metric_type="temperature",
        unit="Celsius",
        location_zone="Sector-A",
        firmware_version="v2.1.4",
        baseline_nominal=23.5,
        critical_threshold_high=55.0,
        max_physical_slew_rate=2.5,
        physical_hard_min=-40.0,
        physical_hard_max=120.0,
        expected_sample_interval_sec=2.0
    ),
    "sensor_env_02": SensorRegistrationMeta(
        sensor_id="sensor_env_02",
        name="Sector-A Backup Temperature",
        metric_type="temperature",
        unit="Celsius",
        location_zone="Sector-A",
        firmware_version="v2.1.4",
        baseline_nominal=23.5,
        critical_threshold_high=55.0,
        max_physical_slew_rate=2.5,
        physical_hard_min=-40.0,
        physical_hard_max=120.0,
        expected_sample_interval_sec=2.0
    ),
    "sensor_env_03": SensorRegistrationMeta(
        sensor_id="sensor_env_03",
        name="Sector-A Toxic Gas (CO)",
        metric_type="gas_co",
        unit="ppm",
        location_zone="Sector-A",
        firmware_version="v2.1.4",
        baseline_nominal=8.0,
        critical_threshold_high=35.0,
        max_physical_slew_rate=6.0,
        physical_hard_min=0.0,
        physical_hard_max=500.0,
        expected_sample_interval_sec=2.0
    ),
    "sensor_env_04": SensorRegistrationMeta(
        sensor_id="sensor_env_04",
        name="Sector-B Core Temperature",
        metric_type="temperature",
        unit="Celsius",
        location_zone="Sector-B",
        firmware_version="v2.1.4",
        baseline_nominal=24.0,
        critical_threshold_high=55.0,
        max_physical_slew_rate=2.5,
        physical_hard_min=-40.0,
        physical_hard_max=120.0,
        expected_sample_interval_sec=2.0
    ),
    "sensor_env_05": SensorRegistrationMeta(
        sensor_id="sensor_env_05",
        name="Sector-B Auxiliary Temperature",
        metric_type="temperature",
        unit="Celsius",
        location_zone="Sector-B",
        firmware_version="v2.1.4",
        baseline_nominal=24.0,
        critical_threshold_high=55.0,
        max_physical_slew_rate=2.5,
        physical_hard_min=-40.0,
        physical_hard_max=120.0,
        expected_sample_interval_sec=2.0
    ),
    "sensor_env_06": SensorRegistrationMeta(
        sensor_id="sensor_env_06",
        name="Sector-B Vessel Pressure",
        metric_type="pressure",
        unit="kPa",
        location_zone="Sector-B",
        firmware_version="v2.1.4",
        baseline_nominal=101.3,
        critical_threshold_high=135.0,
        max_physical_slew_rate=8.0,
        physical_hard_min=50.0,
        physical_hard_max=250.0,
        expected_sample_interval_sec=2.0
    )
}


class TimeSeriesStorageManager:
    def __init__(self, history_limit: int = 500):
        self.history_limit = history_limit
        self.registry: Dict[str, SensorRegistrationMeta] = SPEC_SENSORS.copy()
        self.sliding_buffers: Dict[str, SensorSlidingWindowBuffer] = {
            sid: SensorSlidingWindowBuffer(window_size=60, expected_interval=meta.expected_sample_interval_sec)
            for sid, meta in self.registry.items()
        }
        self.history: Dict[str, deque] = {
            sid: deque(maxlen=history_limit) for sid in self.registry
        }
        self.latest_status: Dict[str, SensorStatusResponse] = {}
        self.alert_logs: deque = deque(maxlen=200)

    def ensure_sensor(self, sid: str):
        if sid not in self.history:
            self.history[sid] = deque(maxlen=self.history_limit)

    def log_alert(self, alert: AlertRecord):
        self.alert_logs.appendleft(alert)

    def get_alerts(self, alert_type: Optional[str] = None, limit: int = 50) -> List[AlertRecord]:
        items = list(self.alert_logs)
        if alert_type:
            items = [a for a in items if a.alert_type == alert_type]
        return items[:limit]

    def get_history(self, sensor_id: str, limit: int = 100) -> List[dict]:
        if sensor_id not in self.history:
            return []
        return list(self.history[sensor_id])[-limit:]

    def get_all_status(self) -> List[SensorStatusResponse]:
        return list(self.latest_status.values())

    def get_system_summary(self) -> SystemSummaryResponse:
        statuses = list(self.latest_status.values())
        if not statuses:
            return SystemSummaryResponse(
                timestamp=time.time(),
                active_sensors_count=len(self.registry),
                overall_system_health=1.0,
                active_critical_alarms=0,
                active_suppressed_alarms=0,
                sensors_drifting=0,
                sensors_offline=0
            )

        crit_count = sum(1 for s in statuses if s.status == "GENUINE_CRITICAL_RISK")
        suppressed_count = sum(1 for s in statuses if s.is_false_alarm_suppressed)
        drifting_count = sum(1 for s in statuses if s.status == "DRIFT_DETECTED")
        offline_count = sum(1 for s in statuses if s.status == "OFFLINE")
        mean_trust = sum(s.trust_score for s in statuses) / len(statuses)

        return SystemSummaryResponse(
            timestamp=time.time(),
            active_sensors_count=len(statuses),
            overall_system_health=round(mean_trust, 3),
            active_critical_alarms=crit_count,
            active_suppressed_alarms=suppressed_count,
            sensors_drifting=drifting_count,
            sensors_offline=offline_count
        )
