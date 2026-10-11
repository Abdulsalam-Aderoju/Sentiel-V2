import { QueueTag } from "@/components/Tags";
import { dateLabel } from "@/lib/actions";

/** Monthly assessment vs live status. Live = baseline + field verifications from the last 14 days. */
export default function LiveStatus({ live }: { live: any }) {
  const changed = live.changed;
  return (
    <div className={`card live-card ${changed ? "changed" : ""}`}>
      <div className="card-head"><div><h2>Monthly assessment vs live</h2>
        <p>{live.field_verified ? `Field-verified ${dateLabel(live.verified_at)} (${String(live.verification_source).replace("_", " ")})` : "No field evidence in the last 14 days: live equals the monthly assessment"}</p></div></div>
      <div className="live-grid">
        <div>
          <div className="eyebrow">Monthly assessment ({live.analysis_month})</div>
          <QueueTag tag={live.baseline_tag} />
          <div className="muted" style={{ fontSize: 12.5, marginTop: 4 }}>{live.baseline_risk?.toLowerCase()} risk · {live.baseline_confidence?.toLowerCase()} confidence</div>
        </div>
        <div className="arrow" aria-hidden>→</div>
        <div>
          <div className="eyebrow">Live</div>
          <QueueTag tag={live.live_tag} />{live.field_verified && <span className="fv">field-verified</span>}
          <div className="muted" style={{ fontSize: 12.5, marginTop: 4 }}>{live.live_risk?.toLowerCase()} risk · {live.live_confidence?.toLowerCase()} confidence</div>
        </div>
      </div>
      {live.live_reasons?.length > 0 && <ul className="evidence" style={{ marginTop: 10 }}>{live.live_reasons.map((r: string, i: number) => <li key={i}>{r}</li>)}</ul>}
      {live.nhlmis_stale && live.field_verified && <p className="note">The overdue NHLMIS report stays visible as stale context; a field count is never treated as a reconciled stock report.</p>}
    </div>
  );
}
