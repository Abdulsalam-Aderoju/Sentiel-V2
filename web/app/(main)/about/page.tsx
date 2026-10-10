import type { Metadata } from "next";
import { api, int } from "@/lib/api";

export const metadata: Metadata = { title: "Method & data" };

export default async function About() {
  const [labels, cfg, st] = await Promise.all([api("/meta/data-labels"), api("/meta/settings"), api("/national/states")]);
  const s = cfg.settings;
  return (
    <div className="stack" style={{ maxWidth: 900 }}>
      <div>
        <h1>Method &amp; data</h1>
        <p className="secondary">
          PHC Sentinel helps a State PHC Board decide which facilities to support or verify next. It combines operational
          warning signals with an explicit judgement of how far the underlying data can be trusted. The National Command
          Centre rolls the same state results up for federal users; it shows state aggregates only.
        </p>
      </div>

      <div className="card">
        <h2>Access in this demo, and in a pilot</h2>
        <p style={{ marginTop: 0 }}>
          The demo has <strong>no login</strong>: every view has its own address (<code>/national</code>,{" "}
          <code>/state/&#123;code&#125;</code>) so reviewers can reach any of them in one click.
        </p>
        <p style={{ marginBottom: 0 }}>
          A pilot deployment would add <strong>real authentication with state-scoped access</strong>: a State PHC Board
          or LGA team signs in and sees only its own state and LGAs; federal users (FMoH, NPHCDA) see the national
          roll-up and can open any state. The API would enforce the same scopes, not only the interface.
        </p>
      </div>

      <div className="card">
        <h2>Coverage: 12 states, two per geopolitical zone</h2>
        <p className="secondary" style={{ marginTop: 0 }}>
          Facility lists are GRID3 Health Facilities v3.0, filtered to public primary facilities. Lagos, Anambra, Rivers
          and Cross River are not in GRID3 v3.0, so same-zone states are used instead: Ogun (for Lagos), Abia (for
          Anambra), Delta and Bayelsa (for Rivers and Cross River).
        </p>
        <div style={{ overflowX: "auto" }}><table className="data">
          <thead><tr><th>Zone</th><th>State</th><th className="n">Public PHCs</th><th className="n">LGAs</th><th className="n">Location unverified</th></tr></thead>
          <tbody>
            {st.states.map((r: any) => (
              <tr key={r.state_code}><td className="secondary">{r.zone}</td><td>{r.state}</td><td className="n">{int(r.facilities)}</td><td className="n">{r.lgas}</td><td className="n">{r.location_unverified}</td></tr>
            ))}
          </tbody>
        </table></div>
        <p className="note">
          Facility locations are checked against GRID3 LGA polygons. A point outside its own LGA but within{" "}
          {s.geography.near_boundary_km} km of it is tagged <strong>Near boundary</strong> and stays on the map. A point
          further away is tagged <strong>Location unverified</strong>: it stays in every queue but is not drawn on the map.
        </p>
      </div>

      <div className="card">
        <h2>The problem</h2>
        <p>
          PHC data arrive monthly (DHIS2) and bimonthly (NHLMIS), and often late, incomplete or not at all. A model that
          reports &ldquo;low risk&rdquo; for a facility with stale or missing data can be more dangerous than no model.
          Sentinel therefore gives every facility two separate outputs: <strong>operational risk</strong> and{" "}
          <strong>data confidence</strong>.
        </p>
      </div>

      <div className="card">
        <h2>How a facility is routed</h2>
        <div style={{ overflowX: "auto" }}><table className="data">
          <thead><tr><th /><th>High or moderate confidence</th><th>Low confidence</th></tr></thead>
          <tbody>
            <tr><th>High or critical risk</th><td>Resource action: <strong>act now</strong></td><td>Resource action: <strong>verify then act</strong></td></tr>
            <tr><th>Normal or watch risk</th><td><strong>Monitor</strong>: credible stability</td><td>Data verification: <strong>do not assume safe</strong></td></tr>
          </tbody>
        </table></div>
        <ul>
          <li><strong>Operational risk</strong> is the worst <em>credible</em> domain (malaria commodities, vaccine &amp; cold chain, service pressure), never an average. A domain whose source is stale is shown but cannot drive risk.</li>
          <li><strong>Malaria commodities</strong>: months of stock = physical stock / AMC. Stockout with stock below the {s.commodity.min_months}-month minimum is Critical; below the {s.commodity.eop_months}-month emergency order point is High; below the minimum is Watch.</li>
          <li><strong>Vaccine &amp; cold chain</strong>: stockout + non-functional refrigerator is Critical; either alone is High; sessions below {s.vaccine.sessions_watch_ratio * 100}% of plan or rising Penta dropout is Watch.</li>
          <li><strong>Service pressure</strong>: robust z-score (median/MAD) against a seasonal baseline; Watch at z ≥ {s.service_pressure.watch_z}, High at z ≥ {s.service_pressure.high_z}. It is a proxy, so on its own it is capped at Watch.</li>
          <li><strong>Data confidence</strong> follows WHO Data Quality Review dimensions: completeness, timeliness, silence, outliers, consistency over time, coherence and freshness. Any severe failure (missing report, silence, stale commodity report, implausible or incoherent values) means Low.</li>
        </ul>
      </div>

      <div className="card">
        <h2>Data labels</h2>
        <p className="secondary">{labels.banner}</p>
        <div style={{ overflowX: "auto" }}><table className="data">
          <thead><tr><th>Table</th><th>Class</th><th>Description</th></tr></thead>
          <tbody>
            {labels.tables.map((t: any) => (
              <tr key={t.table_name}><td><code>{t.table_name}</code></td><td>{t.data_class}</td><td>{t.description}</td></tr>
            ))}
          </tbody>
        </table></div>
      </div>

      <div className="card">
        <h2>Limitations</h2>
        <ul>
          <li>Operational history is simulated. We do not claim real-world predictive accuracy; that needs a state&apos;s own history.</li>
          <li>Thresholds come from policy, WHO DQR practice or statistical convention, and are configurable. We do not claim they are optimal.</li>
          <li>General essential medicines and daily staffing are not covered: no routine facility-level feed exists for them.</li>
          <li>All data enter through the same DHIS2 / NHLMIS export adapter a state would use. To pilot, replace the export files and edit one mapping file.</li>
        </ul>
      </div>
    </div>
  );
}
