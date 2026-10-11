"""Hidden burden behind reporting gaps (Workstream B). MODELLED, validated against the simulator's truth.

Two estimates, both from data the system already holds:

  Hidden cases   For a PHC whose monthly report is missing, the expected count for that month is its own
                 seasonal baseline (mart_service_baseline.expected: rolling median of prior reported months,
                 times the state calendar-month index). The interval multiplies it by the low and high
                 quantiles of value / expected among PHCs that did report, over the trailing error window.
                 State totals combine facility intervals as independent errors (normal approximation).

  Implied stock  For a PHC whose NHLMIS report is stale, implied stock at month end = last physical stock
                 minus AMC x months elapsed x r, with r the low / median / high quantile of observed
                 consumption / previous AMC. Deliveries since the last report are unknown, which is why the
                 label is a likelihood, never a fact.

Truth (data/states/{code}/eval) is read only by `validate`, to score the estimates; never to make them.

Outputs per state in data/states/{code}/burden/ and national roll-ups in data/national/:
  mart_hidden_burden_facility   facility x month (rows with a missing report or a stale NHLMIS report)
  mart_hidden_burden_lga        LGA x month
  mart_hidden_burden_state      state x month (+ variance, so roll-ups can combine intervals)
  burden_validation.json        MAPE, interval coverage, bias, label precision / recall
"""
from __future__ import annotations

import json
from statistics import NormalDist

import numpy as np
import pandas as pd

from ..config import NATIONAL_DIR, StatePaths, settings, states

DAYS_PER_MONTH = 30.4375


def cfg() -> dict:
    return settings()["burden"]


def c_headline() -> str:
    return cfg()["headline_indicator"]


def _z() -> float:
    return NormalDist().inv_cdf(0.5 + cfg()["interval"] / 2)


def _q() -> tuple[float, float]:
    a = (1 - cfg()["interval"]) / 2
    return a, 1 - a


def month_end(m: str) -> pd.Timestamp:
    return pd.Period(m, "M").end_time.normalize()


def _window(months: list[str], m: str, n: int) -> list[str]:
    i = months.index(m)
    return months[max(0, i - n + 1): i + 1]


# ---- hidden cases --------------------------------------------------------------------------------------
def error_quantiles(sb: pd.DataFrame, months: list[str]) -> pd.DataFrame:
    """Per month and indicator:
    nowcast  = sum(value) / sum(expected) among PHCs that reported this month (the month's common shock: season
               stronger or weaker than usual, a state-wide surge), applied to every missing PHC;
    q_lo/hi  = quantiles of (value / expected) / nowcast among reporting PHCs over the trailing window."""
    c = cfg()
    lo_q, hi_q = _q()
    ok = sb[sb["value"].notna() & (sb["expected"] > 0) & (sb["n_hist"] >= c["min_history_months"])]
    now = ok.groupby(["analysis_month", "indicator"]).agg(v=("value", "sum"), e=("expected", "sum")).reset_index()
    now["nowcast"] = now["v"] / now["e"]
    now = now[["analysis_month", "indicator", "nowcast"]]
    ok = ok.merge(now, on=["analysis_month", "indicator"])
    ok = ok.assign(ratio=ok["value"] / ok["expected"] / ok["nowcast"])
    rows = []
    for m in months:
        w = ok[ok["analysis_month"].isin(_window(months, m, c["error_window_months"]))]
        for ind, g in w.groupby("indicator"):
            if len(g) >= 30:
                n = now[(now["analysis_month"] == m) & (now["indicator"] == ind)]["nowcast"]
                rows.append({"analysis_month": m, "indicator": ind, "nowcast": float(n.iloc[0]) if len(n) else 1.0,
                             "q_lo": g["ratio"].quantile(lo_q), "q_mid": g["ratio"].median(), "q_hi": g["ratio"].quantile(hi_q),
                             "n_err": len(g)})
    return pd.DataFrame(rows)


