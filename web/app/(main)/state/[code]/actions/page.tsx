import type { Metadata } from "next";
import StateTabs from "@/components/StateTabs";
import { SimChip } from "@/components/Tags";
import ActionCentreView, { loadSummary } from "@/components/actions/ActionCentreView";
import { SimLabel } from "@/components/actions/Chips";
import SimClock from "@/components/actions/SimClock";
import Link from "next/link";

type P = { params: Promise<{ code: string }>; searchParams: Promise<Record<string, string | undefined>> };

export async function generateMetadata({ params }: P): Promise<Metadata> {
  const { code } = await params;
  return { title: `Action Centre · ${code}` };
}

/** State board Action Centre: every queued facility in the state is a case with an owner, a playbook,
 *  a due date and drafted messages. */
export default async function ActionCentre({ params, searchParams }: P) {
  const { code } = await params;
  const sp = await searchParams;
  const s = await loadSummary(code);
  return (
    <>
      <div className="page-head">
        <div>
          <div className="crumbs">
            <Link href={`/state/${code}`}>{s.state.name} State</Link><span className="sep">/</span><span>Action Centre</span>
          </div>
          <h1>{s.state.name} Action Centre</h1>
          <div className="secondary" style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            Cases opened from the {s.clock.baseline_month} assessment. Owners and messages are synthetic; nothing is sent.
            <SimChip /> <SimLabel text="Messages simulated" />
          </div>
        </div>
        <SimClock simDate={s.clock.sim_date} started={s.clock.started} />
      </div>
      <StateTabs code={code} active="actions" />
      <ActionCentreView code={code} sp={sp} summary={s} />
    </>
  );
}
