import type { Metadata } from "next";
import { api, apiOrNull, int, pct } from "@/lib/api";

export const metadata: Metadata = { title: "Method & data" };

export default async function About() {
  const [labels, cfg, st, gaps, access] = await Promise.all([api("/meta/data-labels"), api("/meta/settings"), api("/national/states"),
    apiOrNull("/national/gaps"), apiOrNull("/national/access")]);
  const names: Record<string, string> = Object.fromEntries(st.states.map((x: any) => [x.state_code, x.state]));
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
        <p>
          The Action Centre lets you <strong>act as a synthetic person</strong> (top bar, &ldquo;Acting as&rdquo;): a national
          officer, a state coordinator, an LGA officer or facility staff. The API enforces that person&apos;s scope, so an LGA
          officer cannot act on another LGA&apos;s cases and facility staff can reply but never approve. Every person, phone
          number (<code>SIM-…</code>) and email (<code>….invalid</code>) is invented; no message is ever sent.
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

      <div className="card" id="validation">
        <h2>Validation lab</h2>
        <p className="secondary" style={{ marginTop: 0 }}>What each new layer was checked against. Every figure here is regenerated by the build.</p>

        <h3>Action layer (simulated)</h3>
        <ul>
          <li>A person approves every outbound message; the simulation never approves (tested: no message is sent without an approval).</li>
          <li>Exactly one message provider exists, <code>SimulatedProvider</code>; configuring any other fails the build and the tests.</li>
          <li>Field verifications change only the live overlay. The assessed queue never changes, and with no verification the live status equals the assessed status for all 12,924 PHCs (tested).</li>
          <li>A field count lifts confidence to Moderate at most, and never past a missing report. A confirmed shortage becomes Act now (field-verified).</li>
          <li>Escalation moves one step per breach and stops at the top of the ladder; acknowledged, in-date cases do not escalate.</li>
          <li>The reply parser is tested on more than 30 real-world shapes (typos, word order, &ldquo;nil&rdquo;, &ldquo;spoilt&rdquo;); anything partial or unclear goes to a person.</li>
        </ul>

        {gaps?.validation && (
          <>
            <h3>Hidden burden (modelled) vs simulator truth</h3>
            <p className="secondary">Estimates for PHCs whose report was missing, scored on the last 12 months. The target interval is {pct(gaps.interval)}.</p>
            <div style={{ overflowX: "auto" }}><table className="data">
              <thead><tr><th>State</th><th className="n">Facility error</th><th className="n">Truth in range</th><th className="n">State-total error</th><th className="n">Total in range</th><th className="n">Stock signal lift</th></tr></thead>
              <tbody>
                {Object.entries(gaps.validation).map(([code, v]: [string, any]) => (
                  <tr key={code}><td>{names[code] ?? code}</td><td className="n">{pct(v.facility_wape)}</td><td className="n">{pct(v.facility_coverage)}</td>
                    <td className="n">{pct(v.state_total_mape, 1)}</td><td className="n">{pct(v.state_total_coverage)}</td><td className="n">{v.stock_lift ? `${v.stock_lift.toFixed(1)}×` : "n/a"}</td></tr>
                ))}
              </tbody>
            </table></div>
            <p className="note">Facility error is the weighted absolute error. Stock-signal lift is how much more often PHCs flagged &ldquo;elevated risk&rdquo; ran out than the average stale-report PHC: useful for ordering checks, not proof of a stock-out.</p>
          </>
        )}

        {access && (
          <>
            <h3>Access (real-derived)</h3>
            <ul>
              <li>Population is conserved exactly when 100 m WorldPop pixels are aggregated to 1 km cells (tested); {int(access.national.pop_total)} people across the 12 states.</li>
              <li>Sensitivity to how MAP friction is resampled: the share beyond a 60-minute walk moves by 1–2 points between methods (FCT 1.0–2.5%, Kano 1.2–1.9%, Bayelsa 4.4–5.5%). The build uses nearest-neighbour.</li>
              <li>PHCs in states outside the demo are not counted as alternatives, so burden near those borders may be overstated.</li>
            </ul>
          </>
        )}
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
