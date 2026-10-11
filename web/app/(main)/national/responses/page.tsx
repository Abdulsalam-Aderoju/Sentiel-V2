import type { Metadata } from "next";
import Link from "next/link";
import RequestResponse from "@/components/national/RequestResponse";
import { PriorityChip, StatusChip, SynChip } from "@/components/actions/Chips";
import SimClock from "@/components/actions/SimClock";
import { SimChip } from "@/components/Tags";
import { dateLabel } from "@/lib/actions";
import { api } from "@/lib/api";

export const metadata: Metadata = { title: "State responses" };

/** National view of response requests: who was asked, whether they answered, and what the plan says.
 *  Nothing here lets national reach a clinic or an LGA; the only channel is the state board. */
export default async function Responses() {
  const d = await api("/national/responses");
  const closed = ["resolved", "closed_no_action", "closed_duplicate"];
  const open = d.responses.filter((r: any) => !closed.includes(r.status));
  const acked = d.responses.filter((r: any) => r.acknowledged_at).length;
  const plans = d.responses.filter((r: any) => r.response_plan).length;
  const overdue = open.filter((r: any) => r.overdue).length;
  const kpis = [
    { label: "Requests opened", value: d.responses.length, sub: `${open.length} still open` },
    { label: "Acknowledged by the state", value: acked, sub: "someone took ownership" },
    { label: "Plans received", value: plans, sub: "a response lead and plan are on file" },
    { label: "Overdue", value: overdue, sub: "no answer by the deadline", accent: "var(--st-serious)" },
  ];

  return (
    <>
      <div className="page-head">
        <div>
          <div className="crumbs"><span>National</span><span className="sep">/</span><span>State responses</span></div>
          <h1>State responses</h1>
          <div className="secondary responses-note">
            When a state&apos;s evidence is too weak to trust, a national officer can ask its Director of PHC Services for a response plan.
            This is the only channel: requests go to the state board, never to an LGA or a clinic. <SimChip />
          </div>
        </div>
        <SimClock simDate={d.clock.sim_date} started={d.clock.started} compact />
      </div>

      <div className="grid g-kpi" style={{ marginBottom: 16 }}>
        {kpis.map((c) => (
          <div className="card kpi accent" key={c.label} style={{ ["--kpi-accent" as any]: c.accent ?? "var(--brand)" }}>
            <div className="label">{c.label}</div><div className="value num">{c.value}</div><div className="sub">{c.sub}</div>
          </div>
        ))}
      </div>

      {d.suggested.length > 0 && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-head"><div><h2>States where a response is suggested</h2><p>Suggested from the state&apos;s status, never sent automatically. You decide.</p></div></div>
          <ul className="sugg-list">
            {d.suggested.map((s: any) => (
              <li key={s.state_code}>
                <span><strong>{s.state_name}</strong> <span className="muted">· {s.zone}</span><small>{s.reason}</small></span>
                <RequestResponse compact s={{ state_code: s.state_code, response_suggested: s.reason }} />
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="card" style={{ padding: 0, overflowX: "auto" }}>
        <table className="data">
          <thead><tr><th>State</th><th>Case</th><th>Asked of</th><th>Status</th><th>Due</th><th>Response lead</th><th>Response plan</th></tr></thead>
          <tbody>
            {d.responses.map((r: any) => (
              <tr key={r.case_id}>
                <td><strong>{r.state_name}</strong><div className="muted" style={{ fontSize: 12 }}>{r.zone}</div></td>
                <td><Link href={`/cases/${r.case_id}`}><strong>{r.case_ref}</strong></Link> <PriorityChip p={r.priority} /></td>
                <td>{r.owner_name} <SynChip /><div className="muted" style={{ fontSize: 12 }}>{r.owner_role_title}</div>
                  {r.escalation_level > 0 && <div className="esc-note">▲ escalated to {r.escalated_to_name}</div>}</td>
                <td><StatusChip status={r.status} /><div className="muted" style={{ fontSize: 12 }}>{r.acknowledged_at ? `acknowledged ${dateLabel(r.acknowledged_at)}` : "not yet acknowledged"}</div></td>
                <td className={r.overdue ? "due overdue" : "due"}>{r.overdue ? "Overdue · " : ""}{dateLabel(r.due_at)}</td>
                <td>{r.response_lead ?? <span className="muted">not named</span>}</td>
                <td style={{ maxWidth: 320 }}>{r.response_plan ? <details><summary>Plan received</summary><p style={{ margin: "6px 0 0" }}>{r.response_plan}</p></details> : <span className="muted">awaiting</span>}</td>
              </tr>
            ))}
            {d.responses.length === 0 && <tr><td colSpan={7} className="empty">No response has been requested yet.</td></tr>}
          </tbody>
        </table>
      </div>
      <p className="note">Requests that nobody acknowledges climb an escalation ladder: the State Director of PHC, then the State Executive Secretary, then back to the national Director of PHC.</p>
    </>
  );
}
