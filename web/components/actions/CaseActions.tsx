"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { act } from "@/lib/client";
import { SynChip } from "./Chips";

/** Every button writes a case_event with the acting persona. Out-of-scope actions come back as 403 with a reason. */
export default function CaseActions({ data }: { data: any }) {
  const router = useRouter();
  const c = data.case;
  const closed = ["resolved", "closed_no_action", "closed_duplicate"].includes(c.status);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [outcome, setOutcome] = useState(Object.keys(data.outcome_codes)[0]);
  const [note, setNote] = useState("");
  const [assignee, setAssignee] = useState("");
  const [reply, setReply] = useState("");
  const drafts = data.messages.filter((m: any) => m.status === "draft");
  const pendingRq = data.resupply.filter((r: any) => r.status === "pending_approval");
  const oic = data.people.find((p: any) => p.role_code === "fac_oic");

  const run = async (key: string, fn: () => Promise<any>, done: string) => {
    setBusy(key); setErr(null); setOk(null);
    try { await fn(); setOk(done); router.refresh(); } catch (e: any) { setErr(e.message); } finally { setBusy(null); }
  };

  return (
    <div className="case-actions">
      {err && <div className="simmsg err" role="alert">{err}</div>}
      {ok && <div className="simmsg" role="status">{ok}</div>}
      {!closed && (
        <>
          <div className="act-row">
            <button className="btn" disabled={!!busy || !!c.acknowledged_at} onClick={() => run("ack", () => act(`/cases/${c.case_id}/acknowledge`), "Acknowledged")}>
              {c.acknowledged_at ? "Acknowledged" : "Acknowledge"}
            </button>
            <button className="btn" disabled={!!busy} onClick={() => run("adv", () => act(`/cases/${c.case_id}/advance`), "Moved to the next step")}>Advance step</button>
            {drafts.length > 0 && (
              <button className="btn primary" disabled={!!busy}
                onClick={() => run("appr", () => act("/messages/approve", { message_ids: drafts.map((m: any) => m.message_id) }),
                  `${drafts.length} message${drafts.length > 1 ? "s" : ""} approved; delivered (simulated) when the clock advances`)}>
                Approve {drafts.length} draft message{drafts.length > 1 ? "s" : ""}
              </button>
            )}
            {pendingRq.map((r: any) => (
              <button key={r.request_id} className="btn primary" disabled={!!busy}
                onClick={() => run(r.request_id, () => act(`/resupply-requests/${r.request_id}/approve`), `Resupply ${r.commodity_code} approved`)}>
                Approve resupply: {r.commodity_code} {Number(r.qty_requested).toLocaleString("en-GB")}
              </button>
            ))}
          </div>

          <div className="act-grid">
            <label>Reassign to
              <select value={assignee} onChange={(e) => setAssignee(e.target.value)}>
                <option value="">Choose a person…</option>
                {data.people.filter((p: any) => p.level !== "facility").map((p: any) => <option key={p.person_id} value={p.person_id}>{p.name} · {p.role_title}</option>)}
                {data.escalation_ladder.filter((s: any) => s.person_id).map((s: any) => <option key={`l${s.person_id}`} value={s.person_id}>{s.name} · {s.title}</option>)}
              </select>
              <button className="btn sm" disabled={!assignee || !!busy} onClick={() => run("asg", () => act(`/cases/${c.case_id}/assign`, { person_id: assignee }), "Reassigned")}>Reassign</button>
            </label>
            <label>Outcome
              <select value={outcome} onChange={(e) => setOutcome(e.target.value)}>
                {Object.entries(data.outcome_codes).map(([k, v]) => <option key={k} value={k}>{v as string}</option>)}
              </select>
              <span className="act-row">
                <button className="btn sm primary" disabled={!!busy} onClick={() => run("res", () => act(`/cases/${c.case_id}/resolve`, { outcome_code: outcome, note: note || null }), "Resolved")}>Resolve</button>
                <button className="btn sm" disabled={!!busy} onClick={() => run("cls", () => act(`/cases/${c.case_id}/close`, { outcome_code: outcome, note: note || null }), "Closed")}>Close, no action</button>
              </span>
            </label>
          </div>
          <label className="act-note">Note
            <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="What happened, who you spoke to, what comes next" />
            <span className="act-row">
              <button className="btn sm" disabled={!note || !!busy} onClick={() => run("note", () => act(`/cases/${c.case_id}/note`, { text: note }), "Note added")}>Add note</button>
              {c.level === "state" && <>
                <button className="btn sm" disabled={!note || !!busy} onClick={() => run("lead", () => act(`/cases/${c.case_id}/note`, { text: note, kind: "response_lead" }), "Response lead named")}>Save as response lead</button>
                <button className="btn sm" disabled={!note || !!busy} onClick={() => run("plan", () => act(`/cases/${c.case_id}/note`, { text: note, kind: "response_plan" }), "Response plan submitted")}>Submit as response plan</button>
              </>}
            </span>
          </label>
          {oic && (
            <div className="reply-as">
              <div className="eyebrow">Reply as the facility (demo)</div>
              <p className="note" style={{ marginTop: 2 }}>Type the reply the clinic&apos;s Officer-in-Charge, <strong>{oic.name}</strong> <SynChip />, would send by SMS. It is parsed and applied exactly like a simulated reply.</p>
              <div className="act-row">
                <input type="text" value={reply} onChange={(e) => setReply(e.target.value)} placeholder="ACT 12 RDT 0 FRIDGE 1" aria-label="Reply text" suppressHydrationWarning />
                <button className="btn sm" disabled={!reply || !!busy} onClick={() => run("rep", () => act(`/cases/${c.case_id}/reply`, { text: reply }), "Reply recorded")}>Send reply</button>
              </div>
            </div>
          )}
        </>
      )}
      {closed && <p className="muted">This case is {c.status.replace(/_/g, " ")}{c.outcome_code ? `: ${data.outcome_codes[c.outcome_code]}` : ""}.</p>}
    </div>
  );
}
