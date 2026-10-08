"""
Thermodynamic & Physical Slew Rate Feasibility Evaluator.
Validates whether the rate-of-change (|dv/dt|) is physically feasible or an electrical glitch/spike.
"""

import math
from typing import Tuple, Optional


class PhysicalSlewValidator:
    def __init__(self, max_physical_slew_rate: float):
        """
        :param max_physical_slew_rate: Maximum realistic physical change per second (e.g. 2.0 °C/s for temp, 15 ppm/s for gas)
        """
        self.max_slew = max_physical_slew_rate
        self.prev_value: Optional[float] = None
        self.prev_timestamp: Optional[float] = None

    def evaluate(self, current_value: float, current_timestamp: float) -> Tuple[float, float]:
        """
        Evaluates physical feasibility of the rate of change.
        Returns:
            feasibility_score: 1.0 (completely feasible) to 0.0 (impossible spike)
            actual_slew: observed rate of change |dv/dt| (units/sec)
        """
        if self.prev_value is None or self.prev_timestamp is None:
            self.prev_value = current_value
            self.prev_timestamp = current_timestamp
            return 1.0, 0.0

        dt = max(0.001, current_timestamp - self.prev_timestamp)
        actual_slew = abs(current_value - self.prev_value) / dt

        self.prev_value = current_value
        self.prev_timestamp = current_timestamp

        if actual_slew <= self.max_slew:
            # Fully feasible
            feasibility = 1.0
        else:
            # Exponential decay penalty for violating physical laws
            excess_ratio = (actual_slew - self.max_slew) / max(0.1, self.max_slew)
            feasibility = math.exp(-1.5 * excess_ratio)
            feasibility = max(0.0, min(1.0, feasibility))

        return round(feasibility, 4), round(actual_slew, 4)

    def reset(self, initial_value: float):
        self.prev_value = initial_value
        self.prev_timestamp = None
