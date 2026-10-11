import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import AccessMap from "@/components/access/AccessMap";
import StateTabs from "@/components/StateTabs";
import { QueueTag, RealChip } from "@/components/Tags";
import { api, apiOrNull, int, pct } from "@/lib/api";

type P = { params: Promise<{ code: string }> };

export async function generateMetadata({ params }: P): Promise<Metadata> {
  const { code } = await params;
  const meta = await api("/meta/states");
  const st = meta.states.find((s: any) => s.code === code);
  return { title: st ? `${st.name}: access to care` : "State not found" };
}


const mins = (x: number | null | undefined) => (x == null ? "n/a" : `${Math.round(x)} min`);
const ppl = (x: number | null | undefined) =>
  x == null ? "n/a" : x >= 1e6 ? `${(x / 1e6).toFixed(2)} M` : x >= 1e4 ? `${Math.round(x / 1e3)}k` : int(x);

/** Access tab: where people travel furthest to reach a PHC. Real-derived, the same template for every state. */
export default async function AccessPage({ params }: P) {
  const { code } = await params;
  const d = await apiOrNull(`/state/${code}/access`);
  if (!d) {
    const meta = await api("/meta/states");
    if (!meta.states.find((s: any) => s.code === code)) notFound();
    return (
      <>
        <div className="page-head"><div><h1>Access to care</h1></div></div>
        <StateTabs code={code} active="access" />
        <div className="card empty">Access figures are not loaded. Run <code>python -m sentinel fetch-access</code> then <code>python -m sentinel access</code>.</div>
      </>
    );
  }
  const s = d.summary;
  const th = d.settings.main_threshold_minutes;
  const maxLga = Math.max(...d.lgas.map((l: any) => l.pop_beyond_main ?? 0), 1);

  return (
    <>
      <div className="page-head">
        <div>
          <div className="crumbs">
            <Link href={`/state/${code}`}>{d.state.name} State</Link><span className="sep">/</span><span>Access</span>
          </div>
          <h1>{d.state.name}: where people travel furthest</h1>
          <div className="secondary" style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            Walking time to the nearest public PHC, 1 km cells, {d.state.zone} <RealChip />
          </div>
        </div>
      </div>

      <StateTabs code={code} active="access" />

      <div className="grid g-kpi" style={{ marginBottom: 16 }}>
        <div className="card kpi accent" style={{ ["--kpi-accent" as any]: "var(--seq-600)" }}>
          <div className="label">People beyond a {th}-min walk</div>
          <div className="value num">{ppl(s.pop_beyond_main)}</div>
          <div className="sub">{pct(s.pct_beyond_main, 1)} of {ppl(s.pop_total)} people · {pct(s.pct_beyond_120min_walk, 1)} beyond 2 hours</div>
        </div>
        <div className="card kpi accent" style={{ ["--kpi-accent" as any]: "var(--seq-400)" }}>
          <div className="label">Average walk to a PHC</div>
          <div className="value num">{mins(s.walk_mean_min)}</div>
          <div className="sub">median {mins(s.walk_median_min)} · {mins(s.motor_mean_min)} by motor vehicle</div>
        </div>
        <div className="card kpi accent" style={{ ["--kpi-accent" as any]: "var(--series-2)" }}>
          <div className="label">Isolated PHCs</div>
          <div className="value num">{int(s.n_isolated)}</div>
          <div className="sub">next PHC more than {th} min walk away, of {int(s.n_facilities_computed)} mapped</div>
        </div>
        <div className="card kpi accent" style={{ ["--kpi-accent" as any]: "var(--series-1)" }}>
          <div className="label">Nearest PHC is in another state</div>
          <div className="value num">{ppl(s.pop_nearest_out_of_state_facility)}</div>
          <div className="sub">people, among the 12 demo states; {int(s.n_facilities_location_unverified)} PHCs with unverified locations excluded</div>
        </div>
      </div>

      <div className="grid g-2" style={{ marginBottom: 16 }}>
        <div className="card">
          <div className="card-head"><div><h2>Map</h2><p>Click an isolated PHC to open it. Hover a ward for its figures.</p></div></div>
          <AccessMap code={code} threshold={th} isolated={d.isolated_facilities} candidates={d.candidates} raster={d.travel_time_layer} />
        </div>
        <div className="card">
          <div className="card-head"><div><h2>LGAs by people beyond {th} min</h2><p>Count first, then share: a large LGA can hide many people at a low rate</p></div></div>
          <ol className="rank-list acc-rank">
            {d.lgas.slice(0, 12).map((l: any) => (
              <li key={l.lga_id}>
                <Link href={`/state/${code}/lga/${l.lga_id}`} className="name">{l.lga}<small>{pct(l.pct_beyond_main, 1)} of {ppl(l.pop_total)} · mean walk {mins(l.walk_mean_min)}</small></Link>
                <span className="bar" aria-hidden><i style={{ width: `${(100 * (l.pop_beyond_main ?? 0)) / maxLga}%` }} /></span>
                <span className="v num">{ppl(l.pop_beyond_main)}</span>
              </li>
            ))}
          </ol>
          {d.lgas.length > 12 && (
            <details style={{ marginTop: 8 }}><summary>All {d.lgas.length} LGAs</summary>
              <table className="data"><thead><tr><th>LGA</th><th className="n">People</th><th className="n">Beyond {th} min</th><th className="n">Share</th><th className="n">Mean walk</th></tr></thead>
                <tbody>{d.lgas.map((l: any) => <tr key={l.lga_id}><td>{l.lga}</td><td className="n">{int(l.pop_total)}</td><td className="n">{int(l.pop_beyond_main)}</td><td className="n">{pct(l.pct_beyond_main, 1)}</td><td className="n">{mins(l.walk_mean_min)}</td></tr>)}</tbody>
              </table>
            </details>
          )}
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-head"><div><h2>Isolated PHCs, by people affected</h2><p>Sorted by catchment population living beyond {th} min. A shortage here cannot be covered by sending people to the next PHC.</p></div></div>
        <div className="table-scroll">
          <table className="data">
            <thead><tr><th>PHC</th><th>LGA · ward</th><th className="n">Catchment</th><th className="n">Of whom beyond {th} min</th><th>Next PHC</th><th>Live status</th></tr></thead>
            <tbody>
              {d.isolated_facilities.map((f: any) => (
                <tr key={f.facility_id}>
                  <td><Link href={`/state/${code}/facility/${f.facility_id}`}>{f.name}</Link></td>
                  <td className="muted">{f.lga} · {f.ward ?? "n/a"}</td>
                  <td className="n">{int(f.catchment_pop)}</td>
                  <td className="n">{int(f.catchment_pop_beyond_main)}</td>
                  <td>{f.alt_walk_min != null ? <>{mins(f.alt_walk_min)} walk<small className="muted"> · {f.alt_facility_name}</small></> : <span className="muted">none reachable on foot</span>}</td>
                  <td>{f.live_tag ? <QueueTag tag={f.live_tag} /> : <span className="muted">n/a</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid g-2" style={{ marginBottom: 16 }}>
        <div className="card">
          <div className="card-head"><div><h2>Wards with the most people far from care</h2><p>Ranked by people beyond {th} min walk</p></div></div>
          <table className="data">
            <thead><tr><th>#</th><th>Ward</th><th>LGA</th><th className="n">Beyond {th} min</th><th className="n">Share</th></tr></thead>
            <tbody>{d.hotspot_wards.map((w: any) => (
              <tr key={w.ward_code}><td className="muted">{w.hotspot_rank}</td><td>{w.ward}</td><td className="muted">{w.lga}</td><td className="n">{int(w.pop_beyond_main)}</td><td className="n">{pct(w.pct_beyond_main, 0)}</td></tr>
            ))}</tbody>
          </table>
        </div>
        <div className="card">
          <div className="card-head"><div><h2>Candidate areas to look at</h2><p>Highest walking time × population, at least 10 km apart. For outreach or a new service point; not a siting decision (staff, land, security and cost are not modelled).</p></div></div>
          <ol className="cand-list">
            {d.candidates.map((c: any) => (
              <li key={c.rank}><span className="cand-num static" aria-hidden>{c.rank}</span>
                <span><strong>{c.ward ?? "Unnamed ward"}, {c.lga}</strong><small>{int(c.cell_population)} people in the 1 km cell · {mins(c.walk_min)} walk · nearest {c.nearest_facility_name}</small></span></li>
            ))}
          </ol>
        </div>
      </div>

      <div className="card method">
        <h2>How this is calculated</h2>
        <ul className="evidence">
          <li>Population: WorldPop 2026 constrained, 100 m, aggregated to 1 km equal-area cells ({ppl(s.pop_total)} in {d.state.name}).</li>
          <li>Travel time: Malaria Atlas Project 2020 walking friction surface; cost-distance from every included public PHC. Motorised times use MAP's motorised surface.</li>
          <li>Facilities: GRID3 public primary facilities except those marked not functional ({d.settings.facility_filter.replace(/_/g, " ")}). Routes may cross state lines; PHCs in the other 11 demo states count, PHCs elsewhere do not, so burden near those borders may be overstated.</li>
          <li>Catchment = the people whose nearest PHC this is. It is geographic proximity, not observed use.</li>
          <li>A value exactly at {th} minutes counts as within. Thresholds are design choices, not a national standard.</li>
        </ul>
        <p className="note">{d.note} Sources and checksums: docs/data_sources.md.</p>
      </div>
    </>
  );
}
