import type { Metadata } from "next";
import Link from "next/link";
import { CaseRow } from "@/components/actions/CaseBoard";
import { SynChip } from "@/components/actions/Chips";
import SimClock from "@/components/actions/SimClock";
import { apiOrNull } from "@/lib/api";
import { personaId } from "@/lib/persona";

export const metadata: Metadata = { title: "My cases" };

/** Cases owned by, or escalated to, the acting persona. */
export default async function MyCases() {
  const id = await personaId();
  const d = id ? await apiOrNull(`/me/cases?persona_id=${encodeURIComponent(id)}`) : null;
  if (!d) {
    return (
      <div className="card" style={{ maxWidth: 640, margin: "32px auto", textAlign: "center", padding: 28 }}>
        <div className="eyebrow">My cases</div>
        <h1 style={{ marginTop: 6 }}>Sign in first</h1>
        <p className="secondary">Sign in to a portal to see the cases you own or that were escalated to you.</p>
      </div>
    );
  }
  const p = d.persona;
  const home = p.level === "lga" ? `/state/${p.state_code}/lga/${p.lga_id}/actions` : p.state_code ? `/state/${p.state_code}/actions` : "/national/responses";
  return (
    <>
      <div className="page-head">
        <div>
          <div className="crumbs"><span>My cases</span></div>
          <h1>{p.name}<SynChip /></h1>
          <div className="secondary">{p.role_code} · {p.lga ?? p.state_code ?? "National"} · {d.cases.length} case{d.cases.length === 1 ? "" : "s"} owned or escalated to you · {d.open_in_scope.toLocaleString("en-GB")} open in your scope · {d.drafts_in_scope.toLocaleString("en-GB")} drafts to approve</div>
        </div>
        <div className="actions">
          <SimClock simDate={d.clock.sim_date} started={d.clock.started} compact />
          <Link className="btn primary" href={home}>{p.state_code ? "Open my Action Centre" : "State responses"}</Link>
        </div>
      </div>
      <div className="card" style={{ padding: 0, overflowX: "auto" }}>
        <table className="data case-table">
          <thead><tr><th>Case</th><th>Facility / unit</th><th>Playbook</th><th>Owner</th><th>Status</th></tr></thead>
          <tbody>
            {d.cases.map((c: any) => <CaseRow key={c.case_id} c={c} />)}
            {d.cases.length === 0 && <tr><td colSpan={5} className="empty">Nothing assigned to you. {p.level === "facility" ? "Requests to your facility appear on its cases." : "Cases escalate to you when nobody acts in time."}</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}
