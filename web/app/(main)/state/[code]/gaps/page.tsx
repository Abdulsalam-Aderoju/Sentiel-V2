import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { HiddenTrend } from "@/components/Charts";
import MonthPicker from "@/components/MonthPicker";
import StateTabs from "@/components/StateTabs";
import { ModelChip, QueueTag, SimChip } from "@/components/Tags";
import { api, apiOrNull, int, monthLabel, pct } from "@/lib/api";

type P = { params: Promise<{ code: string }>; searchParams: Promise<{ month?: string }> };

export async function generateMetadata({ params }: P): Promise<Metadata> {
  const { code } = await params;
  const meta = await api("/meta/states");
  const st = meta.states.find((s: any) => s.code === code);
  return { title: st ? `${st.name}: behind the gaps` : "State not found" };
}

const RISK: Record<string, { label: string; icon: string; color: string }> = {
  elevated_risk: { label: "Elevated risk", icon: "▲", color: "var(--st-critical)" },
  watch: { label: "Watch", icon: "●", color: "var(--st-warning)" },
  no_signal: { label: "No signal", icon: "○", color: "var(--text-muted)" },
};

function RiskLabel({ l }: { l: string }) {
  const r = RISK[l] ?? { label: l, icon: "•", color: "var(--text-muted)" };
  return <span className="risk-label"><span className="ico" aria-hidden style={{ color: r.color }}>{r.icon}</span>{r.label}</span>;
}

const range = (lo: number | null, hi: number | null) => (lo == null ? "" : `${int(lo)}–${int(hi)}`);
const dmy = (d: string | null) => (d ? new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "n/a");

