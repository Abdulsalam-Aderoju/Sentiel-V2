import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { QueueTag, SimChip } from "@/components/Tags";
import CaseActions from "@/components/actions/CaseActions";
import { PersonName, PriorityChip, StatusChip, SynChip } from "@/components/actions/Chips";
import { Bubble } from "@/components/actions/Messaging";
import LiveStatus from "@/components/actions/LiveStatus";
import SimClock from "@/components/actions/SimClock";
import { EVENT_LABEL, RULE_SHORT, dateLabel } from "@/lib/actions";
import { DOMAIN_LABEL, apiOrNull } from "@/lib/api";
import { portal, portalHome } from "@/lib/persona";

type P = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: P): Promise<Metadata> {
  const { id } = await params;
  return { title: `Case ${id.replace("C", "C-")}` };
}

function eventText(e: any) {
  const p = e.payload ?? {};
  switch (e.event_type) {
    case "opened": return `Opened by rule ${RULE_SHORT[p.rule_id] ?? p.rule_id}${p.manual ? " (manually)" : ""} at ${p.priority}${p.notes?.length ? `. ${p.notes.join("; ")}` : ""}`;
    case "status_changed": return `${e.from_status?.replace(/_/g, " ")} → ${e.to_status?.replace(/_/g, " ")}`;
    case "step_entered": return p.title;
    case "escalated": return `To ${p.to_role} (level ${p.level}). ${p.reason}`;
    case "reply_received": return `"${p.raw}" (${p.parse_status})`;
    case "field_verification": return (p.items ?? []).map((i: any) => i.commodity_code ? `${i.commodity_code} ${i.quantity}` : i.fridge_functional != null ? `fridge ${i.fridge_functional ? "working" : "not working"}` : "reports sent").join(", ");
    case "live_status_changed": return `${p.from?.live_tag?.toLowerCase()} → ${p.to?.live_tag?.toLowerCase()} (${p.to?.live_confidence?.toLowerCase()} confidence)`;
    case "resupply_requested": return (p.requests ?? []).map((r: any) => `${r.commodity_code} ${Math.round(r.qty_requested)} (${r.basis})`).join("; ");
    case "resupply_approved": return `${p.commodity} ${Math.round(p.qty)}; expected ${dateLabel(p.expected_delivery)}`;
    case "resupply_delivered": return `${p.commodity} ${Math.round(p.qty)}`;
    case "resolved": case "closed": return `${p.outcome?.replace(/_/g, " ")}${p.note ? `: ${p.note}` : ""}`;
    case "message_approved": return `${p.count} message${p.count > 1 ? "s" : ""}`;
    case "note": case "response_lead": case "response_plan": return p.text;
    case "assigned": return `to ${p.role}`;
    case "linked_case_opened": return `${p.rule}: ${p.case_id}`;
    default: return p.note ?? "";
  }
}

