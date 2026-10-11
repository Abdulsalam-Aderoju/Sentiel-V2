"use client";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { CASE_STATUS, KANBAN, PLAYBOOK_TITLE, RULE_SHORT, dateLabel } from "@/lib/actions";
import { act } from "@/lib/client";
import { QueueTag } from "@/components/Tags";
import { PersonName, PriorityChip, StatusChip } from "./Chips";

function LiveDelta({ c }: { c: any }) {
  if (!c.live_changed) return null;
  return <span className="live-delta" title="Live status differs from the monthly assessment">Live: {c.live_tag?.toLowerCase()}{c.field_verified ? " (field-verified)" : ""}</span>;
}

export function CaseRow({ c, sel, onSel }: { c: any; sel?: boolean; onSel?: (v: boolean) => void }) {
  return (
    <tr className={c.demo ? "demo-row" : ""}>
      {onSel && <td><input type="checkbox" aria-label={`Select ${c.case_ref}`} checked={!!sel} onChange={(e) => onSel(e.target.checked)} /></td>}
      <td style={{ whiteSpace: "nowrap" }}>
        <Link href={`/cases/${c.case_id}`}><strong>{c.case_ref}</strong></Link>
        {c.demo && <span className="demo-badge" title="Part of the curated demo scenario">Demo</span>}
        <div style={{ marginTop: 4 }}><PriorityChip p={c.priority} /></div>
      </td>
      <td style={{ minWidth: 190 }}>
        <strong>{c.unit_name}</strong>
        <div className="muted" style={{ fontSize: 12 }}>{c.level === "facility" ? c.lga : c.level === "lga" ? "LGA case" : "State case"}</div>
        <div style={{ marginTop: 4, display: "flex", gap: 6, flexWrap: "wrap" }}>{c.tag && <QueueTag tag={c.tag} />}<LiveDelta c={c} /></div>
      </td>
      <td style={{ minWidth: 180 }}>
        <div>{PLAYBOOK_TITLE[c.playbook_id] ?? c.playbook_id}</div>
        <div className="muted" style={{ fontSize: 12 }}>{RULE_SHORT[c.rule_id] ?? c.rule_id}</div>
        {c.evidence_summary && <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>{c.evidence_summary}</div>}
      </td>
      <td style={{ minWidth: 150 }}>
        <PersonName name={c.owner_name} />
        {c.escalation_level > 0 && (
          <div className="esc-note">▲ Escalated {c.escalation_level}× → {c.escalated_to_name}</div>
        )}
      </td>
      <td style={{ minWidth: 130 }}>
        <StatusChip status={c.status} />
        <div className={c.overdue ? "due overdue" : "due"}>{c.overdue ? "Overdue · " : "Due "}{dateLabel(c.due_at)}</div>
        {c.drafts > 0 && <div className="muted" style={{ fontSize: 12 }}>{c.drafts} draft{c.drafts > 1 ? "s" : ""} to approve</div>}
        {c.review_task && <div className="review-flag">Reply needs review</div>}
      </td>
    </tr>
  );
}

