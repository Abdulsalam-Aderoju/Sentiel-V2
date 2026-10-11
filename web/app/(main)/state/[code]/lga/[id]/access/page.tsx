import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { LgaCrumbs, LgaTabs } from "@/components/LgaNav";
import { RealChip } from "@/components/Tags";
import { api, apiOrNull, int, pct } from "@/lib/api";

type P = { params: Promise<{ code: string; id: string }> };

export const metadata: Metadata = { title: "LGA access to care" };

const mins = (x: number | null | undefined) => (x == null ? "n/a" : `${Math.round(x)} min`);

/** How far the people of one LGA live from a clinic: its wards and its clinics' catchments. Real-derived. */
export default async function LgaAccess({ params }: P) {
  const { code, id } = await params;
  const d = await apiOrNull(`/state/${code}/access/lga/${id}`);
  if (!d) notFound();
  const st = await api(`/state/${code}/summary`);
  const l = d.lga;
  const th = 60;
  const isolated = d.facilities.filter((f: any) => f.isolated);

  return (
    <>
      <div className="page-head">
        <div>
          <LgaCrumbs code={code} stateName={st.state.name} lgaId={id} lgaName={l.lga} here="Access" />
          <h1>{l.lga}: where people travel furthest</h1>
          <div className="secondary" style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            Walking time to the nearest public clinic, 1 km cells <RealChip />
          </div>
        </div>
      </div>
      <LgaTabs code={code} lgaId={id} active="access" />

      <div className="grid g-kpi" style={{ marginBottom: 16 }}>
        <div className="card kpi accent" style={{ ["--kpi-accent" as any]: "var(--seq-600)" }}>
          <div className="label">People beyond a {th}-min walk</div>
          <div className="value num">{int(l.pop_beyond_main)}</div>
          <div className="sub">{pct(l.pct_beyond_main, 1)} of {int(l.pop_total)} people</div>
        </div>
        <div className="card kpi accent" style={{ ["--kpi-accent" as any]: "var(--seq-400)" }}>
          <div className="label">Average walk to a clinic</div>
          <div className="value num">{mins(l.walk_mean_min)}</div>
          <div className="sub">median {mins(l.walk_median_min)} · {mins(l.motor_mean_min)} by vehicle</div>
        </div>
        <div className="card kpi accent" style={{ ["--kpi-accent" as any]: "var(--series-2)" }}>
          <div className="label">Isolated clinics</div>
          <div className="value num">{isolated.length}</div>
          <div className="sub">next clinic more than {th} min walk away, of {l.n_facilities} in this LGA</div>
        </div>
        <div className="card kpi accent" style={{ ["--kpi-accent" as any]: "var(--series-1)" }}>
          <div className="label">Wards</div>
          <div className="value num">{d.wards.length}</div>
          <div className="sub">ranked below by people far from care</div>
        </div>
      </div>

      <div className="grid g-2" style={{ marginBottom: 16 }}>
        <div className="card">
          <div className="card-head"><div><h2>Wards, by people beyond {th} min</h2><p>Count first, then share</p></div></div>
          <div style={{ overflowX: "auto" }}>
            <table className="data">
              <thead><tr><th>Ward</th><th className="n">People</th><th className="n">Beyond {th} min</th><th className="n">Share</th><th className="n">Mean walk</th></tr></thead>
              <tbody>{d.wards.map((w: any) => (
                <tr key={w.ward_code}><td>{w.ward}</td><td className="n">{int(w.pop_total)}</td><td className="n">{int(w.pop_beyond_main)}</td>
                  <td className="n">{pct(w.pct_beyond_main, 0)}</td><td className="n">{mins(w.walk_mean_min)}</td></tr>
              ))}</tbody>
            </table>
          </div>
        </div>
        <div className="card">
          <div className="card-head"><div><h2>Clinics and the people who depend on them</h2><p>Catchment = people whose nearest clinic this is. Isolated clinics are marked.</p></div></div>
          <div style={{ overflowX: "auto" }}>
            <table className="data">
              <thead><tr><th>Clinic</th><th className="n">Catchment</th><th className="n">Beyond {th} min</th><th>Next clinic</th></tr></thead>
              <tbody>{d.facilities.slice(0, 25).map((f: any) => (
                <tr key={f.facility_id}>
                  <td><Link href={`/state/${code}/facility/${f.facility_id}`}>{f.name}</Link>{f.isolated && <span className="iso-flag"> · ▲ isolated</span>}</td>
                  <td className="n">{int(f.catchment_pop)}</td><td className="n">{int(f.catchment_pop_beyond_main)}</td>
                  <td>{f.alt_walk_min != null ? `${Math.round(f.alt_walk_min)} min walk` : <span className="muted">none on foot</span>}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </div>
      </div>
      <p className="note">{d.note}</p>
    </>
  );
}
