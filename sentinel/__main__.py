"""PHC Sentinel pipeline CLI.

    python -m sentinel fetch-grid3   download raw GRID3 layers (only needed once; committed)
    python -m sentinel facilities    Phase 1: build dim_facility from GRID3
    python -m sentinel simulate      Phase 2: write simulated DHIS2/NHLMIS exports + answer key
    python -m sentinel pipeline      Phases 3-6: ingest exports, DQR, risk, confidence, queues
    python -m sentinel load-db       load staging + marts into PostgreSQL/PostGIS
    python -m sentinel all           facilities -> simulate -> pipeline
"""
from __future__ import annotations

import sys

from .config import ensure_dirs


def main(argv: list[str]) -> None:
    ensure_dirs()
    cmd = argv[0] if argv else "all"
    if cmd == "fetch-grid3":
        from .facility.grid3 import fetch
        fetch()
    elif cmd == "facilities":
        from .facility.grid3 import build
        build()
    elif cmd == "simulate":
        from .simulator import run
        run()
    elif cmd == "pipeline":
        from .pipeline import run
        run()
    elif cmd == "load-db":
        from .db import load
        load()
    elif cmd == "all":
        from .facility.grid3 import build
        from .pipeline import run as run_pipeline
        from .simulator import run as run_sim
        build()
        run_sim()
        run_pipeline()
    else:
        print(__doc__)
        sys.exit(1)


if __name__ == "__main__":
    main(sys.argv[1:])
