import Link from "next/link";
import { api, apiOrNull, int, monthLabel, pct } from "@/lib/api";

const PORTALS = [
  {
    id: "national", cls: "p-national", eyebrow: "Federal level", title: "National portal",
    who: "Federal Ministry of Health and NPHCDA",
    sees: "A summary of every state, never individual clinics: where to act, where the evidence is too weak to trust, how states compare.",
    does: ["Nigeria map, state cards and zone comparison", "Briefing mode for senior officials", "Ask a state for a response plan, and read its answer"],
    go: "Enter as a national officer",
  },
  {
    id: "state", cls: "p-state", eyebrow: "State level", title: "State board portal",
    who: "State PHC Development Agency or Board",
    sees: "Everything about one state and its LGAs: clinic queues, access to care, hidden cases, people, cases and resupply.",
    does: ["Action Centre: cases, approvals, replies, escalations", "Access and hidden-burden analysis for the state", "Open any of its LGA portals"],
    go: "Enter as a state board",
  },
  {
    id: "lga", cls: "p-lga", eyebrow: "LGA level", title: "LGA portal",
    who: "LGA PHC coordinators and officers",
    sees: "One LGA and its clinics: which need action or verification, the cases you own, and what each clinic reported.",
    does: ["Approve drafted messages to clinics", "Read replies and request resupply", "Open any clinic in the LGA"],
    go: "Enter as an LGA team",
  },
];

