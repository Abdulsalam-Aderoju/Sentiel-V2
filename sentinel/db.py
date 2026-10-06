"""Load staging tables and marts into PostgreSQL + PostGIS (proposal §8.1).

Tables are bulk-loaded with COPY, then post_load() adds geometry, JSONB,
indexes and the PostGIS coordinate check.
"""
from __future__ import annotations

import io
import json
import os
import time

import pandas as pd
from sqlalchemy import create_engine, text

from .config import MARTS_DIR, STAGING_DIR

DEFAULT_URL = "postgresql+psycopg://sentinel:sentinel@localhost:5433/sentinel"

TABLES = {
    "dim_facility": STAGING_DIR / "dim_facility.parquet",
    "stg_dhis2_values": STAGING_DIR / "stg_dhis2_values.parquet",
    "fact_dhis2_monthly": STAGING_DIR / "fact_dhis2_monthly.parquet",
    "fact_nhlmis_bimonthly": STAGING_DIR / "fact_nhlmis_bimonthly.parquet",
    "fact_quality_flags": MARTS_DIR / "fact_quality_flags.parquet",
    "fact_domain_results": MARTS_DIR / "fact_domain_results.parquet",
    "mart_facility_month": MARTS_DIR / "mart_facility_month.parquet",
    "mart_queue": MARTS_DIR / "mart_queue.parquet",
    "mart_commodity_month": MARTS_DIR / "mart_commodity_month.parquet",
    "mart_service_baseline": MARTS_DIR / "mart_service_baseline.parquet",
    "mart_lga_month": MARTS_DIR / "mart_lga_month.parquet",
}
JSONB = {"fact_domain_results": ["evidence"], "mart_queue": ["explanation"], "mart_facility_month": ["confidence_reasons"]}

# Every table is labelled real / synthetic mirror / derived (proposal §6.5).
DATA_LABELS = [
    ("dim_facility", "real", "GRID3 Nigeria Health Facilities v3.0 (CC BY 4.0); DHIS2/LMIS linkage keys are synthetic"),
    ("dim_lga", "real", "GRID3 LGA boundaries"),
    ("stg_dhis2_values", "synthetic", "Simulated DHIS2 data value set export"),
    ("fact_dhis2_monthly", "synthetic", "Simulated monthly NHMIS / RI reports, read through the DHIS2 adapter"),
    ("fact_nhlmis_bimonthly", "synthetic", "Simulated NHLMIS bimonthly facility stock reports"),
    ("fact_quality_flags", "derived", "WHO-aligned DQR rule results"),
    ("fact_domain_results", "derived", "Commodity, vaccine and service-pressure domain severities"),
    ("mart_facility_month", "derived", "Operational risk, data confidence and queue per facility-month"),
    ("mart_queue", "derived", "Ranked action and verification queues with explanations"),
    ("mart_commodity_month", "derived", "Latest NHLMIS record per commodity at each analysis date"),
    ("mart_service_baseline", "derived", "Seasonal robust baselines and z-scores"),
    ("mart_lga_month", "derived", "LGA roll-up"),
]


def engine():
    return create_engine(os.environ.get("DATABASE_URL", DEFAULT_URL), pool_pre_ping=True)


