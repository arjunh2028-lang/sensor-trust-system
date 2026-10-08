"""
Adaptive Baseline Estimator using 1D Kalman Filtering and Dynamic Uncertainty Bands.
"""

import math
from typing import Tuple


class AdaptiveKalmanBaseline:
    def __init__(self, initial_value: float, process_noise: float = 0.05, measurement_noise: float = 0.5):
        self.x = initial_value  # State estimate (baseline)
        self.P = 1.0  # Estimate error covariance
        self.Q = process_noise  # Process noise covariance
        self.R = measurement_noise  # Measurement noise covariance
        self.last_timestamp: float = 0.0
        self.initialized = False

    def update(self, measurement: float, timestamp: float, trust_weight: float = 1.0) -> Tuple[float, float, float]:
        """
        Updates the baseline estimate with trust weighting.
        If the sensor is suspected of glitching/fault, trust_weight decreases,
        so the baseline does not get contaminated by the bad measurement.
        Returns: (baseline_estimate, lower_3sigma, upper_3sigma)
        """
        if not self.initialized:
            self.x = measurement
            self.P = self.R
            self.last_timestamp = timestamp
            self.initialized = True
            std_dev = math.sqrt(self.P + self.R)
            return self.x, self.x - 3.0 * std_dev, self.x + 3.0 * std_dev

        dt = max(0.1, timestamp - self.last_timestamp) if self.last_timestamp > 0 else 1.0
        self.last_timestamp = timestamp

        # Time update (Predict)
        # Adapt process noise with dt
        x_pred = self.x
        P_pred = self.P + self.Q * dt

        # Measurement update (Correct) with adaptive trust-scaled measurement noise
        # Lower trust expands effective R, meaning Kalman ignores faulty measurement
        effective_R = self.R / max(0.05, trust_weight)
        
        K = P_pred / (P_pred + effective_R)
        self.x = x_pred + K * (measurement - x_pred)
        self.P = (1.0 - K) * P_pred

        total_variance = self.P + self.R
        std_dev = math.sqrt(max(0.0001, total_variance))
        lower_bound = self.x - 3.0 * std_dev
        upper_bound = self.x + 3.0 * std_dev

        return self.x, lower_bound, upper_bound

    def reset(self, new_value: float):
        self.x = new_value
        self.P = 1.0
