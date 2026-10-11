"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { act, getPersonaId } from "@/lib/client";

/** R10 (suggest mode): a national officer opens a state response case. Never automatic (D24). */
export default function RequestResponse({ s, compact }: { s: any; compact?: boolean }) {
  const router = useRouter();
  const [persona, setPersona] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string; href?: string } | null>(null);
  useEffect(() => {
    const read = () => setPersona(getPersonaId());
    read();
    window.addEventListener("persona-change", read);
    return () => window.removeEventListener("persona-change", read);
  }, []);
  if (!s.response_suggested && !s.state_case_id) return null;
  const national = !!persona && persona.startsWith("P-NG-");
  const open = s.state_case_id && !["resolved", "closed_no_action", "closed_duplicate"].includes(s.state_case_status);
  const go = async () => {
    setBusy(true); setMsg(null);
    try {
      const d = await act(`/national/states/${s.state_code}/request-response`);
      setMsg({ ok: true, text: `Opened ${d.case.case_ref}; the State Director of PHC is asked to name a lead and submit a plan.`, href: `/cases/${d.case.case_id}` });
      setTimeout(() => router.refresh(), 3000);   // leave the confirmation readable, then update the lists
    } catch (e: any) { setMsg({ ok: false, text: e.message }); }
    setBusy(false);
  };
  if (compact) {
    return (
      <span className="rr-inline">
        <button className="btn primary sm" onClick={go} disabled={busy || !national}>{busy ? "Opening…" : "Request response"}</button>
        {msg && <span className={msg.ok ? "simmsg ok" : "simmsg err"} role="status">{msg.text}</span>}
      </span>
    );
  }
  return (
    <div className="brief-sec request-box">
      <h3>State response <small>national action</small></h3>
      {open ? (
        <p>Response case <Link href={`/cases/${s.state_case_id}`}>{s.state_case_ref}</Link> is {String(s.state_case_status).replace(/_/g, " ")}. <Link href="/national/responses">See all responses</Link></p>
      ) : (
        <>
          <p>Suggested: {s.response_suggested}. A national officer decides whether to ask the state for a response plan; nothing is sent automatically.</p>
          <button className="btn primary sm" onClick={go} disabled={busy || !national}>{busy ? "Opening…" : "Request state response"}</button>
          {!national && <p className="note">Only a national officer can request a response.</p>}
        </>
      )}
      {msg && <p className={msg.ok ? "simmsg ok" : "simmsg err"} role="status">{msg.text} {msg.href && <Link href={msg.href}>Open case</Link>}</p>}
    </div>
  );
}