def hidden_cases(fm: pd.DataFrame, sb: pd.DataFrame, months: list[str]) -> pd.DataFrame:
    c = cfg()
    z = _z()
    eq = error_quantiles(sb, months)
    miss = fm.loc[~fm["report_received"].astype(bool), ["facility_id", "analysis_month"]]
    out = miss.copy()
    for ind in c["indicators"]:
        b = sb[(sb["indicator"] == ind) & (sb["n_hist"] >= c["min_history_months"])][["facility_id", "analysis_month", "expected"]]
        e = eq[eq["indicator"] == ind][["analysis_month", "nowcast", "q_lo", "q_hi"]]
        x = miss.merge(b, on=["facility_id", "analysis_month"], how="left").merge(e, on="analysis_month", how="left")
        est = x["expected"] * x["nowcast"]
        lo, hi = est * x["q_lo"], est * x["q_hi"]
        out[f"est_{ind}"] = est.round(1).values
        out[f"lo_{ind}"] = lo.round(1).values
        out[f"hi_{ind}"] = hi.round(1).values
        out[f"var_{ind}"] = (((hi - lo) / (2 * z)) ** 2).values
    out["report_missing"] = True
    return out


# ---- implied stock -------------------------------------------------------------------------------------
def net_flow_params(cm: pd.DataFrame, months: list[str]) -> pd.DataFrame:
    """Per month and stock group: mean and sd of the net change per NHLMIS period (received - adjusted consumption),
    in months of previous AMC, over records ending in the year before month end; and the mean period length."""
    groups = cfg()["stock_groups"]
    rec = cm[cm["has_record"].astype(bool)].drop_duplicates(["facility_id", "commodity_code", "period_end"])
    rec = rec.assign(period_end=pd.to_datetime(rec["period_end"]),
                     start=pd.PeriodIndex(rec["period_start"], freq="M").start_time)
    rec["months"] = ((rec["period_end"] - rec["start"]).dt.days + 1) / DAYS_PER_MONTH
    rec = rec[(rec["prev_amc"] > 0) & rec["adjusted_consumption"].notna()]
    rec = rec.assign(x=(rec["quantity_received"].fillna(0) - rec["adjusted_consumption"]) / rec["prev_amc"])
    rows = []
    for m in months:
        end = month_end(m)
        w = rec[(rec["period_end"] <= end) & (rec["period_end"] > end - pd.Timedelta(days=366))]
        for gname, codes in groups.items():
            g = w[w["commodity_code"].isin(codes)]
            if len(g) >= 30:
                rows.append({"analysis_month": m, "group": gname, "mu": g["x"].mean(), "sd": g["x"].std(),
                             "period_months": g["months"].mean()})
    return pd.DataFrame(rows)


def _norm_cdf(x):
    from scipy.special import ndtr
    return ndtr(np.asarray(x, dtype=float))


def implied_stock(fm: pd.DataFrame, cm: pd.DataFrame, months: list[str]) -> pd.DataFrame:
    """Implied stock at month end for PHCs with a stale NHLMIS report: last physical stock plus the typical net flow
    over the elapsed periods; sd grows with sqrt(periods). p_out is the normal probability that stock is <= 0."""
    c = cfg()
    groups = c["stock_groups"]
    th = c["label_thresholds"]
    z = _z()
    nf = net_flow_params(cm, months)
    stale = fm.loc[fm["nhlmis_stale"].fillna(True).astype(bool), ["facility_id", "analysis_month"]]
    out = stale.copy()
    cur = cm[cm["analysis_month"].isin(months)]
    for gname, codes in groups.items():
        sub = cur[cur["commodity_code"].isin(codes)].assign(stock=lambda d: d["physical_stock"].clip(lower=0))
        gb = sub.groupby(["facility_id", "analysis_month"])
        g = pd.DataFrame({"stock": gb["stock"].sum(min_count=1), "amc": gb["amc"].sum(min_count=1),
                          "period_end": gb["period_end"].max()}).reset_index()
        x = stale.merge(g, on=["facility_id", "analysis_month"], how="left").merge(
            nf[nf["group"] == gname][["analysis_month", "mu", "sd", "period_months"]], on="analysis_month", how="left")
        ends = x["analysis_month"].map(month_end)
        elapsed = ((ends - pd.to_datetime(x["period_end"])).dt.days / DAYS_PER_MONTH).clip(lower=0)
        k = elapsed / x["period_months"]
        mid = x["stock"] + x["amc"] * k * x["mu"]
        sd = (x["amc"] * x["sd"] * np.sqrt(k)).clip(lower=1e-6)
        p_out = pd.Series(_norm_cdf((0 - mid) / sd), index=x.index).where(mid.notna())
        key = gname.lower()
        out[f"{key}_last_stock"] = x["stock"].values
        out[f"{key}_amc"] = x["amc"].values
        out[f"{key}_last_period_end"] = pd.to_datetime(x["period_end"]).dt.date.values
        out[f"{key}_months_since"] = elapsed.round(2).values
        out[f"{key}_implied"] = mid.clip(lower=0).round(1).values
        out[f"{key}_implied_lo"] = (mid - z * sd).clip(lower=0).round(1).values
        out[f"{key}_implied_hi"] = (mid + z * sd).clip(lower=0).round(1).values
        out[f"{key}_p_out"] = p_out.round(3).values
        out[f"{key}_label"] = np.select([p_out.isna(), p_out >= th["elevated"], p_out >= th["watch"]],
                                        ["unknown", "elevated_risk", "watch"], "no_signal")
    out["implied_stock_label"] = out[f"{c['label_group'].lower()}_label"]
    out["nhlmis_stale"] = True
    return out


