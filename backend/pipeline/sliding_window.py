"""
Sliding-Window Buffer and Ingestion Preprocessing Rules.
Implements Rule 1 (Sliding-window stats), Rule 2 (Missing data handling), Rule 3 (Hard physical limits).
"""

from collections import deque
import numpy as np
from typing import Dict, List, Optional, Tuple
import time


class SensorSlidingWindowBuffer:
    def __init__(self, window_size: int = 60, expected_interval: float = 2.0):
        self.window_size = window_size
        self.expected_interval = expected_interval
        self.values = deque(maxlen=window_size)
        self.timestamps = deque(maxlen=window_size)
        self.last_received_time: Optional[float] = None
        self.total_packets_received = 0
        self.corrupt_packets_dropped = 0

    def check_is_offline(self, current_time: float) -> bool:
        """
        Rule 2: If a packet is missing for > 3x the sampling interval,
        flag the sensor state as OFFLINE rather than generating false anomaly spikes.
        """
        if self.last_received_time is None:
            return False
        elapsed = current_time - self.last_received_time
        return elapsed > (3.0 * self.expected_interval)

    def validate_hard_limits(self, value: float, hard_min: float, hard_max: float) -> bool:
        """
        Rule 3: Spike Filtering: Hard physical limits (absolute bounds checking)
        are executed first to drop corrupt packets before they reach the AI inference engine.
        """
        if np.isnan(value) or np.isinf(value):
            self.corrupt_packets_dropped += 1
            return False
        if value < hard_min or value > hard_max:
            self.corrupt_packets_dropped += 1
            return False
        return True

    def append(self, value: float, timestamp: float):
        self.values.append(value)
        self.timestamps.append(timestamp)
        self.last_received_time = timestamp
        self.total_packets_received += 1

    def compute_rolling_stats(self) -> Tuple[float, float, float]:
        """
        Rule 1: Rolling mean, rolling standard deviation, and rolling variance.
        """
        if not self.values:
            return 0.0, 0.0, 0.0
        arr = np.array(self.values)
        mean_val = float(np.mean(arr))
        std_val = float(np.std(arr))
        var_val = float(np.var(arr))
        return round(mean_val, 3), round(std_val, 3), round(var_val, 5)

    def get_window_values(self) -> List[float]:
        return list(self.values)

    def reset(self, initial_value: float):
        self.values.clear()
        self.timestamps.clear()
        self.last_received_time = None
