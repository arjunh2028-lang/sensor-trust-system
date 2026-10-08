"""
Dual-Assessment AI Pipeline Orchestrator for Sentinel AI.
Conforms strictly to Technical Specification Section 1, 3, and 4.
Combines sliding-window preprocessing, PyTorch Autoencoder reconstruction errors,
spatial cross-sensor correlation, physical slew limits, and explainable decision logic.
"""

from typing import Dict, List, Optional, Tuple
import numpy as np
import time

from backend.models import (
    SensorRegistrationMeta,
    SensorTelemetryPayload,
    SensorStatusResponse,
    AlertRecord
)
from backend.pipeline.sliding_window import SensorSlidingWindowBuffer
from backend.pipeline.autoencoder import SensorAIModelManager
from backend.pipeline.kalman import AdaptiveKalmanBaseline
from backend.pipeline.slew_detector import PhysicalSlewValidator
from backend.pipeline.drift_detector import SensorDriftDetector
from backend.pipeline.variance_monitor import VarianceAndIntegrityMonitor
from backend.pipeline.consensus import SpatialConsensusEvaluator


class DualAssessmentEngine:
    def __init__(self, sensors_meta: Dict[str, SensorRegistrationMeta]):
        self.sensors_meta = sensors_meta
        self.sliding_buffers: Dict[str, SensorSlidingWindowBuffer] = {}
        self.ai_manager = SensorAIModelManager(window_size=16)
        self.kalman_filters: Dict[str, AdaptiveKalmanBaseline] = {}
        self.slew_validators: Dict[str, PhysicalSlewValidator] = {}
        self.drift_detectors: Dict[str, SensorDriftDetector] = {}
        self.variance_monitors: Dict[str, VarianceAndIntegrityMonitor] = {}
        self.consensus_evaluator = SpatialConsensusEvaluator()

        self.current_readings: Dict[str, float] = {}
        self.current_baselines: Dict[str, float] = {}
        self.sensor_zones: Dict[str, str] = {sid: m.location_zone for sid, m in sensors_meta.items()}
        self.sensor_metrics: Dict[str, str] = {sid: m.metric_type for sid, m in sensors_meta.items()}

        for sid, meta in sensors_meta.items():
            self.sliding_buffers[sid] = SensorSlidingWindowBuffer(
                window_size=60,
                expected_interval=meta.expected_sample_interval_sec
            )
            self.kalman_filters[sid] = AdaptiveKalmanBaseline(
                initial_value=meta.baseline_nominal,
                process_noise=0.08,
                measurement_noise=0.3
            )
            self.slew_validators[sid] = PhysicalSlewValidator(
                max_physical_slew_rate=meta.max_physical_slew_rate
            )
            self.drift_detectors[sid] = SensorDriftDetector(
                window_size=35,
                drift_threshold_slope=0.04
            )
            self.variance_monitors[sid] = VarianceAndIntegrityMonitor(
                window_size=20,
                min_variance=0.0005,
                expected_period=meta.expected_sample_interval_sec
            )
            self.current_readings[sid] = meta.baseline_nominal
            self.current_baselines[sid] = meta.baseline_nominal

    def register_sensor_if_missing(self, sid: str, metric_type: str = "temperature", unit: str = "Celsius", location_zone: str = "Sector-A", initial_value: float = 25.0):
        if sid not in self.sensors_meta:
            meta = SensorRegistrationMeta(
                sensor_id=sid,
                name=f"{sid.replace('_', ' ').title()}",
                metric_type=metric_type,
                unit=unit,
                location_zone=location_zone,
                baseline_nominal=initial_value,
                critical_threshold_high=55.0,
                max_physical_slew_rate=3.0,
                physical_hard_min=-50.0,
                physical_hard_max=150.0,
                expected_sample_interval_sec=1.0
            )
            self.sensors_meta[sid] = meta
            self.sensor_zones[sid] = meta.location_zone
            self.sensor_metrics[sid] = meta.metric_type
            self.sliding_buffers[sid] = SensorSlidingWindowBuffer(window_size=60, expected_interval=1.0)
            self.kalman_filters[sid] = AdaptiveKalmanBaseline(initial_value=initial_value, process_noise=0.08, measurement_noise=0.3)
            self.slew_validators[sid] = PhysicalSlewValidator(max_physical_slew_rate=meta.max_physical_slew_rate)
            self.drift_detectors[sid] = SensorDriftDetector(window_size=35, drift_threshold_slope=0.04)
            self.variance_monitors[sid] = VarianceAndIntegrityMonitor(window_size=20, min_variance=0.0005, expected_period=1.0)
            self.current_readings[sid] = initial_value
            self.current_baselines[sid] = initial_value

    def process_telemetry(self, payload: SensorTelemetryPayload) -> Tuple[SensorStatusResponse, Optional[AlertRecord]]:
        sid = payload.sensor_id
        meta = self.sensors_meta.get(sid)
        if not meta:
            self.register_sensor_if_missing(
                sid=sid,
                metric_type=payload.metric_type or "temperature",
                unit=payload.unit or "Celsius",
                location_zone=payload.metadata.location_zone if payload.metadata else "Sector-A",
                initial_value=payload.value
            )
            meta = self.sensors_meta[sid]

        val = payload.value
        ts = payload.epoch_timestamp()
        buffer = self.sliding_buffers[sid]

        # Rule 3: Spike Filtering / Hard limits
        is_valid_physical = buffer.validate_hard_limits(val, meta.physical_hard_min, meta.physical_hard_max)
        if not is_valid_physical:
            # Corrupt packet dropped before reaching AI inference
            return SensorStatusResponse(
                sensor_id=sid,
                trust_score=0.1,
                status="CORRUPT_PACKET_DROPPED",
                is_false_alarm_suppressed=True,
                explanation=f"Corrupt packet dropped by hard physical limit filter [{meta.physical_hard_min}, {meta.physical_hard_max}].",
                metric_type=meta.metric_type,
                value=val,
                unit=meta.unit,
                location_zone=meta.location_zone
            ), None

        # Rule 1: Sliding-Window Buffering & Rolling Statistics
        buffer.append(val, ts)
        rolling_mean, rolling_std, rolling_var = buffer.compute_rolling_stats()
        self.current_readings[sid] = val

        # Rule 2: Missing Data Check (> 3x interval)
        is_offline = buffer.check_is_offline(ts)
        if is_offline:
            return SensorStatusResponse(
                sensor_id=sid,
                trust_score=0.0,
                status="OFFLINE",
                is_false_alarm_suppressed=True,
                explanation=f"Sensor state flagged OFFLINE: no telemetry received for >3x expected sampling interval.",
                metric_type=meta.metric_type,
                value=val,
                unit=meta.unit,
                location_zone=meta.location_zone
            ), None

        # Slew Rate Feasibility (|dv/dt|)
        slew_feasibility, actual_slew = self.slew_validators[sid].evaluate(val, ts)

        # Variance & Noise Entropy (Detects flatlines / stuck ADC)
        noise_entropy, diff_var, packet_integrity = self.variance_monitors[sid].update(val, ts)

        # Spatial Cross-Sensor Correlation across same location_zone
        consensus_score, discrepancy, peer_ids = self.consensus_evaluator.evaluate_sensor_consensus(
            target_sensor_id=sid,
            current_readings=self.current_readings,
            sensor_zones=self.sensor_zones,
            sensor_metrics=self.sensor_metrics,
            sensor_baselines=self.current_baselines
        )

        # Adaptive Baseline & Dynamic Confidence Bounds
        prelim_trust = (0.4 * consensus_score + 0.4 * slew_feasibility + 0.2 * noise_entropy)
        baseline, conf_lower, conf_upper = self.kalman_filters[sid].update(val, ts, trust_weight=prelim_trust)
        self.current_baselines[sid] = baseline
        residual = val - baseline

        # Drift Metric & CUSUM Regression
        drift_slope, mean_offset, drift_health = self.drift_detectors[sid].update(residual, ts)
        if consensus_score >= 0.70:
            drift_health = max(drift_health, 0.90)

        # PyTorch Autoencoder Temporal Reconstruction Error
        window_vals = buffer.get_window_values()
        recon_err, reconstructed_val = self.ai_manager.evaluate_reconstruction_error(
            sensor_id=sid,
            window_values=window_vals,
            nominal_baseline=meta.baseline_nominal
        )
        recon_health = max(0.0, 1.0 - min(1.0, recon_err * 2.5))

        # Composite Sensor Trust Score
        composite_trust = (
            0.30 * consensus_score +
            0.25 * slew_feasibility +
            0.20 * recon_health +
            0.15 * drift_health +
            0.10 * noise_entropy
        )

        if noise_entropy < 0.05:
            composite_trust = min(composite_trust, 0.15)
        if slew_feasibility < 0.05:
            composite_trust = min(composite_trust, 0.20)

        composite_trust = round(float(np.clip(composite_trust, 0.0, 1.0)), 4)

        # Environmental Hazard Assessment
        crit_high = meta.critical_threshold_high
        crit_low = meta.critical_threshold_low
        is_threshold_breach = (val >= crit_high) or ((crit_low is not None) and (val <= crit_low))

        # Dual-Assessment Classification
        is_false_alarm_suppressed = False
        alert_record: Optional[AlertRecord] = None

        if is_threshold_breach:
            # Genuine Risk: Physically feasible slew rate confirmed by spatial consensus with peers
            if consensus_score >= 0.45 and slew_feasibility >= 0.70:
                status = "GENUINE_CRITICAL_RISK"
                is_false_alarm_suppressed = False
                explanation = (
                    f"GENUINE RISK: {sid} reached {val:.1f} {meta.unit} (exceeding threshold {crit_high:.1f} {meta.unit}). "
                    f"Thermodynamic slew ({actual_slew:.2f}/s) and spatial consensus with {meta.location_zone} peers "
                    f"({consensus_score*100:.0f}%) confirm true ambient hazard. Sensor trust: {composite_trust*100:.0f}%."
                )
                alert_record = AlertRecord(
                    alert_id=f"ALT-{int(ts*1000)}-{sid[-4:]}",
                    timestamp=ts,
                    sensor_id=sid,
                    alert_type="GENUINE_HAZARD",
                    metric_type=meta.metric_type,
                    value=val,
                    unit=meta.unit,
                    location_zone=meta.location_zone,
                    trust_score=composite_trust,
                    is_false_alarm_suppressed=False,
                    summary="Verified Environmental Hazard",
                    explanation=explanation
                )
            else:
                status = "FALSE_ALARM_SUPPRESSED"
                is_false_alarm_suppressed = True
                explanation = (
                    f"FALSE ALARM SUPPRESSED: {sid} triggered threshold breach ({val:.1f} {meta.unit}), "
                    f"but trust score is degraded ({composite_trust*100:.0f}%). "
                    f"Spatial consensus with {meta.location_zone} peers is only {consensus_score*100:.0f}%. "
                    f"Autoencoder reconstruction error: {recon_err:.3f}. Alarm suppressed to prevent false shutdown."
                )
                alert_record = AlertRecord(
                    alert_id=f"ALT-{int(ts*1000)}-{sid[-4:]}",
                    timestamp=ts,
                    sensor_id=sid,
                    alert_type="SUPPRESSED_SENSOR_FAULT",
                    metric_type=meta.metric_type,
                    value=val,
                    unit=meta.unit,
                    location_zone=meta.location_zone,
                    trust_score=composite_trust,
                    is_false_alarm_suppressed=True,
                    summary="Suppressed False Alarm",
                    explanation=explanation
                )

        elif (consensus_score < 0.75 and abs(val - meta.baseline_nominal) > 2.5) or (abs(drift_slope) > 0.02 and consensus_score < 0.70):
            status = "DRIFT_DETECTED"
            is_false_alarm_suppressed = True
            explanation = (
                f"Gradual upward calibration drift detected (slope {drift_slope:+.4f}/s) "
                f"compared to neighboring sensors in {meta.location_zone}."
            )
            alert_record = AlertRecord(
                alert_id=f"ALT-{int(ts*1000)}-{sid[-4:]}",
                timestamp=ts,
                sensor_id=sid,
                alert_type="SUPPRESSED_SENSOR_FAULT",
                metric_type=meta.metric_type,
                value=val,
                unit=meta.unit,
                location_zone=meta.location_zone,
                trust_score=composite_trust,
                is_false_alarm_suppressed=True,
                summary="Calibration Drift Detected",
                explanation=explanation
            )

        elif noise_entropy < 0.05:
            status = "STUCK_FLATLINE"
            is_false_alarm_suppressed = True
            explanation = (
                f"Sensor hardware fault: variance collapsed to 0 over sliding window. "
                f"Output frozen at {val:.2f} {meta.unit}."
            )
        elif composite_trust < 0.60:
            status = "DRIFT_DETECTED"
            is_false_alarm_suppressed = True
            explanation = f"Sensor integrity degraded in {meta.location_zone}. Recalibration advisory."
        else:
            status = "NORMAL"
            explanation = f"Nominal baseline operation in {meta.location_zone}. Physical telemetry verified."

        response = SensorStatusResponse(
            sensor_id=sid,
            trust_score=composite_trust,
            status=status,
            is_false_alarm_suppressed=is_false_alarm_suppressed,
            explanation=explanation,
            metric_type=meta.metric_type,
            value=round(val, 2),
            unit=meta.unit,
            rolling_mean=rolling_mean,
            rolling_std=rolling_std,
            baseline_value=round(baseline, 2),
            confidence_lower=round(conf_lower, 2),
            confidence_upper=round(conf_upper, 2),
            reconstruction_error=recon_err,
            location_zone=meta.location_zone,
            spatial_consensus_score=consensus_score,
            slew_rate_feasibility=slew_feasibility,
            drift_metric=drift_slope,
            noise_entropy_score=noise_entropy
        )

        return response, alert_record

    def recalibrate_sensor(self, sensor_id: str):
        if sensor_id in self.sensors_meta:
            meta = self.sensors_meta[sensor_id]
            self.sliding_buffers[sensor_id].reset(meta.baseline_nominal)
            self.kalman_filters[sensor_id].reset(meta.baseline_nominal)
            self.slew_validators[sensor_id].reset(meta.baseline_nominal)
            self.drift_detectors[sensor_id].reset()
            self.variance_monitors[sensor_id].reset()
            self.current_readings[sensor_id] = meta.baseline_nominal
            self.current_baselines[sensor_id] = meta.baseline_nominal
