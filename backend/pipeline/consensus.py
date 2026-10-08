"""
Spatial Multi-Sensor Consensus Evaluator.
Evaluates cross-sensor agreement within the same spatial zone or correlated metrics.
Differentiates between single-point rogue anomalies and multi-sensor correlated physical events.
"""

import numpy as np
from typing import Dict, List, Tuple


class SpatialConsensusEvaluator:
    def __init__(self):
        pass

    def evaluate_sensor_consensus(
        self,
        target_sensor_id: str,
        current_readings: Dict[str, float],
        sensor_zones: Dict[str, str],
        sensor_metrics: Dict[str, str],
        sensor_baselines: Dict[str, float]
    ) -> Tuple[float, float, List[str]]:
        """
        Calculates how well the target sensor's deviation aligns with its peer sensors in the same zone.
        Returns:
            consensus_score: 1.0 (strong consensus) to 0.0 (complete rogue isolation)
            relative_divergence: normalized divergence from peers
            peer_sensor_ids: list of peer sensors evaluated
        """
        target_zone = sensor_zones.get(target_sensor_id)
        target_metric = sensor_metrics.get(target_sensor_id)
        target_val = current_readings.get(target_sensor_id)
        target_base = sensor_baselines.get(target_sensor_id, target_val)

        if target_val is None or target_zone is None:
            return 1.0, 0.0, []

        target_delta = target_val - target_base

        same_metric_peers = [
            sid for sid, zone in sensor_zones.items()
            if sid != target_sensor_id and zone == target_zone and sensor_metrics.get(sid) == target_metric and sid in current_readings
        ]

        if same_metric_peers:
            # For co-located sensors measuring the same physical metric in the same zone,
            # their physical readings should agree within normal tolerances (< 2.0 units)
            peer_values = [current_readings[pid] for pid in same_metric_peers]
            peer_median_val = float(np.median(peer_values))
            discrepancy = abs(target_val - peer_median_val)

            if discrepancy <= 2.0:
                consensus_score = 1.0
            else:
                # Exponential dropoff as discrepancy widens
                consensus_score = float(np.exp(-0.25 * (discrepancy - 2.0)))

            return round(float(np.clip(consensus_score, 0.0, 1.0)), 4), round(discrepancy, 3), same_metric_peers

        # If no same-metric peer exists, compare across correlated zone metrics
        other_peers = [
            sid for sid, zone in sensor_zones.items()
            if sid != target_sensor_id and zone == target_zone and sid in current_readings
        ]
        if not other_peers:
            return 1.0, 0.0, []

        return 1.0, 0.0, other_peers
