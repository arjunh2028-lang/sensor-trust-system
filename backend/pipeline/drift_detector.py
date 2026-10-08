"""
Sensor Drift and Calibration Degradation Detector.
Monitors sliding window residuals, computes regression slope (drift velocity), and CUSUM metrics.
"""

from collections import deque
import numpy as np
from typing import Tuple


class SensorDriftDetector:
    def __init__(self, window_size: int = 40, drift_threshold_slope: float = 0.08):
        """
        :param window_size: Number of observations in the sliding window (e.g. 40 samples)
        :param drift_threshold_slope: Slope above which drift is considered anomalous (units/second)
        """
        self.window_size = window_size
        self.drift_threshold_slope = drift_threshold_slope
        self.timestamps = deque(maxlen=window_size)
        self.residuals = deque(maxlen=window_size)
        self.cusum_pos = 0.0
        self.cusum_neg = 0.0

    def update(self, residual: float, timestamp: float) -> Tuple[float, float, float]:
        """
        Updates the drift tracker with the latest residual (raw - baseline).
        Returns:
            drift_metric: estimated drift slope (units/sec)
            cumulative_offset: mean residual over the window
            drift_health_score: 1.0 (no drift) down to 0.0 (severe persistent drift)
        """
        self.timestamps.append(timestamp)
        self.residuals.append(residual)

        if len(self.residuals) < 10:
            return 0.0, float(np.mean(self.residuals)), 1.0

        ts = np.array(self.timestamps)
        rs = np.array(self.residuals)
        dt = ts - ts[0]

        # Linear regression slope of residuals over time
        var_dt = np.var(dt)
        if var_dt > 1e-4:
            cov = np.cov(dt, rs)[0, 1]
            slope = cov / var_dt
        else:
            slope = 0.0

        mean_offset = float(np.mean(rs))
        abs_slope = abs(slope)

        # CUSUM step
        slack = self.drift_threshold_slope * 0.5
        self.cusum_pos = max(0.0, self.cusum_pos + (residual - slack))
        self.cusum_neg = max(0.0, self.cusum_neg - (residual + slack))

        # Health score calculation
        # If absolute slope exceeds threshold or mean offset persists, penalize
        slope_ratio = abs_slope / max(1e-4, self.drift_threshold_slope)
        offset_penalty = min(1.0, abs(mean_offset) / 10.0)

        # Combined drift penalty
        drift_penalty = min(1.0, 0.7 * slope_ratio + 0.3 * offset_penalty)
        drift_health_score = max(0.0, 1.0 - drift_penalty)

        return round(float(slope), 5), round(mean_offset, 3), round(float(drift_health_score), 4)

    def reset(self):
        self.timestamps.clear()
        self.residuals.clear()
        self.cusum_pos = 0.0
        self.cusum_neg = 0.0
