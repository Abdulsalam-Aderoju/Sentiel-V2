import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { QueueTrend } from "@/components/Charts";
import LgaMap from "@/components/LgaMap";
import MonthPicker from "@/components/MonthPicker";
import StateTabs from "@/components/StateTabs";
import { QueueTag, SimChip, StatusPill } from "@/components/Tags";
import { DOMAIN_LABEL, TAG_STYLE, api, apiOrNull, facilityHref, int, lgaHref, monthLabel, pct } from "@/lib/api";

type P = { params: Promise<{ code: string }>; searchParams: Promise<{ month?: string }> };

export async function generateMetadata({ params }: P): Promise<Metadata> {
  const { code } = await params;
  const meta = await api("/meta/states");
  const st = meta.states.find((s: any) => s.code === code);
  return { title: st ? `${st.name} state overview` : "State not found" };
}

/** State overview: one template for every state; everything comes from the state code. */
export default async function StateOverview({ params, searchParams }: P) {
  const { code } = await params;
  const { month: m } = await searchParams;
  const meta = await api("/meta/months");
  const month = m ?? meta.latest;
  const s = await apiOrNull(`/state/${code}/summary`, month);
  if (!s) notFound();
  const [top, lgaGeo, facGeo] = await Promise.all([
    api(`/state/${code}/top`, month), api(`/state/${code}/geo/lgas`, month), api(`/state/${code}/geo/facilities`, month),
  ]);
  const k = s.kpis;
  const st = s.state;
  const cell = (risk: string, conf: string) => s.matrix.find((x: any) => x.risk === risk && x.confidence === conf)?.n ?? 0;
  const prev = s.trend[s.trend.findIndex((t: any) => t.analysis_month === month) - 1];
  const delta = (now: number, p?: number) => {
    if (p == null) return null;
    const d = now - p;
    return d === 0 ? <span className="delta muted">no change</span>
      : <span className="delta" style={{ color: d > 0 ? "var(--st-critical)" : "var(--st-good)" }}>{d > 0 ? "▲" : "▼"} {Math.abs(d)} vs last month</span>;
  };

  return (
    <>
      <div className="page-head">
        <div>
          <div className="crumbs">
            <Link href={`/national?month=${month}`}>National</Link><span className="sep">/</span>
            <span>{st.name} State</span><span className="sep">·</span><span>{st.zone}</span>
          </div>
          <h1>{st.name}: where to act, where to verify</h1>
          <div className="secondary" style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            {int(k.facilities)} public PHCs across {s.lgas.length} LGAs · {monthLabel(month)} analysis (as of 30 days after month end)
            <StatusPill status={k.status} /> <SimChip />
          </div>
        </div>
        <div className="actions">
          <MonthPicker months={meta.months} value={month} />
          <Link className="btn" href={`/national?month=${month}&state=${code}`}>State brief</Link>
        </div>
      </div>

      <StateTabs code={code} active="" month={month} />

      <div className="grid g-kpi" style={{ marginBottom: 16 }}>
        <div className="card kpi accent" style={{ ["--kpi-accent" as any]: TAG_STYLE["ACT NOW"].color }}>
          <div className="label">Resource action</div>
          <div className="value num">{int(k.action)}</div>
          <div className="sub">{k.act_now} act now · {k.verify_then_act} verify then act{delta(k.action, prev?.action)}</div>
        </div>
        <div className="card kpi accent" style={{ ["--kpi-accent" as any]: TAG_STYLE["DO NOT ASSUME SAFE"].color }}>
          <div className="label">Data verification</div>
          <div className="value num">{int(k.verification)}</div>
          <div className="sub">low risk on evidence too weak to trust{delta(k.verification, prev?.verification)}</div>
        </div>
        <div className="card kpi accent" style={{ ["--kpi-accent" as any]: "var(--series-1)" }}>
          <div className="label">Monthly reporting completeness</div>
          <div className="value num">{pct(k.reporting_completeness)}</div>
          <div className="sub">{pct(k.on_time_rate)} on time · {k.silent} silent PHCs</div>
        </div>
        <div className="card kpi accent" style={{ ["--kpi-accent" as any]: "var(--series-1)" }}>
          <div className="label">Stale commodity reports</div>
          <div className="value num">{int(k.stale_commodity_reports)}</div>
          <div className="sub">NHLMIS report overdue or absent</div>
        </div>
      </div>

      <div className="grid g-2" style={{ marginBottom: 16 }}>
        <div className="card">
          <div className="card-head"><div><h2>LGAs ranked by action and verification need</h2><p>Click an LGA to open its queues</p></div></div>
          <div style={{ overflowX: "auto" }}>
            <table className="data">
              <thead>
                <tr>
                  <th>#</th><th>LGA</th><th className="n">PHCs</th><th className="n">Act now</th><th className="n">Verify then act</th>
                  <th className="n">Verification</th><th className="n">Silent</th><th className="n">Stale LMIS</th><th className="n">Reporting</th>
                </tr>
              </thead>
              <tbody>
                {s.lgas.map((l: any) => (
                  <tr key={l.lga_id}>
                    <td className="muted num">{l.lga_rank}</td>
                    <td><Link href={lgaHref(code, l.lga_id, month)}>{l.lga}</Link></td>
                    <td className="n">{l.facilities}</td>
                    <td className="n">{l.act_now}</td>
                    <td className="n">{l.verify_then_act}</td>
                    <td className="n">{l.verification}</td>
                    <td className="n">{l.silent}</td>
                    <td className="n">{l.stale_commodity}</td>
                    <td className="n">{pct(l.reporting_completeness)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div className="stack">
          <div className="card">
            <h2>Risk × confidence</h2>
            <div className="matrix">
              <div />
              <div className="h">High / moderate confidence</div>
              <div className="h">Low confidence</div>
              <div className="h">High / critical risk</div>
              <div className="cell"><div className="big num">{cell("HIGH_OR_CRITICAL", "HIGH_OR_MODERATE")}</div><QueueTag tag="ACT NOW" /></div>
              <div className="cell"><div className="big num">{cell("HIGH_OR_CRITICAL", "LOW")}</div><QueueTag tag="VERIFY THEN ACT" /></div>
              <div className="h">Normal / watch risk</div>
              <div className="cell"><div className="big num">{cell("NORMAL_OR_WATCH", "HIGH_OR_MODERATE")}</div><QueueTag tag="MONITOR" /></div>
              <div className="cell"><div className="big num">{cell("NORMAL_OR_WATCH", "LOW")}</div><QueueTag tag="DO NOT ASSUME SAFE" /></div>
            </div>
            <p className="note">Low observed risk with low confidence is not safe: those PHCs go to verification, never to green.</p>
          </div>
          <div className="card">
            <h2>What drives resource action</h2>
            <table className="data">
              <tbody>
                {[...s.action_by_domain].sort((a: any, b: any) => b.n - a.n).map((d: any) => (
                  <tr key={d.top_domain}><td>{DOMAIN_LABEL[d.top_domain] ?? d.top_domain}</td><td className="n">{d.n}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="grid g-half" style={{ marginBottom: 16 }}>
        <div className="card">
          <div className="card-head"><div><h2>Map</h2><p>LGAs shaded by PHCs needing attention; dots are facilities by queue</p></div></div>
          <LgaMap lgas={lgaGeo} facilities={facGeo} month={month} stateCode={code} unmapped={k.location_unverified} />
        </div>
        <div className="card">
          <h2>Queue sizes over time</h2>
          <QueueTrend data={s.trend} />
          <p className="note">Action follows the malaria season. Verification tracks missing and overdue reports.</p>
        </div>
      </div>

      <div className="grid g-half">
        {([["Top of the state action queue", top.action], ["Top of the state verification queue", top.verification]] as const).map(([title, rows]) => (
          <div className="card" key={title}>
            <h2>{title}</h2>
            {rows.length === 0 ? <div className="empty">Queue empty this month.</div> : (
              <table className="data">
                <tbody>
                  {rows.map((r: any) => (
                    <tr key={r.facility_id}>
                      <td className="muted num">{r.rank_state}</td>
                      <td>
                        <Link href={facilityHref(code, r.facility_id, month)}>{r.name}</Link>
                        <div className="muted" style={{ fontSize: 12 }}>{r.lga} · {r.evidence_summary}</div>
                      </td>
                      <td><QueueTag tag={r.tag} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        ))}
      </div>
    </>
  );
}