def _prepare(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()
    for c in df.columns:
        if df[c].dtype == object:
            sample = df[c].dropna().head(1)
            if len(sample) and isinstance(sample.iloc[0], (list, dict)):
                df[c] = df[c].map(lambda v: json.dumps(v, default=str) if v is not None else None)
            elif len(sample) and isinstance(sample.iloc[0], pd.Period):
                df[c] = df[c].astype(str)
    return df


def copy_df(conn, df: pd.DataFrame, table: str) -> None:
    df = _prepare(df)
    df.head(0).to_sql(table, conn, if_exists="replace", index=False)
    buf = io.StringIO()
    df.to_csv(buf, index=False, header=False, na_rep="\\N")
    buf.seek(0)
    raw = conn.connection.dbapi_connection
    cols = ", ".join(f'"{c}"' for c in df.columns)
    with raw.cursor() as cur:
        with cur.copy(f'COPY "{table}" ({cols}) FROM STDIN WITH (FORMAT csv, NULL \'\\N\')') as cp:
            while chunk := buf.read(1 << 20):
                cp.write(chunk)


def post_load(conn) -> None:
    conn.execute(text("CREATE EXTENSION IF NOT EXISTS postgis"))
    for table, cols in JSONB.items():
        for c in cols:
            conn.execute(text(f'ALTER TABLE {table} ALTER COLUMN "{c}" TYPE jsonb USING "{c}"::jsonb'))
    conn.execute(text("""
        ALTER TABLE dim_facility ADD PRIMARY KEY (facility_id);
        ALTER TABLE dim_facility ADD COLUMN geom geometry(Point, 4326);
        UPDATE dim_facility SET geom = ST_SetSRID(ST_MakePoint(longitude, latitude), 4326);
        CREATE INDEX ON dim_facility USING gist (geom);
        CREATE INDEX ON fact_quality_flags (facility_id, analysis_month);
        CREATE INDEX ON fact_domain_results (facility_id, analysis_month);
        CREATE UNIQUE INDEX ON mart_facility_month (facility_id, analysis_month);
        CREATE INDEX ON mart_facility_month (analysis_month, lga_id);
        CREATE UNIQUE INDEX ON mart_queue (facility_id, analysis_month);
        CREATE INDEX ON mart_queue (analysis_month, lga_id, queue, rank_lga);
        CREATE INDEX ON mart_commodity_month (facility_id, analysis_month);
        CREATE INDEX ON mart_service_baseline (facility_id, analysis_month);
        CREATE INDEX ON fact_dhis2_monthly (facility_id, period);
        CREATE INDEX ON fact_nhlmis_bimonthly (facility_id, period_start);
        CREATE UNIQUE INDEX ON mart_lga_month (analysis_month, lga_id);
    """))
    # Phase 1 gate in PostGIS: does each facility fall inside its own LGA polygon?
    conn.execute(text("""
        CREATE OR REPLACE VIEW v_facility_lga_check AS
        SELECT f.facility_id, f.name, f.lga, f.coord_status,
               ST_Contains(l.geom, f.geom) AS inside_own_lga,
               round(ST_Distance(l.geom::geography, f.geom::geography)) AS distance_m
        FROM dim_facility f JOIN dim_lga l USING (lga_id)
    """))


def load() -> None:
    t0 = time.time()
    eng = engine()
    with eng.begin() as conn:
        conn.execute(text("CREATE EXTENSION IF NOT EXISTS postgis"))
        conn.execute(text("DROP VIEW IF EXISTS v_facility_lga_check"))
        for table, path in TABLES.items():
            df = pd.read_parquet(path)
            copy_df(conn, df, table)
            print(f"  {table:<24} {len(df):>8,} rows")
        lga = json.loads((STAGING_DIR / "dim_lga.geojson").read_text(encoding="utf-8"))
        conn.execute(text("DROP TABLE IF EXISTS dim_lga"))
        conn.execute(text("CREATE TABLE dim_lga (lga_id text PRIMARY KEY, lga text, state text, geom geometry(MultiPolygon, 4326))"))
        for f in lga["features"]:
            conn.execute(text("INSERT INTO dim_lga VALUES (:id, :lga, :state, ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON(:g), 4326)))"),
                         {"id": f["properties"]["lga_id"], "lga": f["properties"]["lga"], "state": f["properties"]["state"],
                          "g": json.dumps(f["geometry"])})
        copy_df(conn, pd.DataFrame(DATA_LABELS, columns=["table_name", "data_class", "description"]), "meta_data_labels")
        post_load(conn)
        chk = conn.execute(text("SELECT coord_status, inside_own_lga, count(*) FROM v_facility_lga_check GROUP BY 1, 2 ORDER BY 1, 2")).fetchall()
    print(f"Database loaded in {time.time() - t0:.0f}s. PostGIS coordinate check: {chk}")
