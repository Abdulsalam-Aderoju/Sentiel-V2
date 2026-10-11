"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { PLAYBOOK_TITLE, dateLabel } from "@/lib/actions";
import { act } from "@/lib/client";
import { PersonName, PriorityChip, StatusChip } from "./Chips";

export default function TakeAction({ code, facilityId, data }: { code: string; facilityId: string; data: any }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [pb, setPb] = useState("");
  const open = data.cases.filter((c: any) => !["resolved", "closed_no_action", "closed_duplicate"].includes(c.status));
  const done = data.cases.filter((c: any) => ["resolved", "closed_no_action", "closed_duplicate"].includes(c.status));
  const openBooks = new Set(open.map((c: any) => c.playbook_id));
  const start = async (body: any) => {
    setBusy(true); setErr(null);
    try {
      const r = await act(`/state/${code}/facility/${facilityId}/cases`, body);
      router.push(`/cases/${r.case.case_id}`);
    } catch (e: any) { setErr(e.message); setBusy(false); }
  };
  const fac = data.people.filter((p: any) => p.level === "facility");
  const lga = data.people.filter((p: any) => p.level === "lga");

  return (
    <div className="card take-action">
      <div className="card-head">
        <div><h2>Take action</h2><p>Every flagged facility becomes a case with an owner, a playbook and a due date. People are synthetic.</p></div>
      </div>
      {err && <div className="simmsg err" role="alert">{err}</div>}
      {open.length > 0 && (
        <>
          <h3>Open cases</h3>
          <ul className="rec-list">
            {open.map((c: any) => (
              <li key={c.case_id}>
                <span><Link href={`/cases/${c.case_id}`}><strong>{c.case_ref}</strong> {PLAYBOOK_TITLE[c.playbook_id]}</Link>
                  <span className="muted"> · <PersonName name={c.owner_name} /> · due {dateLabel(c.due_at)}</span></span>
                <span className="act-row"><PriorityChip p={c.priority} /><StatusChip status={c.status} /></span>
              </li>
            ))}
          </ul>
        </>
      )}
      {data.recommended.filter((r: any) => !openBooks.has(r.playbook)).length > 0 && (
        <>
          <h3 style={{ marginTop: 12 }}>Recommended</h3>
          <ul className="rec-list">
            {data.recommended.filter((r: any) => !openBooks.has(r.playbook)).map((r: any) => (
              <li key={r.rule_id}>
                <span><strong>{r.title}</strong><span className="muted"> · owner {r.owner_title} · {r.priority}</span></span>
                <button className="btn sm primary" disabled={busy} onClick={() => start({ rule_id: r.rule_id })}>Open case</button>
              </li>
            ))}
          </ul>
        </>
      )}
      {open.length === 0 && data.recommended.length === 0 && <p className="muted">No rule calls for action at this facility this month.</p>}
      <div className="act-row" style={{ marginTop: 12 }}>
        <select aria-label="Choose a playbook" value={pb} onChange={(e) => setPb(e.target.value)}>
          <option value="">Start another playbook…</option>
          {data.playbooks.filter((p: any) => !openBooks.has(p.playbook)).map((p: any) => <option key={p.playbook} value={p.playbook}>{p.title}</option>)}
        </select>
        <button className="btn sm" disabled={!pb || busy} onClick={() => start({ playbook: pb })}>Open case</button>
      </div>
      {done.length > 0 && <p className="note">Closed: {done.map((c: any) => <Link key={c.case_id} href={`/cases/${c.case_id}`}>{c.case_ref} </Link>)}</p>}
      <div className="grid g-half" style={{ marginTop: 12, gap: 10 }}>
        <div><h3>At this facility</h3><ul className="people-list">{fac.map((p: any) => <li key={p.person_id}><PersonName name={p.name} /><small>{p.role_title} · {p.phone_display}</small></li>)}</ul></div>
        <div><h3>LGA team</h3><ul className="people-list">{lga.map((p: any) => <li key={p.person_id}><PersonName name={p.name} /><small>{p.role_title}</small></li>)}</ul></div>
      </div>
    </div>
  );
}