# ---- per state -------------------------------------------------------------------------------------------
def run(code: str) -> str:
    p = StatePaths(code)
    fm = pd.read_parquet(p.marts / "mart_facility_month.parquet",
                         columns=["facility_id", "lga_id", "lga", "analysis_month", "report_received", "nhlmis_stale"])
    sb = pd.read_parquet(p.marts / "mart_service_baseline.parquet")
    cm = pd.read_parquet(p.marts / "mart_commodity_month.parquet")
    months = sorted(fm["analysis_month"].unique())
    hc = hidden_cases(fm, sb, months)
    st = implied_stock(fm, cm, months)
    fac = hc.merge(st, on=["facility_id", "analysis_month"], how="outer")
    fac["report_missing"] = fac["report_missing"].astype("boolean").fillna(False).astype(bool)
    fac["nhlmis_stale"] = fac["nhlmis_stale"].astype("boolean").fillna(False).astype(bool)
    fac = fac.merge(fm[["facility_id", "analysis_month", "lga_id", "lga"]], on=["facility_id", "analysis_month"], how="left")
    fac["state_code"] = code
    fac["data_class"] = cfg()["data_class"]
    out = p.root / "burden"
    out.mkdir(parents=True, exist_ok=True)
    fac.to_parquet(out / "mart_hidden_burden_facility.parquet", index=False)
    lga = rollup(fac, ["state_code", "lga_id", "lga", "analysis_month"])
    lga.to_parquet(out / "mart_hidden_burden_lga.parquet", index=False)
    sm = rollup(fac, ["state_code", "analysis_month"])
    rep = sb[sb["indicator"] == c_headline()].groupby("analysis_month")["value"].sum().rename("reported_malaria_cases")
    sm = sm.merge(rep, left_on="analysis_month", right_index=True, how="left")
    sm.to_parquet(out / "mart_hidden_burden_state.parquet", index=False)
    val = validate(code, fac, sm, months)
    (out / "burden_validation.json").write_text(json.dumps(val, indent=1, default=float), encoding="utf-8")
    last = sm[sm["analysis_month"] == months[-1]].iloc[0]
    f = val["facility"]["confirmed_malaria"]
    return (f"{code}: burden done; {months[-1]} hidden malaria cases {last['hidden_malaria_cases']:,.0f} "
            f"({last['hidden_malaria_lo']:,.0f}-{last['hidden_malaria_hi']:,.0f}); facility WAPE {f['wape']:.0%}, "
            f"coverage {f['coverage']:.0%}; state-total coverage {val['state_total']['confirmed_malaria']['coverage']:.0%}; "
            f"{int(last['n_stock_elevated'])} at elevated stock-out risk (lift {val['stock']['ACT']['lift_elevated'] or 0:.1f}x)")


