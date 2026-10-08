"""
AI Inference Engine using PyTorch Temporal Autoencoder & Scikit-learn Isolation Forest.
Calculates multi-dimensional temporal reconstruction errors and anomaly likelihood.
"""

import numpy as np
import torch
import torch.nn as nn
from sklearn.ensemble import IsolationForest
from typing import Tuple, List, Optional


class TemporalAutoencoderNN(nn.Module):
    """
    PyTorch Autoencoder for Time-Series Reconstruction Error.
    Compresses sliding temporal window into latent bottleneck and reconstructs baseline dynamics.
    """
    def __init__(self, window_size: int = 16, latent_dim: int = 4):
        super().__init__()
        self.encoder = nn.Sequential(
            nn.Linear(window_size, 10),
            nn.Tanh(),
            nn.Linear(10, latent_dim)
        )
        self.decoder = nn.Sequential(
            nn.Linear(latent_dim, 10),
            nn.Tanh(),
            nn.Linear(10, window_size)
        )

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        z = self.encoder(x)
        out = self.decoder(z)
        return out


class SensorAIModelManager:
    """
    Manages Autoencoder inference and Isolation Forest scoring per sensor.
    """
    def __init__(self, window_size: int = 16):
        self.window_size = window_size
        self.models: dict[str, TemporalAutoencoderNN] = {}
        self.iso_forests: dict[str, IsolationForest] = {}
        self.nominal_baselines: dict[str, float] = {}

    def get_or_create_model(self, sensor_id: str, nominal_value: float) -> Tuple[TemporalAutoencoderNN, IsolationForest]:
        if sensor_id not in self.models:
            # Instantiate PyTorch Autoencoder
            model = TemporalAutoencoderNN(window_size=self.window_size)
            model.eval()

            # Pre-train briefly on nominal baseline synthetic noise for zero-shot initialization
            synthetic_clean = torch.randn(40, self.window_size) * 0.1
            optimizer = torch.optim.Adam(model.parameters(), lr=0.02)
            criterion = nn.MSELoss()
            model.train()
            for _ in range(25):
                optimizer.zero_grad()
                pred = model(synthetic_clean)
                loss = criterion(pred, synthetic_clean)
                loss.backward()
                optimizer.step()
            model.eval()

            # Initialize Scikit-learn Isolation Forest
            iso = IsolationForest(n_estimators=30, contamination=0.05, random_state=42)
            # Pre-fit on nominal feature distribution
            dummy_features = np.array([
                [0.0, 0.1, 0.05, 0.0, 0.2] + np.random.normal(0, 0.05, 5)
                for _ in range(50)
            ])
            iso.fit(dummy_features)

            self.models[sensor_id] = model
            self.iso_forests[sensor_id] = iso
            self.nominal_baselines[sensor_id] = nominal_value

        return self.models[sensor_id], self.iso_forests[sensor_id]

    def evaluate_reconstruction_error(
        self,
        sensor_id: str,
        window_values: List[float],
        nominal_baseline: float
    ) -> Tuple[float, float]:
        """
        Runs sliding-window sequence through PyTorch Autoencoder.
        Returns:
            reconstruction_error: MSE between normalized input and reconstructed baseline
            reconstructed_current_val: predicted expected value
        """
        if len(window_values) < self.window_size:
            return 0.01, window_values[-1] if window_values else nominal_baseline

        model, _ = self.get_or_create_model(sensor_id, nominal_baseline)

        arr = np.array(window_values[-self.window_size:], dtype=np.float32)
        # Normalize relative to nominal baseline
        scale = max(5.0, abs(nominal_baseline) * 0.2)
        norm_arr = (arr - nominal_baseline) / scale

        with torch.no_grad():
            inp = torch.tensor(norm_arr, dtype=torch.float32).unsqueeze(0)
            reconstructed = model(inp).squeeze(0).numpy()

        mse = float(np.mean((norm_arr - reconstructed) ** 2))
        recon_val = float(reconstructed[-1] * scale + nominal_baseline)

        return round(mse, 4), round(recon_val, 2)
