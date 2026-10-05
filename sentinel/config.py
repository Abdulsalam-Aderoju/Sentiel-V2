"""Paths and configuration loading. All thresholds come from config/settings.yaml."""
from __future__ import annotations

from functools import lru_cache
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parent.parent
CONFIG_DIR = ROOT / "config"
DATA_DIR = ROOT / "data"
RAW_DIR = DATA_DIR / "raw"
EXPORTS_DIR = DATA_DIR / "exports"     # simulator output, in real export formats
EVAL_DIR = DATA_DIR / "eval"           # answer key; never read by the engines
STAGING_DIR = DATA_DIR / "staging"     # dim_facility and loaded facts
MARTS_DIR = DATA_DIR / "marts"         # engine outputs
LOGS_DIR = DATA_DIR / "logs"


@lru_cache
def settings() -> dict:
    return yaml.safe_load((CONFIG_DIR / "settings.yaml").read_text(encoding="utf-8"))


@lru_cache
def mapping() -> dict:
    return yaml.safe_load((CONFIG_DIR / "dhis2_mapping.yaml").read_text(encoding="utf-8"))


def ensure_dirs() -> None:
    for d in (EXPORTS_DIR, EVAL_DIR, STAGING_DIR, MARTS_DIR, LOGS_DIR):
        d.mkdir(parents=True, exist_ok=True)
