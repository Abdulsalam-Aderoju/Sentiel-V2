import Link from "next/link";
import { int } from "@/lib/api";

/** Facility access panel: catchment, nearest alternative PHC, isolation. Real-derived (WorldPop, MAP, GRID3). */
export default function AccessCard({ code, a }: { code: string; a: any }) {
  const f = a.facility;
  const th = a.settings.main_threshold_minutes;
  if (!f.access_computed) {
    return (
      <div className="card access-card">
        <h2>Access to this PHC</h2>
        <p className="muted">Not computed: the GRID3 location is more than 5 km outside the facility's own LGA, so it is not used as a service point.</p>
      </div>
    );
  }
  const share = f.catchment_pop ? (f.catchment_pop_beyond_main ?? 0) / f.catchment_pop : null;
  return (
    <div className="card access-card">
      <div className="card-head">
        <div><h2>Access to this PHC</h2><p>Who lives nearest to it, and how far the next PHC is. <span className="real-chip"><span aria-hidden>◆</span>Real-derived</span></p></div>
        <Link className="btn sm" href={`/state/${code}/access`}>State access</Link>
      </div>
      {f.isolated && (
        <div className="note-box warn" role="note"><span aria-hidden>▲</span> <strong>Isolated PHC.</strong>{" "}
          {f.alt_walk_min != null ? `The next PHC is ${Math.round(f.alt_walk_min)} min walk away (more than ${th} min).` : "No other PHC is reachable on foot."}{" "}
          A shortage here cannot be covered by sending people elsewhere.</div>
      )}
      <dl className="facts">
        <div><dt>Catchment population</dt><dd className="num">{int(f.catchment_pop)}</dd><small>people whose nearest PHC is this one</small></div>
        <div><dt>Of whom beyond {th} min walk</dt><dd className="num">{int(f.catchment_pop_beyond_main)}</dd><small>{share != null ? `${Math.round(share * 100)}% of the catchment` : ""}</small></div>
        <div><dt>Average walk for the catchment</dt><dd className="num">{f.catchment_mean_walk_min != null ? `${Math.round(f.catchment_mean_walk_min)} min` : "n/a"}</dd>
          <small>{f.catchment_mean_motor_min != null ? `${Math.round(f.catchment_mean_motor_min)} min by motor vehicle` : ""}</small></div>
        <div><dt>Next nearest PHC</dt>
          <dd>{f.alt_facility_id ? <Link href={`/state/${f.alt_state_code ?? code}/facility/${f.alt_facility_id}`}>{f.alt_facility_name}</Link> : "none reachable"}</dd>
          <small>{f.alt_walk_min != null ? `${Math.round(f.alt_walk_min)} min walk · ${f.alt_km?.toFixed(1)} km` : ""}{f.alt_state_code && f.alt_state_code !== code ? " · in another state" : ""}</small></div>
      </dl>
      <p className="note">Catchment is geographic proximity (WorldPop 2026, MAP walking friction), not observed attendance.</p>
    </div>
  );
}