export default function CaseBoard({ cases, total, view, lgas, byStatus }: {
  cases: any[]; total: number; view: "list" | "kanban"; lgas: { lga_id: string; lga: string }[]; byStatus: Record<string, number>;
}) {
  const router = useRouter();
  const path = usePathname();
  const sp = useSearchParams();
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const set = (k: string, v: string | null) => {
    const p = new URLSearchParams(sp.toString());
    if (v) p.set(k, v); else p.delete(k);
    p.delete("page");
    router.push(`${path}?${p.toString()}`, { scroll: false });
  };
  const toggle = (id: string, v: boolean) => setSel((s) => { const n = new Set(s); v ? n.add(id) : n.delete(id); return n; });
  const bulk = async (action: string) => {
    setBusy(true); setMsg(null);
    try {
      const r = await act("/cases/bulk", { action, case_ids: [...sel] });
      setMsg(`${r.done} case${r.done === 1 ? "" : "s"} updated`);
      setSel(new Set());
      router.refresh();
    } catch (e: any) { setMsg(e.message); } finally { setBusy(false); }
  };
  const page = Number(sp.get("page") ?? 0);

  return (
    <div>
      <div className="toolbar">
        <div className="left">
          <div className="seg" role="group" aria-label="View">
            <button aria-pressed={view === "list"} onClick={() => set("view", null)}>List</button>
            <button aria-pressed={view === "kanban"} onClick={() => set("view", "kanban")}>Kanban</button>
          </div>
          <select aria-label="Priority" value={sp.get("priority") ?? ""} onChange={(e) => set("priority", e.target.value || null)}>
            <option value="">All priorities</option><option value="P1">P1 urgent</option><option value="P2">P2 high</option><option value="P3">P3 routine</option>
          </select>
          <select aria-label="LGA" value={sp.get("lga_id") ?? ""} onChange={(e) => set("lga_id", e.target.value || null)}>
            <option value="">All LGAs</option>
            {lgas.map((l) => <option key={l.lga_id} value={l.lga_id}>{l.lga}</option>)}
          </select>
          <select aria-label="Rule" value={sp.get("rule") ?? ""} onChange={(e) => set("rule", e.target.value || null)}>
            <option value="">All rules</option>
            {Object.entries(RULE_SHORT).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <div className="chips" role="group" aria-label="Quick filters">
            <button className="chip-btn" aria-pressed={sp.get("overdue") === "true"} onClick={() => set("overdue", sp.get("overdue") ? null : "true")}>Overdue</button>
            <button className="chip-btn" aria-pressed={sp.get("escalated") === "true"} onClick={() => set("escalated", sp.get("escalated") ? null : "true")}>Escalated</button>
            <button className="chip-btn" aria-pressed={sp.get("demo") === "true"} onClick={() => set("demo", sp.get("demo") ? null : "true")}>Demo scenario</button>
          </div>
        </div>
        <div className="right">
          <label className="search">
            <span className="sr-only">Search cases</span>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
            <input type="search" placeholder="Facility, LGA or case ref" defaultValue={sp.get("q") ?? ""}
              onKeyDown={(e) => { if (e.key === "Enter") set("q", (e.target as HTMLInputElement).value || null); }} />
          </label>
          <select aria-label="Sort" value={sp.get("sort") ?? "priority"} onChange={(e) => set("sort", e.target.value === "priority" ? null : e.target.value)}>
            <option value="priority">Sort: priority</option><option value="due">Sort: due date</option>
            <option value="impact">Sort: impact-weighted</option><option value="opened">Sort: newest</option>
          </select>
        </div>
      </div>

      {view === "list" ? (
        <>
          {sel.size > 0 && (
            <div className="bulkbar" role="region" aria-label="Bulk actions">
              <strong>{sel.size} selected</strong>
              <button className="btn sm" disabled={busy} onClick={() => bulk("acknowledge")}>Acknowledge</button>
              <button className="btn sm primary" disabled={busy} onClick={() => bulk("approve_messages")}>Approve their draft messages</button>
              <button className="btn sm ghost" onClick={() => setSel(new Set())}>Clear</button>
              {msg && <span className="muted">{msg}</span>}
            </div>
          )}
          <div className="card" style={{ padding: 0, overflowX: "auto" }}>
            <table className="data case-table">
              <thead><tr>
                <th><input type="checkbox" aria-label="Select all on page" checked={cases.length > 0 && cases.every((c) => sel.has(c.case_id))}
                  onChange={(e) => setSel(e.target.checked ? new Set(cases.map((c) => c.case_id)) : new Set())} /></th>
                <th>Case</th><th>Facility / unit</th><th>Playbook</th><th>Owner</th><th>Status</th>
              </tr></thead>
              <tbody>
                {cases.map((c) => <CaseRow key={c.case_id} c={c} sel={sel.has(c.case_id)} onSel={(v) => toggle(c.case_id, v)} />)}
                {cases.length === 0 && <tr><td colSpan={6} className="empty">No cases match these filters.</td></tr>}
              </tbody>
            </table>
          </div>
          <div className="pager">
            <span className="muted">{total === 0 ? "0" : `${page * 50 + 1}–${Math.min(total, (page + 1) * 50)}`} of {total.toLocaleString("en-GB")} cases</span>
            <button className="btn sm" disabled={page === 0} onClick={() => set("page", String(page - 1))}>← Previous</button>
            <button className="btn sm" disabled={(page + 1) * 50 >= total} onClick={() => set("page", String(page + 1))}>Next →</button>
          </div>
        </>
      ) : (
        <div className="kanban">
          {KANBAN.map((st) => {
            const col = cases.filter((c) => c.status === st);
            const S = CASE_STATUS[st];
            return (
              <section key={st} className="kcol" aria-label={S.label}>
                <header><span aria-hidden style={{ color: S.color }}>{S.icon}</span> {S.label}<span className="count">{(byStatus[st] ?? 0).toLocaleString("en-GB")}</span></header>
                {col.slice(0, 25).map((c) => (
                  <Link key={c.case_id} href={`/cases/${c.case_id}`} className={`kcard ${c.demo ? "demo" : ""}`}>
                    <div className="top"><strong>{c.case_ref}</strong><PriorityChip p={c.priority} /></div>
                    <div className="name">{c.unit_name}</div>
                    <div className="muted">{PLAYBOOK_TITLE[c.playbook_id]}</div>
                    <div className="foot">
                      <span>{c.owner_name?.split(" ").slice(-1)[0]}</span>
                      <span className={c.overdue ? "overdue" : ""}>{c.overdue ? "Overdue" : `Due ${dateLabel(c.due_at)}`}</span>
                    </div>
                    {c.escalation_level > 0 && <div className="esc-note">▲ Escalated to {c.escalated_to_name}</div>}
                  </Link>
                ))}
                {col.length === 0 && <div className="muted kempty">None on this page</div>}
                {(byStatus[st] ?? 0) > Math.min(col.length, 25) && <div className="muted kmore">Showing {Math.min(col.length, 25)} of {(byStatus[st] ?? 0).toLocaleString("en-GB")}; filter to narrow</div>}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
