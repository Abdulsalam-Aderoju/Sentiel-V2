"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { act } from "@/lib/client";

/** Bulk actions for an LGA queue. Reads the server-rendered checkboxes named "fac". */
export default function QueueBulk() {
  const router = useRouter();
  const [n, setN] = useState(0);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const boxes = () => Array.from(document.querySelectorAll<HTMLInputElement>('input[name="fac"]'));
  useEffect(() => {
    const upd = () => setN(boxes().filter((b) => b.checked).length);
    document.addEventListener("change", upd);
    return () => document.removeEventListener("change", upd);
  }, []);
  const all = (v: boolean) => { boxes().forEach((b) => (b.checked = v)); setN(v ? boxes().length : 0); };
  const run = async (body: any, label: string) => {
    const ids = boxes().filter((b) => b.checked).map((b) => b.value);
    if (!ids.length) return;
    setBusy(true); setMsg(null);
    try {
      const r = await act("/cases/bulk", { ...body, facility_ids: ids });
      setMsg(`${label}: ${r.opened.length} case${r.opened.length === 1 ? "" : "s"} opened with drafted messages${r.already_open ? `; ${r.already_open} already had an open case` : ""}. Approve them in the Action Centre.`);
      all(false);
      router.refresh();
    } catch (e: any) { setMsg(e.message); } finally { setBusy(false); }
  };
  return (
    <div className="bulkbar" role="region" aria-label="Bulk actions" style={{ background: n ? undefined : "var(--surface-2)", borderColor: n ? undefined : "var(--border)" }}>
      <label style={{ display: "flex", gap: 6, alignItems: "center" }}><input type="checkbox" onChange={(e) => all(e.target.checked)} checked={n > 0 && n === boxes().length} aria-label="Select all" /> Select all</label>
      <strong>{n} selected</strong>
      <button className="btn sm primary" disabled={!n || busy} onClick={() => run({ action: "open_recommended" }, "Recommended playbooks")}>Open cases with recommended playbook</button>
      <button className="btn sm" disabled={!n || busy} onClick={() => run({ action: "open_playbook", playbook: "PB_VERIFY_STOCK" }, "Verification SMS")}>Draft verification SMS to selected</button>
      {msg && <span className="muted" role="status">{msg}</span>}
    </div>
  );
}
