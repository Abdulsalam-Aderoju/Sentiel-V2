import type { Metadata } from "next";
import Link from "next/link";
import MonthPicker from "@/components/MonthPicker";
import BeyondQueue from "@/components/national/BeyondQueue";
import NationalCommand from "@/components/national/NationalCommand";
import { SimChip } from "@/components/Tags";
import { api, apiOrNull, monthLabel } from "@/lib/api";

export const metadata: Metadata = { title: "National Command Centre" };

/** National Command Centre: state-level aggregates only. Facility detail is one click
 * away in each state portal. Payloads are precomputed state marts (a few KB). */
export default async function National({ searchParams }: {
  searchParams: Promise<{ month?: string; metric?: string; state?: string; zone?: string; q?: string; sort?: string }>;
}) {
  const sp = await searchParams;
  const meta = await api("/meta/months");
  const month = sp.month ?? meta.latest;
  const [summary, st, geo, actions] = await Promise.all([api("/national/summary", month), api("/national/states", month),
    api("/national/geo"), apiOrNull("/national/actions/summary")]);

  return (
    <>
      <div className="page-head">
        <div>
          <div className="crumbs"><span>National</span><span className="sep">/</span><span>{monthLabel(month, true)} analysis</span></div>
          <h1>National Command Centre</h1>
          <div className="secondary" style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            {summary.kpis.states} states across all six geopolitical zones · state-level summaries only, never individual clinics
            <SimChip />
          </div>
        </div>
        <div className="actions">
          <MonthPicker months={meta.months} value={month} />
          <Link className="btn primary" href={`/national/briefing?month=${month}`}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden><rect x="3" y="4" width="18" height="13" rx="2" /><path d="M8 21h8M12 17v4" /></svg>
            Briefing mode
          </Link>
        </div>
      </div>
      <BeyondQueue actions={actions} kpis={summary.kpis} />
      <NationalCommand key={month} summary={summary} states={st.states} geo={geo}
        initial={{ metric: sp.metric, state: sp.state, zone: sp.zone, q: sp.q, sort: sp.sort }} />
    </>
  );
}
