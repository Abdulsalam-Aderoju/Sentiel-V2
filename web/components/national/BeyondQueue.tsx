import Link from "next/link";
import { int, pct } from "@/lib/api";

/** Three national figures beside the queue: who is acting (simulated), how far people travel (real-derived),
 *  what the gaps hide (modelled). Each block carries its data class. */
export default function BeyondQueue({ actions, kpis }: { actions: any | null; kpis: any }) {
  const a = actions?.kpis;
  return (
    <div className="beyond" aria-label="Action, access and hidden burden">
      {a && (
        <div className="card beyond-card">
          <div className="eyebrow">Who is acting <span className="sim-chip sm">Simulated</span></div>
          <div className="beyond-row">
            <div><b className="num">{int(a.open_cases)}</b><span>open cases</span></div>
            <div><b className="num">{pct(a.total_cases ? a.acknowledged / a.total_cases : 0)}</b><span>acknowledged</span></div>
            <div><b className="num">{int(a.overdue)}</b><span>overdue</span></div>
            <div><b className="num">{int(a.escalated_to_state + a.escalated_to_national)}</b><span>escalated to state or national</span></div>
          </div>
          <p className="note">Clock {new Date(actions.clock.sim_date).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</p>
        </div>
      )}
      {kpis.pct_pop_beyond_threshold != null && (
        <div className="card beyond-card">
          <div className="eyebrow">Where people travel furthest <span className="real-chip sm">Real-derived</span></div>
          <div className="beyond-row">
            <div><b className="num">{(kpis.pop_beyond_threshold / 1e6).toFixed(1)} M</b><span>people beyond a 60-min walk to a PHC</span></div>
            <div><b className="num">{pct(kpis.pct_pop_beyond_threshold, 1)}</b><span>of {(kpis.access_pop_total / 1e6).toFixed(0)} M in the 12 states</span></div>
          </div>
          <p className="note">Map metric “% people beyond a 60-min walk” · each state&apos;s Access tab</p>
        </div>
      )}
      {kpis.hidden_malaria_cases != null && (
        <div className="card beyond-card">
          <div className="eyebrow">What the gaps hide <span className="model-chip sm">Modelled</span></div>
          <div className="beyond-row">
            <div><b className="num">≈ {int(kpis.hidden_malaria_cases)}</b><span>malaria cases this month at PHCs that did not report</span></div>
            <div><b className="num">{int(kpis.hidden_malaria_lo)}–{int(kpis.hidden_malaria_hi)}</b><span>80% range</span></div>
          </div>
          <p className="note">From each PHC&apos;s own history; validated against truth · <Link href="/national/briefing?slide=8">briefing</Link></p>
        </div>
      )}
    </div>
  );
}