/** Behind the gaps: what missing and stale reports hide. Modelled, with intervals and validation, for every state. */
export default async function GapsPage({ params, searchParams }: P) {
  const { code } = await params;
  const { month: m } = await searchParams;
  const meta = await api("/meta/months");
  const month = m ?? meta.latest;
  const d = await apiOrNull(`/state/${code}/gaps`, month);
  if (!d) {
    const st = await api("/meta/states");
    if (!st.states.find((s: any) => s.code === code)) notFound();
    return (
      <>
        <div className="page-head"><div><h1>Behind the gaps</h1></div></div>
        <StateTabs code={code} active="gaps" month={month} />
        <div className="card empty">Hidden-burden figures are not loaded. Run <code>python -m sentinel burden</code>.</div>
      </>
    );
  }
  const s = d.summary;
  const v = d.validation;
  const fv = v?.facility?.confirmed_malaria;
  const sv = v?.state_total?.confirmed_malaria;
  const stk = v?.stock?.ACT;
  const share = s.reported_malaria_cases != null && s.hidden_malaria_cases != null
    ? s.hidden_malaria_cases / (s.reported_malaria_cases + s.hidden_malaria_cases) : null;
  const iv = pct(d.interval);

  return (
    <>
      <div className="page-head">
        <div>
          <div className="crumbs">
            <Link href={`/national?month=${month}`}>National</Link><span className="sep">/</span>
            <Link href={`/state/${code}?month=${month}`}>{d.state.name} State</Link><span className="sep">/</span><span>Behind the gaps</span>
          </div>
          <h1>{d.state.name}: what the gaps hide</h1>
          <div className="secondary" style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            Cases at PHCs that did not report, and stock where NHLMIS is out of date · {monthLabel(month)} <ModelChip /> <SimChip />
          </div>
        </div>
        <MonthPicker months={meta.months} value={month} />
      </div>

      <StateTabs code={code} active="gaps" month={month} />

      <div className="grid g-kpi" style={{ marginBottom: 16 }}>
        <div className="card kpi accent" style={{ ["--kpi-accent" as any]: "var(--series-2)" }}>
          <div className="label">Malaria cases behind missing reports</div>
          <div className="value num">≈ {int(s.hidden_malaria_cases)}</div>
          <div className="sub">{iv} range {range(s.hidden_malaria_lo, s.hidden_malaria_hi)}{share != null ? ` · ${pct(share)} of the month's estimated total` : ""}</div>
        </div>
        <div className="card kpi accent" style={{ ["--kpi-accent" as any]: "var(--st-warning)" }}>
          <div className="label">PHCs with no monthly report</div>
          <div className="value num">{int(s.n_report_missing)}</div>
          <div className="sub">{int(s.n_estimated)} with enough history to estimate · ≈ {int(s.hidden_opd)} outpatient visits</div>
        </div>
        <div className="card kpi accent" style={{ ["--kpi-accent" as any]: "var(--st-critical)" }}>
          <div className="label">Stale stock reports at elevated risk</div>
          <div className="value num">{int(s.n_stock_elevated)}</div>
          <div className="sub">of {int(s.n_stale_stock)} PHCs with an out-of-date NHLMIS report · {int(s.n_stock_watch)} more on watch</div>
        </div>
        <div className="card kpi accent" style={{ ["--kpi-accent" as any]: "var(--series-1)" }}>
          <div className="label">How close the estimates were</div>
          <div className="value num">{fv ? pct(1 - fv.wape) : "n/a"}</div>
          <div className="sub">{fv ? `facility estimates within ${pct(fv.wape)} on average; truth inside the range ${pct(fv.coverage)} of the time` : "not validated"}</div>
        </div>
      </div>

      <div className="grid g-2" style={{ marginBottom: 16 }}>
        <div className="card">
          <div className="card-head"><div><h2>Reported and hidden malaria cases</h2><p>Hatched = estimated for PHCs that did not report. Hover a month for the range.</p></div></div>
          <HiddenTrend data={d.trend} />
          <details style={{ marginTop: 8 }}><summary>Table view</summary>
            <table className="data"><thead><tr><th>Month</th><th className="n">Reported</th><th className="n">Hidden (est.)</th><th className="n">{iv} range</th><th className="n">PHCs missing</th></tr></thead>
              <tbody>{[...d.trend].reverse().slice(0, 24).map((t: any) => (
                <tr key={t.analysis_month}><td>{monthLabel(t.analysis_month)}</td><td className="n">{int(t.reported_malaria_cases)}</td><td className="n">{int(t.hidden_malaria_cases)}</td>
                  <td className="n range">{range(t.hidden_malaria_lo, t.hidden_malaria_hi)}</td><td className="n">{int(t.n_report_missing)}</td></tr>
              ))}</tbody></table>
          </details>
        </div>
        <div className="card">
          <div className="card-head"><div><h2>LGAs by hidden cases</h2><p>{monthLabel(month)} · where silence hides the most</p></div></div>
          <div className="table-scroll">
            <table className="data">
              <thead><tr><th>LGA</th><th className="n">PHCs missing</th><th className="n">Hidden cases</th><th className="n">Stock at risk</th></tr></thead>
              <tbody>{d.lgas.slice(0, 14).map((l: any) => (
                <tr key={l.lga_id}>
                  <td><Link href={`/state/${code}/lga/${l.lga_id}?month=${month}`}>{l.lga}</Link></td>
                  <td className="n">{int(l.n_report_missing)}</td>
                  <td className="n">≈ {int(l.hidden_malaria_cases)}<div className="range">{range(l.hidden_malaria_lo, l.hidden_malaria_hi)}</div></td>
                  <td className="n">{int(l.n_stock_elevated)}{l.n_stock_watch ? <span className="muted"> +{l.n_stock_watch} watch</span> : null}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-head"><div><h2>Silent PHCs carrying the most cases</h2><p>Expected confirmed malaria this month from each PHC's own seasonal history, scaled by how this month ran at PHCs that did report</p></div></div>
        <div className="table-scroll">
          <table className="data">
            <thead><tr><th>PHC</th><th>LGA</th><th className="n">Expected cases</th><th className="n">{iv} range</th><th className="n">Months silent</th><th>Live status</th></tr></thead>
            <tbody>{d.missing_facilities.map((f: any) => (
              <tr key={f.facility_id}>
                <td><Link href={`/state/${code}/facility/${f.facility_id}?month=${month}`}>{f.name}</Link>{f.reliable_history && <small className="muted"> · usually reports</small>}</td>
                <td className="muted">{f.lga}</td>
                <td className="n">≈ {int(f.est_confirmed_malaria)}</td>
                <td className="n range">{range(f.lo_confirmed_malaria, f.hi_confirmed_malaria)}</td>
                <td className="n">{f.consecutive_missing ?? "n/a"}</td>
                <td>{f.live_tag ? <QueueTag tag={f.live_tag} /> : <span className="muted">n/a</span>}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-head"><div><h2>Out-of-date stock reports most likely to hide a stock-out</h2>
          <p>Last NHLMIS stock plus typical deliveries minus typical use since then. Deliveries since the last report are unknown, so this ranks where to check first; it is not proof of a stock-out.</p></div></div>
        <div className="table-scroll">
          <table className="data">
            <thead><tr><th>PHC</th><th>LGA</th><th className="n">Last ACT stock</th><th>Reported to</th><th className="n">Implied now</th><th className="n">Chance of none</th><th>Signal</th><th>Live status</th></tr></thead>
            <tbody>{d.stock_risk_facilities.map((f: any) => (
              <tr key={f.facility_id}>
                <td><Link href={`/state/${code}/facility/${f.facility_id}?month=${month}`}>{f.name}</Link></td>
                <td className="muted">{f.lga}</td>
                <td className="n">{int(f.act_last_stock)}<div className="range">AMC {int(f.act_amc)}</div></td>
                <td>{dmy(f.act_last_period_end)}<div className="range">{f.act_months_since?.toFixed(1)} months ago</div></td>
                <td className="n">{range(f.act_implied_lo, f.act_implied_hi)}</td>
                <td className="n">{pct(f.act_p_out)}</td>
                <td><RiskLabel l={f.act_label} /></td>
                <td>{f.live_tag ? <QueueTag tag={f.live_tag} /> : <span className="muted">n/a</span>}</td>
              </tr>
            ))}</tbody>
          </table>
          {d.stock_risk_facilities.length === 0 && <div className="empty">No out-of-date stock report shows an elevated or watch signal this month.</div>}
        </div>
      </div>

      {v && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-head"><div><h2>How good are these estimates?</h2><p>Scored against the simulator's truth for {monthLabel(v.months[0])} to {monthLabel(v.months[1])}. Truth is used only to score, never to estimate.</p></div></div>
          <div className="val-grid">
            <div><span>Facility estimate error</span><b>{pct(fv.wape)}</b><small>weighted absolute error over {int(fv.n)} PHC-months; median {pct(fv.mdape)}</small></div>
            <div><span>Truth inside the {iv} range</span><b>{pct(fv.coverage)}</b><small>target {iv}; bias {fv.bias >= 0 ? "+" : ""}{pct(fv.bias, 1)}</small></div>
            <div><span>State total error</span><b>{pct(sv.mape, 1)}</b><small>monthly hidden total; range held {pct(sv.coverage)} of {sv.months} months</small></div>
            <div><span>Stock signal</span><b>{stk.lift_elevated ? `${stk.lift_elevated.toFixed(1)}×` : "n/a"}</b>
              <small>PHCs flagged Elevated ran out {pct(stk.by_label.elevated_risk.out_rate)} of the time vs {pct(stk.base_rate)} overall; flags catch {pct(stk.recall_elevated_or_watch)} of stock-outs</small></div>
          </div>
          <p className="note">The stock signal is useful for ordering checks, not for concluding that a PHC is out of stock: most PHCs flagged Elevated still had stock. A field count (Action Centre) settles it.</p>
        </div>
      )}

      <div className="card method">
        <h2>How this is calculated</h2>
        <ul className="evidence">
          <li>Expected cases: the PHC's rolling median of previous reported months, seasonally adjusted with the state calendar-month index (the same baseline the service-pressure check uses).</li>
          <li>Each estimate is scaled by this month's ratio of actual to expected cases at PHCs that did report, so a stronger season or a surge carries through.</li>
          <li>The {iv} range comes from how far reporting PHCs landed from their own expectation over the last 12 months. State totals combine facility ranges.</li>
          <li>PHCs with fewer than 6 reported months in the window get no estimate and are not counted.</li>
          <li>Implied stock is last reported physical stock plus the average NHLMIS net flow (received minus consumed) for the elapsed periods; its spread grows with time since the report.</li>
        </ul>
        <p className="note">{d.note}</p>
      </div>
    </>
  );
}
