import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LgaCrumbs, LgaTabs } from "@/components/LgaNav";
import { SimChip } from "@/components/Tags";
import ActionCentreView, { loadSummary } from "@/components/actions/ActionCentreView";
import { SimLabel } from "@/components/actions/Chips";
import SimClock from "@/components/actions/SimClock";

type P = { params: Promise<{ code: string; id: string }>; searchParams: Promise<Record<string, string | undefined>> };

export const metadata: Metadata = { title: "LGA Action Centre" };

/** LGA Action Centre: the cases, messages and replies of one LGA, nothing else. */
export default async function LgaActionCentre({ params, searchParams }: P) {
  const { code, id } = await params;
  const sp = await searchParams;
  const s = await loadSummary(code);
  const lga = s.lgas.find((l: any) => l.lga_id === id);
  if (!lga) notFound();
  return (
    <>
      <div className="page-head">
        <div>
          <LgaCrumbs code={code} stateName={s.state.name} lgaId={id} lgaName={lga.lga} here="Action Centre" />
          <h1>{lga.lga} LGA Action Centre</h1>
          <div className="secondary" style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            The cases for the clinics in your LGA. Approve each drafted message before it goes; nothing is really sent.
            <SimChip /> <SimLabel text="Messages simulated" />
          </div>
        </div>
        <SimClock simDate={s.clock.sim_date} started={s.clock.started} />
      </div>
      <LgaTabs code={code} lgaId={id} active="actions" />
      <ActionCentreView code={code} lgaId={id} sp={sp} summary={s} />
    </>
  );
}
