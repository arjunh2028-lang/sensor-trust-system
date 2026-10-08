"""
Pydantic Schemas and Data Models for Sentinel AI.
Conforms strictly to Technical Specification Section 3 and Section 4.
"""

from typing import List, Dict, Optional, Any, Union
from pydantic import BaseModel, Field
import time
from datetime import datetime, timezone


class TelemetryMetadata(BaseModel):
    location_zone: str = Field(default="Sector-A", description="Spatial physical sector e.g. Sector-A, Sector-B")
    firmware_version: str = Field(default="v2.1.4", description="Device firmware version")


class SensorTelemetryPayload(BaseModel):
    """
    Input Schema matching Specification Section 3:
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
    sensor_id: str
    timestamp: Union[str, float] = Field(
        default_factory=lambda: datetime.now(timezone.utc).isoformat()
    )
    metric_type: str
    value: float
    unit: str
    metadata: TelemetryMetadata = Field(default_factory=TelemetryMetadata)

    def epoch_timestamp(self) -> float:
        if isinstance(self.timestamp, (int, float)):
            return float(self.timestamp)
        try:
            # Parse ISO-8601 string
            iso_str = self.timestamp.replace("Z", "+00:00")
            return datetime.fromisoformat(iso_str).timestamp()
        except Exception:
            return time.time()


class SensorRegistrationMeta(BaseModel):
    sensor_id: str
    name: str
    metric_type: str
    unit: str
    location_zone: str
    firmware_version: str = "v2.1.4"
    baseline_nominal: float
    critical_threshold_high: float
    critical_threshold_low: Optional[float] = None
    max_physical_slew_rate: float
    physical_hard_min: float = -100.0  # Absolute bounds check
    physical_hard_max: float = 500.0
    expected_sample_interval_sec: float = 2.0


class SensorStatusResponse(BaseModel):
    """
    Sensor Trust & Health Status Response matching Specification Section 4:
    {
      "sensor_id": "sensor_env_04",
      "trust_score": 0.42,
      "status": "DRIFT_DETECTED",
      "is_false_alarm_suppressed": true,
      "explanation": "Gradual upward calibration drift detected over 4 hours compared to neighboring sensors in Sector-B."
    }
    """
    sensor_id: str
    trust_score: float = Field(..., ge=0.0, le=1.0)
    status: str  # NORMAL, DRIFT_DETECTED, FALSE_ALARM_SUPPRESSED, GENUINE_CRITICAL_RISK, SENSOR_FAULT, OFFLINE
    is_false_alarm_suppressed: bool
    explanation: str

    # Extended metrics for UI rendering & diagnostics
    metric_type: str = "temperature"
    value: Optional[float] = None
    unit: str = "Celsius"
    rolling_mean: float = 0.0
    rolling_std: float = 0.0
    baseline_value: float = 0.0
    confidence_lower: float = 0.0
    confidence_upper: float = 0.0
    reconstruction_error: float = 0.0
    location_zone: str = "Sector-A"
    spatial_consensus_score: float = 1.0
    slew_rate_feasibility: float = 1.0
    drift_metric: float = 0.0
    noise_entropy_score: float = 1.0


class AlertRecord(BaseModel):
    """
    Alert Logs response matching Specification Section 4.3:
    Separates genuine environmental hazards from suppressed sensor faults.
    """
    alert_id: str
    timestamp: float
    sensor_id: str
    alert_type: str  # 'GENUINE_HAZARD' or 'SUPPRESSED_SENSOR_FAULT'
    metric_type: str
    value: float
    unit: str
    location_zone: str
    trust_score: float
    is_false_alarm_suppressed: bool
    summary: str
    explanation: str


class FaultInjectionRequest(BaseModel):
    sensor_id: str
    fault_type: str  # 'none', 'gradual_drift', 'transient_spike', 'stuck_flatline', 'intermittent_packet_loss', 'genuine_environmental_event'
    intensity: float = 1.0
    duration_seconds: float = 40.0


class SystemSummaryResponse(BaseModel):
    timestamp: float
    active_sensors_count: int
    overall_system_health: float
    active_critical_alarms: int
    active_suppressed_alarms: int
    sensors_drifting: int
    sensors_offline: int
