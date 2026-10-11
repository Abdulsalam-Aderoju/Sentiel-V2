"use client";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Logo } from "@/components/Logo";
import { ModelChip, RealChip, SimChip, StatusPill } from "@/components/Tags";
import { DOMAIN_LABEL, METRICS, STATUS_STYLE, TAG_STYLE, int, monthLabel, pct } from "@/lib/api";
import NationalMap from "./NationalMap";

const list = (xs: string[]) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);

/** Presentation-ready national view: large type, one message per slide, arrow keys to move. */
export default function Briefing({ summary, states, geo, initialSlide, actions, access, gaps }: {
  summary: any; states: any[]; geo: any; initialSlide: number; actions?: any; access?: any; gaps?: any;
}) {
  const k = summary.kpis;
  const month = summary.month;
  const [metric, setMetric] = useState("pct_act_now");
  const byAct = useMemo(() => [...states].sort((a, b) => b.pct_act_now - a.pct_act_now), [states]);
  const byVer = useMemo(() => [...states].sort((a, b) => b.pct_verification - a.pct_verification), [states]);
  const domain = ["malaria_commodity", "vaccine_cold_chain", "service_pressure"]
    .map((d) => ({ d, n: states.reduce((a, s) => a + s[`action_${d}`], 0) })).sort((a, b) => b.n - a.n)[0];
  const top3 = byAct.slice(0, 3).map((s) => s.state);
  const gap3 = byVer.slice(0, 3).map((s) => s.state);
  const m = METRICS.find((x) => x.key === metric)!;


  const extraSlides: { id: string; render: () => React.ReactNode }[] = [];
  if (actions) {
    const a = actions.kpis;
    const sts = [...actions.states].sort((x: any, y: any) => (y.pct_overdue ?? 0) - (x.pct_overdue ?? 0) || y.open_cases - x.open_cases);
    const ackPct = a.total_cases ? a.acknowledged / a.total_cases : 0;
    extraSlides.push({
      id: "acting", render: () => (
        <>
          <div className="kicker">Who is acting <SimChip text="Simulated action layer" /></div>
          <h1>{int(a.open_cases)} cases are open with a named owner; {pct(ackPct)} have been acknowledged and {int(a.overdue)} are overdue.</h1>
          <p className="lead">Every flagged PHC became a case with an owner, a playbook and a deadline. Unacknowledged cases climb the escalation ladder on their own; {int(a.escalated_to_state)} have reached a state officer and {int(a.escalated_to_national)} the national level.</p>
          <div className="brief-rank">
            {sts.map((s: any, i: number) => (
              <div className="r" key={s.state_code}>
                <span className="n">{i + 1}</span>
                <span className="name">{s.state}<small>{int(s.open_cases)} open · {int(s.acknowledged)} acknowledged · {int(s.escalated)} escalated · share overdue →</small></span>
                <span className="track"><i style={{ width: `${100 * (s.pct_overdue ?? 0)}%`, background: "var(--st-critical)" }} /></span>
                <span className="v">{pct(s.pct_overdue)}</span>
              </div>
            ))}
          </div>
        </>
      ),
    });
  }
  if (access) {
    const n = access.national;
    const sts = access.states;
    extraSlides.push({
      id: "access", render: () => (
        <>
          <div className="kicker">Where people travel furthest <RealChip /></div>
          <h1>{(n.pop_beyond_main / 1e6).toFixed(1)} million people live more than an hour&apos;s walk from a public PHC, most of them in {list(sts.slice(0, 3).map((s: any) => s.state))}.</h1>
          <p className="lead">In these places a stock-out cannot be absorbed by the next facility. {int(n.n_isolated)} PHCs are isolated: the next one is more than 60 minutes away on foot. Sentinel raises their priority.</p>
          <div className="brief-rank">
            {sts.map((s: any, i: number) => (
              <div className="r" key={s.state_code}>
                <span className="n">{i + 1}</span>
                <span className="name">{s.state}<small>{(s.pop_beyond_main / 1e6).toFixed(2)} M people · {int(s.n_isolated)} isolated PHCs</small></span>
                <span className="track"><i style={{ width: `${(100 * s.pct_beyond_main) / sts[0].pct_beyond_main}%`, background: "var(--seq-600)" }} /></span>
                <span className="v">{pct(s.pct_beyond_main, 1)}</span>
              </div>
            ))}
          </div>
          <p className="lead" style={{ fontSize: 15 }}>WorldPop 2026 population, Malaria Atlas Project walking friction, GRID3 facilities. Facilities outside the 12 demo states are not counted, so border areas may read high.</p>
        </>
      ),
    });
  }
  if (gaps?.national) {
    const g = gaps.national;
    const share = g.reported_malaria_cases ? g.hidden_malaria_cases / (g.reported_malaria_cases + g.hidden_malaria_cases) : null;
    const v = Object.values(gaps.validation ?? {}) as any[];
    const wape = v.length ? v.reduce((t, x) => t + x.facility_wape, 0) / v.length : null;
    const cov = v.length ? v.reduce((t, x) => t + x.facility_coverage, 0) / v.length : null;
    const sts = gaps.states;
    extraSlides.push({
      id: "gaps", render: () => (
        <>
          <div className="kicker">What the gaps hide <ModelChip /></div>
          <h1>About {int(Math.round(g.hidden_malaria_cases / 1000) * 1000)} malaria cases this month sit behind {int(g.n_report_missing)} missing reports{share != null ? `, roughly ${pct(share)} of the estimated total` : ""}.</h1>
          <p className="lead">Estimated from each silent PHC&apos;s own history (80% range {int(g.hidden_malaria_lo)}–{int(g.hidden_malaria_hi)}). Checked against the simulation&apos;s truth, facility estimates were within {pct(wape)} on average and the range held {pct(cov)} of the time.</p>
          <div className="brief-rank">
            {sts.map((s: any, i: number) => (
              <div className="r" key={s.state_code}>
                <span className="n">{i + 1}</span>
                <span className="name">{s.state}<small>{int(s.n_report_missing)} PHCs silent · {int(s.n_stock_elevated)} stale stock reports at elevated risk</small></span>
                <span className="track"><i style={{ width: `${(100 * s.hidden_malaria_cases) / sts[0].hidden_malaria_cases}%`, background: "var(--series-2)" }} /></span>
                <span className="v">≈ {int(s.hidden_malaria_cases)}</span>
              </div>
            ))}
          </div>
        </>
      ),
    });
  }

  const slides = [
    {
      id: "headline", render: () => (
        <>
          <div className="kicker">National briefing · {monthLabel(month, true)}</div>
          <h1>{int(k.act_now + k.verify_then_act)} primary health care facilities need resupply or repair; {int(k.verification)} more look calm on evidence too weak to trust.</h1>
          <div className="big-kpis">
            <div className="big-kpi" style={{ ["--kpi-accent" as any]: "var(--brand)" }}><div className="label">PHCs assessed</div><div className="value">{int(k.facilities)}</div><div className="sub">{k.states} states · all 6 zones</div></div>
            <div className="big-kpi" style={{ ["--kpi-accent" as any]: TAG_STYLE["ACT NOW"].color }}><div className="label"><span style={{ color: TAG_STYLE["ACT NOW"].color }}>▲</span>Act now</div><div className="value">{int(k.act_now)}</div><div className="sub">credible warning, current evidence</div></div>
            <div className="big-kpi" style={{ ["--kpi-accent" as any]: TAG_STYLE["VERIFY THEN ACT"].color }}><div className="label"><span style={{ color: TAG_STYLE["VERIFY THEN ACT"].color }}>◆</span>Verify then act</div><div className="value">{int(k.verify_then_act)}</div><div className="sub">warning on weak or stale evidence</div></div>
            <div className="big-kpi" style={{ ["--kpi-accent" as any]: TAG_STYLE["DO NOT ASSUME SAFE"].color }}><div className="label"><span style={{ color: TAG_STYLE["DO NOT ASSUME SAFE"].color }}>?</span>Do not assume safe</div><div className="value">{int(k.verification)}</div><div className="sub">{pct(k.reporting_completeness)} of monthly reports received</div></div>
          </div>
          <div className="status-board" aria-label="States by status">
            {Object.entries(STATUS_STYLE).map(([key, st]) => {
              const xs = states.filter((s) => s.status === key);
              return (
                <div className="col" key={key} style={{ borderTop: `4px solid ${st.color}` }}>
                  <h3><span aria-hidden style={{ color: st.color }}>{st.icon}</span>{st.label}<small>{xs.length} state{xs.length === 1 ? "" : "s"}</small></h3>
                  <p>{st.long}.</p>
                  <ul>{xs.length ? xs.map((s) => <li key={s.state_code}>{s.state}</li>) : <li className="none">None this month</li>}</ul>
                </div>
              );
            })}
          </div>
        </>
      ),
    },
    {
      id: "map", render: () => (
        <>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 16, flexWrap: "wrap" }}>
            <div><div className="kicker">The national picture</div><h1>{m.label} by state</h1></div>
            <div className="seg" role="group" aria-label="Map metric">
              {METRICS.map((x) => <button key={x.key} aria-pressed={metric === x.key} onClick={() => setMetric(x.key)} style={{ fontSize: 15, padding: "8px 14px" }}>{x.label}</button>)}
            </div>
          </div>
          <div className="card" style={{ padding: 12 }}><NationalMap geo={geo} states={states} metric={metric} height={600} /></div>
        </>
      ),
    },
    {
      id: "act", render: () => (
        <>
          <div className="kicker">Where to act</div>
          <h1>{list(top3)} have the highest share of PHCs needing action now.</h1>
          <p className="lead">{DOMAIN_LABEL[domain.d]} drive most resource action nationally ({int(domain.n)} of {int(k.action)} PHCs).</p>
          <div className="brief-rank">
            {byAct.map((s, i) => (
              <div className="r" key={s.state_code}>
                <span className="n">{i + 1}</span>
                <span className="name">{s.state}<small>{s.zone} · {int(s.act_now)} of {int(s.facilities)} PHCs</small></span>
                <span className="track"><i style={{ width: `${(100 * s.pct_act_now) / byAct[0].pct_act_now}%`, background: TAG_STYLE["ACT NOW"].color }} /></span>
                <span className="v">{pct(s.pct_act_now, 1)}</span>
              </div>
            ))}
          </div>
        </>
      ),
    },
    {
      id: "verify", render: () => (
        <>
          <div className="kicker">Where the evidence is weakest</div>
          <h1>In {list(gap3)}, the largest share of PHCs cannot be called safe.</h1>
          <p className="lead">These facilities show no credible warning, but their reports are missing, late, stale or incoherent. Sentinel routes them to verification instead of showing them green.</p>
          <div className="brief-rank">
            {byVer.map((s, i) => (
              <div className="r" key={s.state_code}>
                <span className="n">{i + 1}</span>
                <span className="name">{s.state}<small>reporting {pct(s.reporting_completeness)} · stale stock {pct(s.pct_stale)}</small></span>
                <span className="track"><i style={{ width: `${(100 * s.pct_verification) / byVer[0].pct_verification}%`, background: TAG_STYLE["DO NOT ASSUME SAFE"].color }} /></span>
                <span className="v">{pct(s.pct_verification, 1)}</span>
              </div>
            ))}
          </div>
        </>
      ),
    },
    {
      id: "zones", render: () => (
        <>
          <div className="kicker">Zones compared</div>
          <h1>Six geopolitical zones, side by side</h1>
          <div className="card" style={{ padding: 0, overflowX: "auto" }}>
            <table className="data">
              <thead><tr><th>Zone</th><th className="n">PHCs</th><th className="n">Act now</th><th className="n">Verify then act</th><th className="n">Do not assume safe</th><th className="n">Reporting</th><th>Status</th></tr></thead>
              <tbody>
                {summary.zones.map((z: any) => (
                  <tr key={z.zone}>
                    <td><strong>{z.zone}</strong><div className="muted" style={{ fontSize: 14 }}>{states.filter((s) => s.zone === z.zone).map((s) => s.state).join(", ")}</div></td>
                    <td className="n">{int(z.facilities)}</td><td className="n">{int(z.act_now)}</td><td className="n">{int(z.verify_then_act)}</td>
                    <td className="n">{int(z.verification)}</td><td className="n">{pct(z.reporting_completeness)}</td><td><StatusPill status={z.status} size="lg" /></td>
                  </tr>
                ))}
                <tr className="total"><td>All covered states</td><td className="n">{int(k.facilities)}</td><td className="n">{int(k.act_now)}</td><td className="n">{int(k.verify_then_act)}</td><td className="n">{int(k.verification)}</td><td className="n">{pct(k.reporting_completeness)}</td><td><StatusPill status={k.status} size="lg" /></td></tr>
              </tbody>
            </table>
          </div>
        </>
      ),
    },
    ...extraSlides,
    {
      id: "ask", render: () => (
        <>
          <div className="kicker">What this means</div>
          <div className="message">Low observed risk with low confidence is not safe.</div>
          <div className="big-kpis" style={{ gridTemplateColumns: "repeat(3, minmax(0, 1fr))" }}>
            <div className="big-kpi" style={{ ["--kpi-accent" as any]: TAG_STYLE["ACT NOW"].color }}><div className="label">Act</div><div className="sub" style={{ fontSize: 20, color: "var(--text-primary)" }}>Prioritise resupply and cold-chain repair for {int(k.act_now)} PHCs, led by {list(top3)}.</div></div>
            <div className="big-kpi" style={{ ["--kpi-accent" as any]: TAG_STYLE["VERIFY THEN ACT"].color }}><div className="label">Verify, then act</div><div className="sub" style={{ fontSize: 20, color: "var(--text-primary)" }}>Confirm stock within days for {int(k.verify_then_act)} PHCs before moving supplies, and prepare the response in parallel.</div></div>
            <div className="big-kpi" style={{ ["--kpi-accent" as any]: TAG_STYLE["DO NOT ASSUME SAFE"].color }}><div className="label">Recover the evidence</div><div className="sub" style={{ fontSize: 20, color: "var(--text-primary)" }}>Follow up missing and stale reports for {int(k.verification)} PHCs; {int(k.stale_commodity)} have an overdue NHLMIS stock report.</div></div>
          </div>
          <p className="lead" style={{ fontSize: 16 }}>Facility lists are real (GRID3 v3.0); operational figures are simulated to demonstrate the method. A pilot would run on a state&apos;s own DHIS2 and NHLMIS exports with no new reporting burden.</p>
        </>
      ),
    },
  ];

  const [i, setI] = useState(Math.min(Math.max(initialSlide, 0), slides.length - 1));
  const go = useCallback((n: number) => setI((c) => Math.min(Math.max(c + n, 0), slides.length - 1)), [slides.length]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest("input,select,textarea")) return;
      if (["ArrowRight", "PageDown", " "].includes(e.key)) { e.preventDefault(); go(1); }
      if (["ArrowLeft", "PageUp"].includes(e.key)) { e.preventDefault(); go(-1); }
      if (e.key === "Home") setI(0);
      if (e.key === "End") setI(slides.length - 1);
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [go, slides.length]);
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    p.set("slide", String(i + 1));
    window.history.replaceState(null, "", `${window.location.pathname}?${p}`);
  }, [i]);

  return (
    <div className="briefing">
      <div className="bar">
        <div className="title"><Logo /><span>National briefing · {monthLabel(month, true)}</span><SimChip text="All operational data simulated" /></div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn" onClick={() => window.print()}>Print</button>
          <Link className="btn" href={`/national?month=${month}`}>Exit briefing</Link>
        </div>
      </div>
      <section className="slide" aria-live="polite" aria-label={`Slide ${i + 1} of ${slides.length}`}>{slides[i].render()}</section>
      <div className="controls">
        <button className="btn" onClick={() => go(-1)} disabled={i === 0} aria-label="Previous slide">← Previous</button>
        <div className="dots">
          {slides.map((s, n) => <button key={s.id} aria-label={`Slide ${n + 1}`} aria-current={n === i} onClick={() => setI(n)} />)}
        </div>
        <span className="muted num" style={{ minWidth: 48, textAlign: "center" }}>{i + 1} / {slides.length}</span>
        <button className="btn primary" onClick={() => go(1)} disabled={i === slides.length - 1} aria-label="Next slide">Next →</button>
      </div>
    </div>
  );
}