def rollup(fac: pd.DataFrame, keys: list[str]) -> pd.DataFrame:
    z = _z()
    f = fac.assign(
        _m=fac["report_missing"], _e=fac["report_missing"] & fac["est_confirmed_malaria"].notna(),
        _st=fac["nhlmis_stale"], _le=fac["implied_stock_label"].eq("elevated_risk"),
        _pe=fac["implied_stock_label"].eq("watch"))
    g = f.groupby(keys, dropna=False)
    r = g.agg(n_report_missing=("_m", "sum"), n_estimated=("_e", "sum"),
              hidden_malaria_cases=("est_confirmed_malaria", "sum"), hidden_malaria_var=("var_confirmed_malaria", "sum"),
              hidden_opd=("est_opd", "sum"), hidden_opd_var=("var_opd", "sum"),
              n_stale_stock=("_st", "sum"), n_stock_elevated=("_le", "sum"), n_stock_watch=("_pe", "sum")).reset_index()
    for k in ("malaria", "opd"):
        col = "hidden_malaria_cases" if k == "malaria" else "hidden_opd"
        sd = np.sqrt(r[f"hidden_{k}_var"])
        r[f"hidden_{k}_lo"] = (r[col] - z * sd).clip(lower=0).round(0)
        r[f"hidden_{k}_hi"] = (r[col] + z * sd).round(0)
        r[col] = r[col].round(0)
    r["data_class"] = cfg()["data_class"]
    return r


# ---- validation against truth (scoring only) -----------------------------------------------------------------
def validate(code: str, fac: pd.DataFrame, sm: pd.DataFrame, months: list[str]) -> dict:
    c = cfg()
    p = StatePaths(code)
    vm = months[-c["validation_months"]:]
    truth = pd.read_parquet(p.eval / "truth_monthly.parquet", columns=["facility_id", "period", *c["indicators"]])
    truth["analysis_month"] = truth["period"].str[:4] + "-" + truth["period"].str[4:]
    f = fac[fac["report_missing"] & fac["analysis_month"].isin(vm)].merge(truth, on=["facility_id", "analysis_month"], how="left")
    out = {"state_code": code, "months": [vm[0], vm[-1]], "interval": c["interval"], "facility": {}, "state_total": {}, "stock": {}}
    for ind in c["indicators"]:
        x = f[f[f"est_{ind}"].notna() & f[ind].notna()]
        t, e = x[ind], x[f"est_{ind}"]
        cover = ((t >= x[f"lo_{ind}"]) & (t <= x[f"hi_{ind}"])).mean() if len(x) else None
        nz = t > 0
        out["facility"][ind] = {
            "n": int(len(x)), "wape": float((e - t).abs().sum() / t.sum()) if t.sum() else None,
            "mape": float(((e - t).abs() / t)[nz].mean()) if nz.any() else None,
            "mdape": float(((e - t).abs() / t)[nz].median()) if nz.any() else None,
            "coverage": float(cover) if cover is not None else None, "bias": float(e.sum() / t.sum() - 1) if t.sum() else None,
            "n_missing_without_estimate": int((f[f"est_{ind}"].isna()).sum())}
        # State totals per month: hidden estimate vs truth for the PHCs that were estimated.
        tot = x.groupby("analysis_month").agg(est=(f"est_{ind}", "sum"), truth=(ind, "sum"), var=(f"var_{ind}", "sum"))
        z = _z()
        tot["lo"] = tot["est"] - z * np.sqrt(tot["var"])
        tot["hi"] = tot["est"] + z * np.sqrt(tot["var"])
        out["state_total"][ind] = {
            "months": int(len(tot)), "mape": float(((tot["est"] - tot["truth"]).abs() / tot["truth"]).mean()) if len(tot) else None,
            "coverage": float(((tot["truth"] >= tot["lo"]) & (tot["truth"] <= tot["hi"])).mean()) if len(tot) else None}
    # Implied stock labels vs true stock at month end.
    ts = pd.read_parquet(p.eval / "truth_stock.parquet", columns=["facility_id", "period", "commodity_code", "closing", "days_out"])
    ts["analysis_month"] = ts["period"].str[:4] + "-" + ts["period"].str[4:]
    for gname, codes in c["stock_groups"].items():
        k = gname.lower()
        tg = ts[ts["commodity_code"].isin(codes)].groupby(["facility_id", "analysis_month"]).agg(
            closing=("closing", "sum"), days_out=("days_out", "max")).reset_index()
        x = fac[fac["nhlmis_stale"] & fac["analysis_month"].isin(vm) & fac[f"{k}_label"].ne("unknown")].merge(
            tg, on=["facility_id", "analysis_month"], how="inner")
        out_ = (x["closing"] <= 0) | (x["days_out"] > 0)
        lab = x[f"{k}_label"]
        base = float(out_.mean()) if len(x) else None
        by = {l: {"n": int((lab == l).sum()), "out_rate": float(out_[lab == l].mean()) if (lab == l).any() else None}
              for l in ["elevated_risk", "watch", "no_signal"]}
        el = by["elevated_risk"]["out_rate"]
        out["stock"][gname] = {
            "n": int(len(x)), "truly_out": int(out_.sum()), "base_rate": base, "by_label": by,
            "lift_elevated": (el / base) if (el is not None and base) else None,
            "recall_elevated_or_watch": float(lab[out_].isin(["elevated_risk", "watch"]).mean()) if out_.any() else None,
            "interval_coverage": float(((x["closing"] >= x[f"{k}_implied_lo"]) &
                                        (x["closing"] <= x[f"{k}_implied_hi"])).mean()) if len(x) else None}
    return out