export default async function CasePage({ params }: P) {
  const { id } = await params;
  const d = await apiOrNull(`/cases/${id}`);
  if (!d) notFound();
  const c = d.case;
  const pt = await portal();
  // A portal sees only its own cases: national the state-level requests, a state board its state, an LGA its LGA.
  if ((pt?.kind === "national" && c.level !== "state") || (pt?.kind === "state" && c.state_code !== pt.state)
    || (pt?.kind === "lga" && (c.lga_id !== pt.lga || c.level === "state"))) redirect(portalHome(pt));
  const back = pt?.kind === "national" ? { href: "/national/responses", label: "State responses" }
    : pt?.kind === "lga" ? { href: `/state/${c.state_code}/lga/${pt.lga}/actions`, label: "Action Centre" }
    : { href: `/state/${c.state_code}/actions`, label: "Action Centre" };
  const snap = c.evidence_snapshot ?? {};
  const steps = d.playbook.steps;
  const closed = ["resolved", "closed_no_action", "closed_duplicate"].includes(c.status);
  const where = c.level === "facility" ? `/state/${c.state_code}/facility/${c.facility_id}` : c.level === "lga" ? `/state/${c.state_code}/lga/${c.lga_id}` : `/state/${c.state_code}`;
  const replyByMsg = Object.fromEntries(d.responses.filter((r: any) => r.message_id).map((r: any) => [r.message_id, r.raw_text]));

  return (
    <>
      <div className="page-head">
        <div>
          <div className="crumbs">
            <Link href={back.href}>{back.label}</Link><span className="sep">/</span>
            <span>{c.level === "facility" ? c.lga : c.level === "lga" ? "LGA case" : "State case"}</span><span className="sep">/</span><span>{c.case_ref}</span>
          </div>
          <h1>{c.case_ref} · {pt?.kind === "national" ? c.unit_name : <Link href={where}>{c.unit_name}</Link>}</h1>
          <div className="case-meta">
            <PriorityChip p={c.priority} /> <StatusChip status={c.status} /> {snap.tag && <QueueTag tag={snap.tag} />}
            <span className={c.overdue ? "due overdue" : "due"}>{c.overdue ? "Overdue: due " : "Due "}{dateLabel(c.due_at)}</span>
            {c.demo && <span className="demo-badge">Demo scenario</span>}
            <SimChip />
          </div>
          <div className="secondary" style={{ marginTop: 6 }}>
            {d.playbook.title} · owner <PersonName name={c.owner_name} role={c.owner_role_title} />
            {c.escalation_level > 0 && <span className="esc-note"> ▲ escalated to {c.escalated_to_name} ({c.escalated_to_role})</span>}
            {c.raised_by_name && <span className="muted"> · raised by {c.raised_by_name}</span>}
          </div>
          {c.priority_notes?.length > 0 && <div className="note">Priority raised: {c.priority_notes.join("; ")}</div>}
        </div>
        <SimClock simDate={d.clock.sim_date} started={d.clock.started} compact />
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-head"><div><h2>Playbook</h2><p>{d.playbook.resolve_when}</p></div></div>
        <ol className="stepper">
          {steps.map((s: any, i: number) => {
            const state = closed ? "done" : i < c.current_step ? "done" : i === c.current_step ? "current" : "todo";
            return (
              <li key={s.id} className={state} aria-current={state === "current" ? "step" : undefined}>
                <span className="dot" aria-hidden>{state === "done" ? "✓" : i + 1}</span>
                <span className="t">{s.title}<small>{state === "done" ? "Done" : state === "current" ? "Current step" : "Next"}</small></span>
              </li>
            );
          })}
        </ol>
        <CaseActions data={d} />
      </div>

      <div className="grid g-2" style={{ marginBottom: 16 }}>
        <div className="stack">
          {d.live && <LiveStatus live={d.live} />}
          <div className="card">
            <div className="card-head"><div><h2>Evidence at opening</h2><p>The facility explanation when the case opened, {dateLabel(c.opened_at)}, from the {c.baseline_month} assessment</p></div></div>
            {snap.evidence_summary && <p style={{ marginTop: 0 }}><strong>{snap.evidence_summary}</strong></p>}
            {snap.explanation?.domains?.map((dm: any) => (
              <div key={dm.domain} className="ev-dom">
                <h3>{DOMAIN_LABEL[dm.domain] ?? dm.label} <span className="muted">· {dm.severity?.toLowerCase()}{dm.credible ? "" : ", not credible (stale)"}</span></h3>
                <ul className="evidence">{dm.evidence.map((e: any, i: number) => <li key={i}>{e.text}{e.source_date && <span className="muted"> (report to {e.source_date}{e.age_days != null ? `, ${e.age_days} days old` : ""})</span>}</li>)}</ul>
              </div>
            ))}
            {snap.explanation?.confidence_reasons?.length > 0 && (
              <><h3>Why confidence is reduced</h3><ul className="evidence">{snap.explanation.confidence_reasons.map((r: string, i: number) => <li key={i}>{r}</li>)}</ul></>
            )}
            {c.level !== "facility" && (
              <ul className="evidence">
                {snap.facilities != null && <li>{snap.facilities} PHCs; {snap.verification} in data verification</li>}
                {snap.status && <li>State status: {String(snap.status).replace(/_/g, " ")}</li>}
              </ul>
            )}
            {c.response_lead && <p><strong>Response lead:</strong> {c.response_lead}</p>}
            {c.response_plan && <p><strong>Response plan:</strong> {c.response_plan}</p>}
          </div>
          {d.resupply.length > 0 && (
            <div className="card">
              <div className="card-head"><div><h2>Resupply request</h2><p>Pre-filled; a person approves it. Synthetic, not a real order.</p></div>
                <Link className="btn sm" href={`/state/${c.state_code}/resupply?case=${c.case_id}`}>Printable view</Link></div>
              <table className="data">
                <thead><tr><th>Item</th><th className="n">Quantity</th><th>Basis</th><th>Status</th></tr></thead>
                <tbody>{d.resupply.map((r: any) => (
                  <tr key={r.request_id}><td>{r.commodity_code}</td><td className="n">{Math.round(r.qty_requested).toLocaleString("en-GB")}</td><td className="muted">{r.basis}</td>
                    <td>{r.status.replace(/_/g, " ")}{r.expected_delivery && r.status === "approved" ? `, expected ${dateLabel(r.expected_delivery)}` : ""}{r.delivered_at ? `, delivered ${dateLabel(r.delivered_at)}` : ""}</td></tr>
                ))}</tbody>
              </table>
            </div>
          )}
        </div>

        <div className="stack">
          <div className="card">
            <h2>Escalation ladder</h2>
            <ol className="ladder">
              {d.escalation_ladder.map((s: any) => (
                <li key={s.level} className={s.level < c.escalation_level ? "past" : s.level === c.escalation_level ? "now" : ""}>
                  <span className="lv">{s.level === c.escalation_level ? "▶" : s.level + 1}</span>
                  <span><strong>{s.title}</strong><small>{s.name ? <>{s.name} <SynChip /></> : "unfilled"} · act within {s.sla_days} day{s.sla_days > 1 ? "s" : ""}</small></span>
                </li>
              ))}
            </ol>
            <p className="note">Not acknowledged within the SLA: escalates one step and notifies the next person. Once acknowledged, it escalates only when overdue and idle.</p>
          </div>
          <div className="card">
            <h2>People here</h2>
            <ul className="people-list">
              {d.people.map((p: any) => <li key={p.person_id}><PersonName name={p.name} /><small>{p.role_title} · {p.phone_display}</small></li>)}
            </ul>
          </div>
        </div>
      </div>

      <div className="grid g-half">
        <div className="card">
          <h2>Timeline</h2>
          <ol className="timeline">
            {d.events.map((e: any) => (
              <li key={e.event_id} className={e.event_type}>
                <span className="when">{dateLabel(e.at)}</span>
                <span className="what"><strong>{EVENT_LABEL[e.event_type] ?? e.event_type}</strong>
                  <span className="muted"> · {e.actor}{e.synthetic_actor ? " (simulated)" : ""}</span>
                  <div>{eventText(e)}</div></span>
              </li>
            ))}
          </ol>
        </div>
        <div className="card">
          <h2>Messages and replies</h2>
          <div className="phones one">
            {d.messages.filter((m: any) => m.kind === "step" || m.kind === "reminder").map((m: any) => <Bubble key={m.message_id} m={m} reply={replyByMsg[m.message_id]} />)}
            {d.messages.filter((m: any) => m.kind === "step" || m.kind === "reminder").length === 0 && <div className="empty">No requests to the facility in this playbook.</div>}
          </div>
          {d.messages.some((m: any) => m.kind !== "step" && m.kind !== "reminder") && (
            <details style={{ marginTop: 10 }}><summary>Notices and escalation messages ({d.messages.filter((m: any) => m.kind !== "step" && m.kind !== "reminder").length})</summary>
              <ul className="evidence">{d.messages.filter((m: any) => m.kind !== "step" && m.kind !== "reminder").map((m: any) => <li key={m.message_id}>{m.to_name} <SynChip />: {m.body} <span className="muted">({m.status.replace(/_/g, " ")})</span></li>)}</ul>
            </details>
          )}
        </div>
      </div>
    </>
  );
}
