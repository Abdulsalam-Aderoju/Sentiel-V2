"use client";
import Link from "next/link";
import { PLAYBOOK_TITLE } from "@/lib/actions";
import { StatusChip } from "./Chips";

const ROLE_OF: Record<string, string> = {
  R04_verify_then_act: "Verify then act: the reply confirms a shortage",
  R06_stale_nhlmis: "Do not assume safe: the reply confirms adequate stock",
  R03_fridge_down: "Fridge failure: inspection, then repaired",
  R01_act_now_commodity: "Nobody acts: escalates to the State LMCU Coordinator",
};

/** The curated demo scenario, so the stage loop is one click away. In the state portal it points to the LGA
 *  portal where the loop is played; inside the LGA portal it simply lists the four scripted cases. */
export default function DemoGuide({ cases, lgaPortal }: { cases: any[]; lgaPortal: { state: string; lga_id: string; lga: string } | null }) {
  if (!cases.length) return null;
  return (
    <div className="card demo-guide">
      <div className="card-head">
        <div>
          <h2>Demo scenario · {cases[0].lga} LGA</h2>
          <p>Four scripted cases play out the same way after every reset. Approve the drafts, then advance the simulated clock.</p>
        </div>
        {lgaPortal && (
          <Link className="btn primary sm" href={`/signin?role=lga&state=${lgaPortal.state}&lga=${lgaPortal.lga_id}`}>
            Play it in the {lgaPortal.lga} LGA portal <span aria-hidden>→</span>
          </Link>
        )}
      </div>
      <ol className="demo-steps">
        {cases.map((c) => (
          <li key={c.case_id}>
            <Link href={`/cases/${c.case_id}`}><strong>{c.case_ref}</strong> {c.unit_name}</Link>
            <span className="muted"> · {ROLE_OF[c.rule_id] ?? PLAYBOOK_TITLE[c.playbook_id]}</span>{" "}
            <StatusChip status={c.status} />
          </li>
        ))}
      </ol>
    </div>
  );
}
