"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { apiPost } from "@/lib/client";

function fmt(d: string) {
  return new Date(`${d.slice(0, 10)}T00:00:00`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
}

const SUMMARY: [string, string][] = [
  ["delivered_simulated", "delivered"], ["replies", "replies"], ["receipts", "receipts"], ["acknowledged_simulated", "acknowledged"],
  ["escalated", "escalated"], ["reminders_drafted", "reminders drafted"], ["resupply_delivered", "resupply delivered"],
  ["reports_ingested", "reports received"], ["digests_drafted", "digests drafted"], ["deferred_rate_limit", "held by rate limit"],
];

/** DEMO ONLY: the simulated operational date, and controls to advance it or reset the demo. */
export default function SimClock({ simDate, started, compact }: { simDate: string; started: string; compact?: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const day = Math.round((new Date(simDate).getTime() - new Date(started).getTime()) / 864e5);

  const tick = async (days: number) => {
    setBusy(`+${days}`); setErr(null);
    try {
      const r = await apiPost("/sim/tick", { days });
      const tot: Record<string, number> = {};
      for (const t of r.ticks) for (const [k, v] of Object.entries(t)) if (typeof v === "number") tot[k] = (tot[k] ?? 0) + (v as number);
      const parts = SUMMARY.filter(([k]) => tot[k]).map(([k, l]) => `${tot[k].toLocaleString("en-GB")} ${l}`);
      setMsg(`${days} day${days > 1 ? "s" : ""} simulated${parts.length ? `: ${parts.join(", ")}` : ": no new activity"}`);
      router.refresh();
    } catch (e: any) { setErr(e.message); } finally { setBusy(null); }
  };
  const reset = async () => {
    if (!confirm("Reset the action layer to the clean demo start? Every case, message and reply made since will be cleared.")) return;
    setBusy("reset"); setErr(null);
    try {
      await apiPost("/sim/reset?seed_demo=true");
      setMsg("Demo reset to the clean, seeded start");
      router.refresh();
    } catch (e: any) { setErr(e.message); } finally { setBusy(null); }
  };

  return (
    <div className={`simclock ${compact ? "compact" : ""}`} role="group" aria-label="Simulated clock">
      <div className="when">
        <span className="eyebrow">Simulated clock · day {day}</span>
        <strong>{fmt(simDate)}</strong>
      </div>
      <div className="btns">
        <button className="btn sm" onClick={() => tick(1)} disabled={!!busy} aria-busy={busy === "+1"}>{busy === "+1" ? "Simulating…" : "Advance 1 day"}</button>
        <button className="btn sm" onClick={() => tick(7)} disabled={!!busy} aria-busy={busy === "+7"}>{busy === "+7" ? "Simulating…" : "+7 days"}</button>
        {!compact && <button className="btn sm ghost" onClick={reset} disabled={!!busy}>{busy === "reset" ? "Resetting…" : "Reset demo"}</button>}
      </div>
      {(msg || err) && <div className={`simmsg ${err ? "err" : ""}`} role="status">{err ?? msg}</div>}
    </div>
  );
}