# ---- national ---------------------------------------------------------------------------------------------
def build_national() -> pd.DataFrame:
    z = _z()
    frames = []
    for st in states():
        f = StatePaths(st["code"]).root / "burden" / "mart_hidden_burden_state.parquet"
        if f.exists():
            frames.append(pd.read_parquet(f).assign(state=st["name"], zone=st["zone"]))
    if not frames:
        raise FileNotFoundError("no per-state burden marts; run `python -m sentinel burden` first")
    df = pd.concat(frames, ignore_index=True)
    df.to_parquet(NATIONAL_DIR / "mart_hidden_burden_state.parquet", index=False)
    sums = ["n_report_missing", "n_estimated", "hidden_malaria_cases", "hidden_malaria_var", "hidden_opd", "hidden_opd_var",
            "n_stale_stock", "n_stock_elevated", "n_stock_watch", "reported_malaria_cases"]

    def roll(keys):
        r = df.groupby(keys)[sums].sum().reset_index()
        for k, col in (("malaria", "hidden_malaria_cases"), ("opd", "hidden_opd")):
            sd = np.sqrt(r[f"hidden_{k}_var"])
            r[f"hidden_{k}_lo"] = (r[col] - z * sd).clip(lower=0).round(0)
            r[f"hidden_{k}_hi"] = (r[col] + z * sd).round(0)
        r["n_states"] = df.groupby(keys)["state_code"].nunique().values
        r["data_class"] = cfg()["data_class"]
        return r
    roll(["zone", "analysis_month"]).to_parquet(NATIONAL_DIR / "mart_hidden_burden_zone.parquet", index=False)
    nat = roll(["analysis_month"])
    nat.to_parquet(NATIONAL_DIR / "mart_hidden_burden_national.parquet", index=False)
    vals = {}
    for st in states():
        f = StatePaths(st["code"]).root / "burden" / "burden_validation.json"
        if f.exists():
            vals[st["code"]] = json.loads(f.read_text(encoding="utf-8"))
    (NATIONAL_DIR / "burden_validation.json").write_text(json.dumps(vals, indent=1), encoding="utf-8")
    last = nat.iloc[-1]
    print(f"Burden national: {last['analysis_month']} hidden malaria cases {last['hidden_malaria_cases']:,.0f} "
          f"({last['hidden_malaria_lo']:,.0f}-{last['hidden_malaria_hi']:,.0f}); {int(last['n_stock_elevated'])} PHCs at elevated risk of no ACT")
    return nat
