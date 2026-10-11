"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { PLAYBOOK_TITLE } from "@/lib/actions";
import { getPersonaId, setPersonaId } from "@/lib/client";
import { StatusChip } from "./Chips";

const ROLE_OF: Record<string, string> = {
  R04_verify_then_act: "Verify then act: the reply confirms a shortage",
  R06_stale_nhlmis: "Do not assume safe: the reply confirms adequate stock",
  R03_fridge_down: "Fridge failure: inspection, then repaired",
  R01_act_now_commodity: "Nobody acts: escalates to the State LMCU Coordinator",
};

/** The curated demo scenario, so the stage loop is one click away. */
export default function DemoGuide({ cases, coordinator }: { cases: any[]; coordinator: { person_id: string; name: string; lga: string } | null }) {
  const router = useRouter();
  const [acting, setActing] = useState(false);
  useEffect(() => {
    const read = () => setActing(!!coordinator && getPersonaId() === coordinator.person_id);
    read();
    window.addEventListener("persona-change", read);
    return () => window.removeEventListener("persona-change", read);
  }, [coordinator]);
  if (!cases.length) return null;
  const actAs = () => { if (coordinator) { setPersonaId(coordinator.person_id); router.refresh(); } };
  return (
    <div className="card demo-guide">
      <div className="card-head">
        <div>
          <h2>Demo scenario · {cases[0].lga} LGA</h2>
          <p>Four scripted cases play out the same way after every reset. Approve the drafts, then advance the simulated clock.</p>
        </div>
        {coordinator && (
          <button className="btn primary sm" onClick={actAs} disabled={!!acting}>
            {acting ? `Acting as ${coordinator.name}` : `Act as ${coordinator.name}, LGA PHC Coordinator`}
          </button>
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
