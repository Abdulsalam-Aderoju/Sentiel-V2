import Link from "next/link";
import { notFound } from "next/navigation";
import CaseBoard from "@/components/actions/CaseBoard";
import { PersonName, PriorityChip } from "@/components/actions/Chips";
import DemoGuide from "@/components/actions/DemoGuide";
import { ApprovalTray, Inbox, Outbox } from "@/components/actions/Messaging";
import { RULE_SHORT, days } from "@/lib/actions";
import { api, apiOrNull, pct } from "@/lib/api";

/** The Action Centre body, shared by the state board portal (whole state) and the LGA portal (one LGA).
 *  It never decides who may see it: middleware keeps the portals apart and the API enforces scope per person. */
export async function loadSummary(code: string) {
  const s = await apiOrNull(`/state/${code}/actions/summary`);
  if (!s) notFound();
  return s;
}

export default async function ActionCentreView({ code, lgaId, sp, summary }: {
  code: string; lgaId?: string; sp: Record<string, string | undefined>; summary: any;
}) {
  const s = summary;
  const tab = sp.tab ?? "cases";
  const base = lgaId ? `/state/${code}/lga/${lgaId}/actions` : `/state/${code}/actions`;
  const lgaRow = lgaId ? s.lgas.find((l: any) => l.lga_id === lgaId) : null;
  const k = s.kpis;

  const demo = await api(`/state/${code}/cases`, undefined, { demo: "true", open_only: "false", limit: "10", lga_id: lgaId });
  const demoLga = demo.cases.length ? { state: code, lga_id: demo.cases[0].lga_id, lga: demo.cases[0].lga } : null;
  const lgas = lgaId ? [] : s.lgas.map((l: any) => ({ lga_id: l.lga_id, lga: l.lga })).sort((a: any, b: any) => a.lga.localeCompare(b.lga));
  const byStatus = Object.fromEntries(s.by_status.map((r: any) => [r.status, r.n]));
  const draftCount = lgaId
    ? (await api("/messages", undefined, { state: code, lga_id: lgaId, status: "draft", limit: "1" })).total
    : k.awaiting_approval;
  const repliesToReview = lgaId
    ? (await api("/responses", undefined, { state: code, lga_id: lgaId, review_status: "needs_review", limit: "100" })).responses.length
    : k.replies_to_review;

  const tabs: [string, string][] = lgaId
    ? [["cases", "Cases"], ["approvals", "Approvals"], ["outbox", "Outbox"], ["inbox", "Replies"], ["escalations", "Escalated"]]
    : [["cases", "Cases"], ["approvals", "Approvals"], ["outbox", "Outbox"], ["inbox", "Replies"], ["lgas", "LGA accountability"], ["escalations", "Escalations"]];

  let body: React.ReactNode = null;
  if (tab === "cases" || (lgaId && tab === "escalations")) {
    const view = sp.view === "kanban" ? "kanban" : "list";
    const page = Number(sp.page ?? 0);
    const params: Record<string, string> = { limit: view === "kanban" ? "300" : "50", offset: String(view === "kanban" ? 0 : page * 50) };
    for (const key of ["priority", "lga_id", "rule", "q", "sort", "owner"]) if (sp[key]) params[key] = sp[key]!;
    if (lgaId) params.lga_id = lgaId;
    if (sp.overdue) params.overdue = "true";
    if (sp.escalated || tab === "escalations") params.escalated = "true";
    if (sp.demo) params.demo = "true";
    if (view === "kanban") params.open_only = "false";
    const cs = await api(`/state/${code}/cases`, undefined, params);
    body = <CaseBoard cases={cs.cases} total={cs.total} view={view} lgas={lgas} byStatus={byStatus} />;
  } else if (tab === "approvals") {
    const m = await api("/messages", undefined, { state: code, lga_id: lgaId, status: "draft", limit: "100", priority: sp.mprio, kind: sp.kind });
    body = <ApprovalTray messages={m.messages} total={m.total} />;
  } else if (tab === "outbox") {
    const m = await api("/messages", undefined, { state: code, lga_id: lgaId, status: "sent_simulated,delivered_simulated,replied,failed_simulated", limit: "60" });
    body = <Outbox messages={m.messages} />;
  } else if (tab === "inbox") {
    const r = await api("/responses", undefined, { state: code, lga_id: lgaId, limit: "100" });
    body = <Inbox responses={r.responses} />;
  } else if (tab === "lgas" && !lgaId) {
    body = (
      <div className="card" style={{ padding: 0, overflowX: "auto" }}>
        <table className="data">
          <thead><tr>
            <th>LGA</th><th>PHC Coordinator</th><th className="n">Open</th><th className="n">P1 open</th><th className="n">Overdue</th>
            <th className="n">Not acknowledged</th><th className="n">Escalated</th><th className="n">Median days to acknowledge</th>
            <th className="n">Resolved</th><th className="n">Within SLA</th><th className="n">Signals cleared</th>
          </tr></thead>
          <tbody>
            {s.lgas.map((l: any) => (
              <tr key={l.lga_id}>
                <td><Link href={`/state/${code}/lga/${l.lga_id}/actions`}><strong>{l.lga}</strong></Link></td>
                <td><PersonName name={l.coordinator} /></td>
                <td className="n">{l.open_cases}</td><td className="n">{l.p1_open}</td>
                <td className="n">{l.overdue > 0 ? <strong>{l.overdue}</strong> : 0}</td>
                <td className="n">{l.unacknowledged}</td><td className="n">{l.escalated}</td>
                <td className="n">{l.median_days_to_ack == null ? "n/a" : Number(l.median_days_to_ack).toFixed(1)}</td>
                <td className="n">{pct(l.pct_resolved)}</td><td className="n">{pct(l.pct_resolved_in_sla)}</td><td className="n">{l.signals_cleared}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="note" style={{ padding: "0 14px 12px" }}>Signals cleared: facilities whose live status left the action or verification queue after field evidence. Sorted by overdue cases, then unacknowledged. Open an LGA to see its own Action Centre.</p>
      </div>
    );
  } else if (tab === "escalations") {
    body = (
      <div className="card" style={{ padding: 0, overflowX: "auto" }}>
        <table className="data">
          <thead><tr><th>Case</th><th>Facility / unit</th><th>Owner</th><th>Escalated to</th><th>Level</th></tr></thead>
          <tbody>
            {s.escalations.map((c: any) => (
              <tr key={c.case_id}>
                <td><Link href={`/cases/${c.case_id}`}><strong>{c.case_ref}</strong></Link> <PriorityChip p={c.priority} /></td>
                <td>{c.unit_name}<div className="muted" style={{ fontSize: 12 }}>{RULE_SHORT[c.rule_id]}</div></td>
                <td><PersonName name={c.owner_name} /></td>
                <td><PersonName name={c.escalated_to_name} /><div className="muted" style={{ fontSize: 12 }}>{c.escalated_to_role}</div></td>
                <td>▲ {c.escalation_level}</td>
              </tr>
            ))}
            {s.escalations.length === 0 && <tr><td colSpan={5} className="empty">No escalations yet. Cases escalate when nobody acts within the SLA.</td></tr>}
          </tbody>
        </table>
      </div>
    );
  }

  const kpis = lgaRow ? [
    { label: "Open cases", value: lgaRow.open_cases, sub: "owned in this LGA" },
    { label: "P1 open", value: lgaRow.p1_open, sub: "urgent: due in 2 to 3 days", accent: "var(--st-critical)" },
    { label: "Overdue", value: lgaRow.overdue, sub: `${lgaRow.open_cases ? pct(lgaRow.overdue / lgaRow.open_cases) : "0%"} of open cases`, accent: "var(--st-serious)" },
    { label: "Not acknowledged", value: lgaRow.unacknowledged, sub: "waiting for someone to take them", accent: "var(--st-serious)" },
    { label: "Escalated", value: lgaRow.escalated, sub: "climbed to a senior officer", accent: "var(--st-serious)" },
    { label: "Median time to acknowledge", value: lgaRow.median_days_to_ack == null ? "n/a" : days(lgaRow.median_days_to_ack), sub: "this LGA" },
    { label: "Resolved within SLA", value: pct(lgaRow.pct_resolved_in_sla), sub: `${pct(lgaRow.pct_resolved)} of cases resolved` },
    { label: "Messages awaiting approval", value: draftCount, sub: `${repliesToReview} replies to review`, accent: "var(--series-1)" },
  ] : [
    { label: "Open cases", value: k.open_cases, sub: `${k.total_cases.toLocaleString("en-GB")} opened in total` },
    { label: "P1 open", value: k.p1_open, sub: "urgent: due in 2 to 3 days", accent: "var(--st-critical)" },
    { label: "Overdue", value: k.overdue, sub: `${pct(k.pct_overdue)} of open cases`, accent: "var(--st-serious)" },
    { label: "Escalated", value: k.escalated, sub: `${k.escalated_to_state} reached state, ${k.escalated_to_national} national`, accent: "var(--st-serious)" },
    { label: "Median time to acknowledge", value: k.median_days_to_ack == null ? "n/a" : days(k.median_days_to_ack), sub: `${k.acknowledged.toLocaleString("en-GB")} acknowledged` },
    { label: "Resolved within SLA", value: pct(k.pct_resolved_in_sla), sub: `${k.resolved} resolved · ${pct(k.pct_resolved)} of all` },
    { label: "Messages awaiting approval", value: k.awaiting_approval, sub: `${k.sent.toLocaleString("en-GB")} sent (simulated)`, accent: "var(--series-1)" },
    { label: "Replies to review", value: k.replies_to_review, sub: `${k.replies} replies · ${k.verifications} field verifications`, accent: "var(--series-1)" },
  ];

  return (
    <>
      <DemoGuide cases={demo.cases} lgaPortal={lgaId ? null : demoLga} />

      <div className="grid g-kpi8" style={{ margin: "16px 0" }}>
        {kpis.map((c) => (
          <div className="card kpi accent" key={c.label} style={{ ["--kpi-accent" as any]: c.accent ?? "var(--brand)" }}>
            <div className="label">{c.label}</div>
            <div className="value num">{typeof c.value === "number" ? c.value.toLocaleString("en-GB") : c.value}</div>
            <div className="sub">{c.sub}</div>
          </div>
        ))}
      </div>
      {!lgaId && (k.live_changed > 0 || k.signals_cleared > 0) && (
        <p className="note" style={{ marginTop: -6 }}>
          Field evidence changed the live status of {k.live_changed} facilities: {k.shortages_confirmed} shortages confirmed, {k.signals_cleared} signals cleared.
          {k.resupply_pending > 0 && <> <Link href={`/state/${code}/resupply`}>{k.resupply_pending} resupply requests await approval.</Link></>}
        </p>
      )}

      <div className="tabs" role="tablist">
        {tabs.map(([key, label]) => (
          <Link key={key} href={`${base}?tab=${key}`} className={tab === key ? "active" : ""} role="tab" aria-selected={tab === key} scroll={false}>
            {label}{key === "approvals" ? ` (${draftCount.toLocaleString("en-GB")})` : key === "inbox" && repliesToReview ? ` (${repliesToReview} to review)` : ""}
          </Link>
        ))}
      </div>
      {body}
    </>
  );
}
