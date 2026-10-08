"""
Variance, Entropy, and Packet Integrity Monitor.
Detects stuck/frozen sensors (variance collapse), excessive jitter (EMI/loose wire),
and packet dropouts / network latency spikes.
"""

from collections import deque
import numpy as np
from typing import Tuple, Optional


class VarianceAndIntegrityMonitor:
    def __init__(self, window_size: int = 25, min_variance: float = 0.0005, expected_period: float = 1.0):
        """
        :param window_size: Samples to compute rolling variance
        :param min_variance: Lower variance floor below which a sensor is flagged as frozen/stuck (flatline)
        :param expected_period: Expected arrival interval in seconds
        """
        self.window_size = window_size
        self.min_variance = min_variance
        self.expected_period = expected_period
        self.values = deque(maxlen=window_size)
        self.arrival_times = deque(maxlen=window_size)
        self.last_timestamp: Optional[float] = None

    def update(self, value: float, timestamp: float) -> Tuple[float, float, float]:
        """
        Updates rolling statistics.
        Returns:
            noise_entropy_score: 1.0 (healthy natural noise), 0.0 (stuck flatline or chaotic noise)
            rolling_variance: observed variance of first-differences
            packet_integrity_score: 1.0 (flawless stream) down to 0.0 (severe packet drops)
        """
        self.values.append(value)
        self.arrival_times.append(timestamp)

        # 1. Packet arrival integrity check
        if self.last_timestamp is not None:
            dt = timestamp - self.last_timestamp
            if dt <= self.expected_period * 2.0:
                packet_score = 1.0
            elif dt <= self.expected_period * 4.0:
                packet_score = 0.8
            else:
                packet_score = max(0.2, 1.0 - (dt / (self.expected_period * 10.0)))
        else:
            packet_score = 1.0
        self.last_timestamp = timestamp

        if len(self.values) < 8:
            return 1.0, 0.05, packet_score

        vals = np.array(self.values)
        diffs = np.diff(vals)
        diff_var = float(np.var(diffs))
        is_static_range = (np.ptp(vals) < 0.02)  # Peak-to-peak range is virtually 0

        # Check for frozen/stuck sensor (flatline)
        if diff_var < self.min_variance and is_static_range:
            noise_score = 0.02
        else:
            # Healthy variance range
            if diff_var > 25.0:
                noise_score = max(0.2, 1.0 - (diff_var / 50.0))
            else:
                noise_score = 1.0

        return round(float(noise_score), 4), round(diff_var, 5), round(float(packet_score), 4)

    def reset(self):
        self.values.clear()
        self.arrival_times.clear()
        self.last_timestamp = None
