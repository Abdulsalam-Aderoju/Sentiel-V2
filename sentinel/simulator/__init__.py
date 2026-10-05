"""Phase 2: reporting-system simulator. All output is SIMULATED and labelled as such."""
from __future__ import annotations

import json

import numpy as np
import pandas as pd

from ..config import STAGING_DIR, settings
from .reporting import simulate_reporting, write_outputs
from .truth import simulate_truth


def run() -> dict:
    dim = pd.read_parquet(STAGING_DIR / "dim_facility.parquet")
    rng = np.random.default_rng(settings()["simulator"]["seed"])
    truth = simulate_truth(dim, rng)
    out = simulate_reporting(truth, dim, rng)
    rep = write_outputs(truth, out)
    print("Simulator realism report:", json.dumps(rep, indent=2, default=str))
    return rep
