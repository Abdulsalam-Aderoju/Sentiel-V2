"use client";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { MSG_STATUS, dateLabel } from "@/lib/actions";
import { act } from "@/lib/client";
import { PriorityChip, SimLabel, SynChip } from "./Chips";

const CHANNEL: Record<string, string> = { sms: "SMS", whatsapp: "WhatsApp", email: "Email", in_app: "In-app" };

export function Bubble({ m, reply }: { m: any; reply?: string | null }) {
  return (
    <div className="phone" aria-label={`Message to ${m.to_name}`}>
      <div className="phone-head">
        <span><strong>{m.to_name}</strong> <SynChip /></span>
        <span className="muted">{CHANNEL[m.channel] ?? m.channel} · {m.phone_display ?? ""}</span>
      </div>
      <div className="bubble out">
        {m.body}
        <div className="meta">{m.chars} chars{m.channel === "sms" ? " / 160" : ""} · {MSG_STATUS[m.status] ?? m.status}</div>
      </div>
      {reply && <div className="bubble in">{reply}<div className="meta">Simulated reply</div></div>}
      <div className="phone-foot"><SimLabel /></div>
    </div>
  );
}

/** Drafted messages awaiting a person's approval. Nothing is sent without it, and nothing is ever really sent. */
export function ApprovalTray({ messages, total }: { messages: any[]; total: number }) {
  const router = useRouter();
  const path = usePathname();
  const sp = useSearchParams();
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [preview, setPreview] = useState<any | null>(messages[0] ?? null);
  const set = (k: string, v: string | null) => {
    const p = new URLSearchParams(sp.toString());
    if (v) p.set(k, v); else p.delete(k);
    router.push(`${path}?${p.toString()}`, { scroll: false });
  };
  const approve = async (ids: string[]) => {
    setBusy(true); setMsg(null);
    try {
      const r = await act("/messages/approve", { message_ids: ids });
      setMsg(`${r.approved} message${r.approved === 1 ? "" : "s"} approved. They are delivered (simulated) when the clock advances.`);
      setSel(new Set());
      router.refresh();
    } catch (e: any) { setMsg(e.message); } finally { setBusy(false); }
  };
  const save = async (id: string) => {
    setBusy(true); setMsg(null);
    try {
      await act(`/messages/${id}/edit`, { body: draft });
      setEditing(null);
      router.refresh();
    } catch (e: any) { setMsg(e.message); } finally { setBusy(false); }
  };
  const over = draft.length > 160;

  return (
    <div className="grid tray">
      <div>
        <div className="toolbar">
          <div className="left">
            <select aria-label="Priority" value={sp.get("mprio") ?? ""} onChange={(e) => set("mprio", e.target.value || null)}>
              <option value="">All priorities</option><option value="P1">P1</option><option value="P2">P2</option><option value="P3">P3</option>
            </select>
            <select aria-label="Kind" value={sp.get("kind") ?? ""} onChange={(e) => set("kind", e.target.value || null)}>
              <option value="">All kinds</option><option value="step">Requests to facilities</option><option value="reminder">Reminders</option>
              <option value="notice">Case notices</option><option value="escalation">Escalation notices</option><option value="digest">Daily digests</option>
            </select>
          </div>
          <div className="right">
            <span className="muted">{total.toLocaleString("en-GB")} drafts</span>
            <button className="btn sm" disabled={busy || messages.length === 0} onClick={() => approve(messages.map((m) => m.message_id))}>Approve all shown ({messages.length})</button>
            <button className="btn sm primary" disabled={busy || sel.size === 0} onClick={() => approve([...sel])}>Approve selected ({sel.size})</button>
          </div>
        </div>
        {msg && <div className="simmsg" role="status">{msg}</div>}
        <div className="card" style={{ padding: 0, overflowX: "auto" }}>
          <table className="data">
            <thead><tr><th><input type="checkbox" aria-label="Select all" checked={messages.length > 0 && messages.every((m) => sel.has(m.message_id))}
              onChange={(e) => setSel(e.target.checked ? new Set(messages.map((m) => m.message_id)) : new Set())} /></th>
              <th>To</th><th>Message</th><th className="n">Chars</th><th /></tr></thead>
            <tbody>
              {messages.map((m) => (
                <tr key={m.message_id} className={preview?.message_id === m.message_id ? "row-active" : ""} onClick={() => setPreview(m)}>
                  <td onClick={(e) => e.stopPropagation()}><input type="checkbox" aria-label={`Select ${m.message_id}`} checked={sel.has(m.message_id)}
                    onChange={(e) => setSel((s) => { const n = new Set(s); e.target.checked ? n.add(m.message_id) : n.delete(m.message_id); return n; })} /></td>
                  <td style={{ minWidth: 160 }}>
                    <strong>{m.to_name}</strong> <SynChip />
                    <div className="muted" style={{ fontSize: 12 }}>{m.to_role} · {CHANNEL[m.channel]}</div>
                    <div style={{ marginTop: 4 }}><PriorityChip p={m.priority} /> {m.case_ref && <Link href={`/cases/${m.case_id}`} onClick={(e) => e.stopPropagation()}>{m.case_ref}</Link>}</div>
                  </td>
                  <td style={{ minWidth: 280 }}>
                    {editing === m.message_id ? (
                      <div onClick={(e) => e.stopPropagation()}>
                        <textarea className="msg-edit" value={draft} onChange={(e) => setDraft(e.target.value)} rows={3} aria-label="Edit message" />
                        <div className={over && m.channel === "sms" ? "chars over" : "chars"}>{draft.length}{m.channel === "sms" ? " / 160" : ""} characters</div>
                        <button className="btn sm primary" disabled={busy || (over && m.channel === "sms")} onClick={() => save(m.message_id)}>Save</button>{" "}
                        <button className="btn sm ghost" onClick={() => setEditing(null)}>Cancel</button>
                      </div>
                    ) : (
                      <>
                        <div className="msg-body">{m.body}</div>
                        <div className="muted" style={{ fontSize: 12 }}>{m.unit_name}</div>
                      </>
                    )}
                  </td>
                  <td className="n">{m.chars}</td>
                  <td onClick={(e) => e.stopPropagation()} style={{ whiteSpace: "nowrap" }}>
                    <button className="btn sm" onClick={() => { setEditing(m.message_id); setDraft(m.body); }}>Edit</button>{" "}
                    <button className="btn sm primary" disabled={busy} onClick={() => approve([m.message_id])}>Approve</button>
                  </td>
                </tr>
              ))}
              {messages.length === 0 && <tr><td colSpan={5} className="empty">No drafts waiting. Everything drafted has been approved.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
      <aside className="tray-preview">
        <div className="eyebrow">Preview as it would arrive</div>
        {preview ? <Bubble m={preview} /> : <div className="empty">Select a message</div>}
        <p className="note">Every message is drafted by the system and approved by a person. This demo never sends anything: it is delivered only on the simulated clock.</p>
      </aside>
    </div>
  );
}

export function Outbox({ messages }: { messages: any[] }) {
  const [view, setView] = useState<"phone" | "table">("phone");
  return (
    <div>
      <div className="toolbar">
        <div className="left">
          <div className="seg" role="group" aria-label="View">
            <button aria-pressed={view === "phone"} onClick={() => setView("phone")}>Phone view</button>
            <button aria-pressed={view === "table"} onClick={() => setView("table")}>Table</button>
          </div>
          <SimLabel />
        </div>
      </div>
      {messages.length === 0 ? <div className="card empty">Nothing sent yet. Approve drafts, then advance the simulated clock.</div> :
        view === "phone" ? (
          <div className="phones">{messages.map((m) => <Bubble key={m.message_id} m={m} reply={m.reply_text} />)}</div>
        ) : (
          <div className="card" style={{ padding: 0, overflowX: "auto" }}>
            <table className="data">
              <thead><tr><th>Sent</th><th>To</th><th>Message</th><th>Status</th><th>Reply</th></tr></thead>
              <tbody>
                {messages.map((m) => (
                  <tr key={m.message_id}>
                    <td>{dateLabel(m.sent_at)}</td>
                    <td><strong>{m.to_name}</strong> <SynChip /><div className="muted" style={{ fontSize: 12 }}>{m.to_role}</div></td>
                    <td style={{ minWidth: 260 }}>{m.body}{m.case_ref && <div><Link href={`/cases/${m.case_id}`}>{m.case_ref}</Link></div>}</td>
                    <td>{MSG_STATUS[m.status] ?? m.status}</td>
                    <td>{m.reply_text ?? <span className="muted">none yet</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
    </div>
  );
}

export function Inbox({ responses }: { responses: any[] }) {
  const router = useRouter();
  const [text, setText] = useState<Record<string, string>>({});
  const [err, setErr] = useState<string | null>(null);
  const review = async (id: string, dismiss = false) => {
    setErr(null);
    try {
      await act(`/responses/${id}/review`, dismiss ? { dismiss: true } : { corrected_text: text[id] });
      router.refresh();
    } catch (e: any) { setErr(e.message); }
  };
  const PARSE: Record<string, string> = { ok: "Understood", partial: "Partly understood", unparseable: "Not understood" };
  return (
    <div className="card" style={{ padding: 0, overflowX: "auto" }}>
      {err && <div className="simmsg err" role="alert">{err}</div>}
      <table className="data">
        <thead><tr><th>Received</th><th>From</th><th>Reply</th><th>Parsed</th><th>Case</th></tr></thead>
        <tbody>
          {responses.map((r) => (
            <tr key={r.response_id}>
              <td>{dateLabel(r.received_at)}</td>
              <td><strong>{r.from_name}</strong> <SynChip /><div className="muted" style={{ fontSize: 12 }}>{r.unit_name}</div></td>
              <td><code className="reply-raw">{r.raw_text}</code>{r.synthetic && <div className="muted" style={{ fontSize: 11.5 }}>Simulated reply</div>}</td>
              <td style={{ minWidth: 220 }}>
                <strong>{PARSE[r.parse_status]}</strong>
                {r.parsed?.fields && Object.keys(r.parsed.fields).length > 0 && (
                  <div className="muted" style={{ fontSize: 12 }}>{Object.entries(r.parsed.fields).map(([k, v]) => `${k} ${typeof v === "object" ? JSON.stringify(v) : v}`).join(" · ")}</div>
                )}
                {r.review_status === "needs_review" && (
                  <div className="review-box">
                    <label className="muted" style={{ fontSize: 12 }}>What does it say? Type it in the reply format.
                      <input type="text" placeholder="e.g. ACT 20 RDT 50 FRIDGE 1" value={text[r.response_id] ?? ""}
                        onChange={(e) => setText((t) => ({ ...t, [r.response_id]: e.target.value }))} />
                    </label>
                    <button className="btn sm primary" disabled={!text[r.response_id]} onClick={() => review(r.response_id)}>Apply reading</button>{" "}
                    <button className="btn sm ghost" onClick={() => review(r.response_id, true)}>Dismiss</button>
                  </div>
                )}
                {r.review_status === "reviewed" && <div className="muted" style={{ fontSize: 12 }}>Reviewed by a person</div>}
              </td>
              <td>{r.case_ref && <Link href={`/cases/${r.case_id}`}>{r.case_ref}</Link>}</td>
            </tr>
          ))}
          {responses.length === 0 && <tr><td colSpan={5} className="empty">No replies yet. Approve requests and advance the simulated clock.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}