/** Public landing page: the problem, the idea, and a clear entrance to each of the three portals. */
export default async function Landing() {
  const nat = await api("/national/summary");
  const acc = await apiOrNull("/national/access");
  const k = nat.kpis;

  return (
    <>
      <section className="l-hero">
        <div className="l-hero-copy">
          <div className="eyebrow">Early warning for primary health care · Nigeria</div>
          <h1>Know which clinics are running short before patients are turned away.</h1>
          <p className="l-lead">
            PHC Sentinel reads the reports clinics already send, tells managers which clinics need action and which need their
            data checked first, and helps the right person follow it through, from the federal level down to the local clinic.
          </p>
          <div className="l-cta">
            <Link className="btn primary lg" href="/signin">Enter the demo</Link>
            <Link className="btn lg" href="/#how">See how it works</Link>
          </div>
          <dl className="l-stats" aria-label="Coverage">
            <div><dt>Clinics assessed</dt><dd className="num">{int(k.facilities)}</dd></div>
            <div><dt>States, all six zones</dt><dd className="num">{k.states}</dd></div>
            <div><dt>Reports received</dt><dd className="num">{pct(k.reporting_completeness)}</dd></div>
            <div><dt>Analysis month</dt><dd>{monthLabel(nat.month, true)}</dd></div>
          </dl>
        </div>
        <div className="l-hero-art" role="img" aria-label="Every clinic is sorted into one of four groups by how much trouble it looks in and how far its data can be trusted">
          <div className="l-axis-top"><span>Can we trust the data?</span></div>
          <div className="l-grid">
            <div className="l-q act"><span className="ico" aria-hidden>▲</span><b>Act now</b><span>In trouble, data trusted</span><em className="num">{int(k.act_now)}</em></div>
            <div className="l-q ver"><span className="ico" aria-hidden>◆</span><b>Verify then act</b><span>In trouble, data weak</span><em className="num">{int(k.verify_then_act)}</em></div>
            <div className="l-q mon"><span className="ico" aria-hidden>●</span><b>Monitor</b><span>No warning, data trusted</span><em className="num">{int(k.monitor)}</em></div>
            <div className="l-q dns"><span className="ico" aria-hidden>?</span><b>Do not assume safe</b><span>Looks fine, data weak</span><em className="num">{int(k.verification)}</em></div>
          </div>
          <div className="l-axis-side"><span>Does it look in trouble?</span></div>
          <p className="l-art-note">Clinics in each group across the 12 demo states. Simulated reports.</p>
        </div>
      </section>

      <section className="l-section" aria-labelledby="problem">
        <div className="l-head"><div className="eyebrow">The problem</div><h2 id="problem">Reports exist. Trust and follow-through are missing.</h2></div>
        <div className="l-three">
          <article className="l-card"><span className="l-num">1</span><h3>Shortages reach patients first</h3>
            <p>When a clinic runs out of malaria medicine or its vaccine fridge fails, children are sent away or families travel far. Fixing it early is cheap; fixing it late is not.</p></article>
          <article className="l-card"><span className="l-num">2</span><h3>Silence looks like good news</h3>
            <p>A clinic that sends no report shows no problems. A stock report that is months old may describe a shelf that is now empty. Ordinary dashboards paint both green.</p></article>
          <article className="l-card"><span className="l-num">3</span><h3>Warnings without owners go nowhere</h3>
            <p>A ranked list tells a manager which clinics matter, but not who calls the clinic, what to ask, or whether anyone did.</p></article>
        </div>
      </section>

      <section className="l-section alt" id="how" aria-labelledby="how-h">
        <div className="l-head"><div className="eyebrow">How it works</div><h2 id="how-h">Two questions, then a named person to act.</h2></div>
        <ol className="l-steps">
          <li><span className="l-step-n">1</span><h3>Read what clinics already send</h3><p>Monthly service reports (DHIS2) and stock reports (NHLMIS). No new reporting burden.</p></li>
          <li><span className="l-step-n">2</span><h3>Ask two separate questions</h3><p><b>Is this clinic in trouble?</b> and <b>can we trust the data behind that?</b> The answers are never mixed.</p></li>
          <li><span className="l-step-n">3</span><h3>Open a case with an owner</h3><p>Every flagged clinic gets a named person, a checklist and a deadline. Messages are drafted; a person approves each one.</p></li>
          <li><span className="l-step-n">4</span><h3>Verify, resupply, escalate</h3><p>A reply from the clinic updates its live status. A shortage becomes a pre-filled resupply request. Unanswered cases climb to a senior officer.</p></li>
        </ol>
        <p className="l-motto">Low observed risk with low confidence is <strong>not</strong> safe.</p>
      </section>

      <section className="l-section" aria-labelledby="more">
        <div className="l-head"><div className="eyebrow">Beyond the queue</div><h2 id="more">Three layers that answer the harder questions.</h2></div>
        <div className="l-three">
          <article className="l-card"><span className="l-tag sim">Simulated</span><h3>Who is acting</h3>
            <p>Cases, owners, deadlines, replies and escalation, tracked until the clinic is fixed or the case is closed. Nothing is ever really sent.</p></article>
          <article className="l-card"><span className="l-tag real">Real-derived</span><h3>Where people travel furthest</h3>
            <p>{acc ? <>{(acc.national.pop_beyond_main / 1e6).toFixed(1)} million people in the 12 states live more than an hour&apos;s walk from a public clinic.</> : "Population and travel-time maps show who lives far from care."} Isolated clinics get higher priority.</p></article>
          <article className="l-card"><span className="l-tag model">Modelled</span><h3>What the gaps hide</h3>
            <p>Estimates of the malaria cases behind missing reports and the stock behind out-of-date ones, with ranges, checked against what really happened in the simulation.</p></article>
        </div>
      </section>

      <section className="l-section alt" id="portals" aria-labelledby="portals-h">
        <div className="l-head"><div className="eyebrow">Built for three levels</div><h2 id="portals-h">Each level sees only what it needs.</h2>
          <p className="l-sub">Pick the portal that matches who you are. They look different on purpose, so you always know where you are.</p></div>
        <div className="l-portals">
          {PORTALS.map((p) => (
            <article key={p.id} className={`l-portal ${p.cls}`}>
              <div className="l-portal-top"><span className="eyebrow">{p.eyebrow}</span><h3>{p.title}</h3><div className="l-who">{p.who}</div></div>
              <p>{p.sees}</p>
              <ul>{p.does.map((d) => <li key={d}>{d}</li>)}</ul>
              <Link className="btn primary" href={`/signin?role=${p.id}`}>{p.go} <span aria-hidden>→</span></Link>
            </article>
          ))}
        </div>
      </section>

      <section className="l-section" aria-labelledby="honest">
        <div className="l-honest">
          <div><div className="eyebrow">Honest about the data</div><h2 id="honest">What is real, and what is simulated.</h2></div>
          <ul>
            <li><b>Real:</b> the {int(k.facilities)} clinic locations and the state, LGA and ward boundaries (GRID3), population (WorldPop) and travel-time maps (Malaria Atlas Project).</li>
            <li><b>Simulated:</b> every monthly report and stock count, and every person, phone number, message and reply. A banner says so on every page.</li>
            <li><b>Pilot path:</b> a state swaps in its own report files and staff list; real sign-in replaces the demo sign-in.</li>
          </ul>
        </div>
        <div className="l-final"><h2>See the whole loop in under two minutes.</h2><Link className="btn primary lg" href="/signin">Enter the demo</Link></div>
      </section>
    </>
  );
}
