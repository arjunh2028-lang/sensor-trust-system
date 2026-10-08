"""
Explainability Layer for Sensor Trust, Drift, and Anomaly Diagnostics.
Generates human-interpretable reasoning, feature attributions, and actionable recommendations.
"""

from typing import Dict, Tuple


class SensorExplainabilityEngine:
    @staticmethod
    def generate_explanation(
        sensor_id: str,
        metric: str,
        zone: str,
        raw_val: float,
        baseline_val: float,
        classification: str,
        trust_score: float,
        consensus_score: float,
        slew_feasibility: float,
        actual_slew: float,
        max_slew: float,
        drift_slope: float,
        noise_entropy: float,
        packet_integrity: float,
        peer_sensors: list
    ) -> Tuple[str, str, Dict[str, float]]:
        """
        Generates:
            primary_cause: concise diagnostic category
            explanation: narrative explanation with physical context
            feature_attributions: normalized breakdown of factors influencing trust/alert
        """
        attributions = {
            "spatial_consensus": round(1.0 - consensus_score, 3),
            "slew_violation": round(1.0 - slew_feasibility, 3),
            "drift_severity": round(min(1.0, abs(drift_slope) * 10.0), 3),
            "noise_abnormality": round(1.0 - noise_entropy, 3),
            "packet_loss": round(1.0 - packet_integrity, 3)
        }

        # Normalize attributions
        total_attrib = sum(attributions.values())
        if total_attrib > 0:
            norm_attributions = {k: round(v / total_attrib, 3) for k, v in attributions.items()}
        else:
            norm_attributions = {k: 0.2 for k in attributions}

        # Determine primary cause & explanation based on classification
        if classification == "GENUINE_CRITICAL_ALARM":
            primary_cause = "Verified Environmental Hazard"
            peers_str = ", ".join(peer_sensors) if peer_sensors else "co-located sensors"
            explanation = (
                f"GENUINE RISK: {sensor_id} measured {raw_val:.1f} (baseline: {baseline_val:.1f}). "
                f"Rate of change ({actual_slew:.2f}/s) conforms to physical thermodynamics (feasibility: {slew_feasibility*100:.0f}%). "
                f"Spatial consensus with {peers_str} is high ({consensus_score*100:.0f}%), confirming true ambient hazard. "
                f"Sensor trust score remains solid at {trust_score*100:.0f}%. Immediate safety action required."
            )

        elif classification == "FALSE_ALARM_SUPPRESSED":
            if slew_feasibility < 0.4:
                primary_cause = "Transient Electrical / EMI Spike"
                explanation = (
                    f"FALSE ALARM SUPPRESSED: {sensor_id} spiked to {raw_val:.1f} at {actual_slew:.2f} units/sec, "
                    f"violating the physical slew limit of {max_slew:.1f} units/sec. "
                    f"Spatial consensus with peer sensors is only {consensus_score*100:.0f}%. "
                    f"Identified as non-physical transient noise. Facility alarm suppressed to prevent false evacuation."
                )
            elif abs(drift_slope) > 0.05:
                primary_cause = "Calibration Drift Degradation"
                explanation = (
                    f"FALSE ALARM SUPPRESSED: {sensor_id} threshold breach ({raw_val:.1f}) is driven by "
                    f"continuous calibration drift (slope {drift_slope:+.4f}/s). "
                    f"Neighboring sensors show no matching ambient rise (consensus: {consensus_score*100:.0f}%). "
                    f"Alarm suppressed. Auto-scheduling recalibration maintenance."
                )
            else:
                primary_cause = "Single-Point Rogue Outlier"
                explanation = (
                    f"FALSE ALARM SUPPRESSED: {sensor_id} reported {raw_val:.1f}, diverging sharply from peer sensors "
                    f"in {zone} (consensus score: {consensus_score*100:.0f}%). "
                    f"No ambient confirmation from redundant cluster. Alarm suppressed."
                )

        elif classification == "SENSOR_DEGRADED_MAINTENANCE":
            primary_cause = "Sensor Drift / Calibration Wear"
            explanation = (
                f"MAINTENANCE ADVISORY: {sensor_id} is displaying gradual drift (slope: {drift_slope:+.4f}/s) "
                f"with residual offset {raw_val - baseline_val:+.2f}. "
                f"Overall trust index has degraded to {trust_score*100:.0f}%. "
                f"Sensor remains operational but recalibration is recommended."
            )

        elif classification == "SENSOR_STUCK_OFFLINE":
            if noise_entropy < 0.1:
                primary_cause = "ADC Stuck-at / Flatline Freeze"
                explanation = (
                    f"SENSOR HARDWARE FAULT: {sensor_id} variance collapsed to zero over sliding window. "
                    f"Output is frozen at static value {raw_val:.2f}. "
                    f"Sensor trust collapsed to {trust_score*100:.0f}%. Sensor marked offline/dead."
                )
            else:
                primary_cause = "Telemetry Packet Loss / Network Drop"
                explanation = (
                    f"TELEMETRY FAULT: {sensor_id} experiencing intermittent network latency/packet loss "
                    f"(integrity score: {packet_integrity*100:.0f}%). Dynamic uncertainty envelopes expanded."
                )

        else:  # NORMAL
            primary_cause = "Nominal Operation"
            explanation = (
                f"Normal operational state. {sensor_id} reading {raw_val:.1f} is well within baseline bounds "
                f"[{baseline_val:.1f}]. Trust index: {trust_score*100:.0f}%, physical dynamics valid."
            )

        return primary_cause, explanation, norm_attributions
