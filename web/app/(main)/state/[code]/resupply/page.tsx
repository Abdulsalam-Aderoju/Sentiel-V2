import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import StateTabs from "@/components/StateTabs";
import { SimChip } from "@/components/Tags";
import { dateLabel } from "@/lib/actions";
import { apiOrNull } from "@/lib/api";

type P = { params: Promise<{ code: string }>; searchParams: Promise<{ status?: string; case?: string }> };

export async function generateMetadata({ params }: P): Promise<Metadata> {
  return { title: `Resupply requests · ${(await params).code}` };
}

const STATUS: Record<string, string> = { draft: "Draft (parallel to verification)", pending_approval: "Awaiting approval", approved: "Approved, in transit",
  delivered: "Delivered", cancelled: "Cancelled" };

/** Printable resupply requests for the State LMCU, with a CSV export. Synthetic, not real orders. */
export default async function Resupply({ params, searchParams }: P) {
  const { code } = await params;
  const sp = await searchParams;
  const d = await apiOrNull(`/state/${code}/resupply-requests`, undefined, sp.status ? { status: sp.status } : undefined);
  if (!d) notFound();
  const rows = sp.case ? d.requests.filter((r: any) => r.case_id === sp.case) : d.requests;
  const counts: Record<string, number> = {};
  for (const r of d.requests) counts[r.status] = (counts[r.status] ?? 0) + 1;

  return (
    <>
      <div className="page-head">
        <div>
          <div className="crumbs no-print"><Link href={`/state/${code}`}>{d.state.name} State</Link><span className="sep">/</span><span>Resupply</span></div>
          <h1>{d.state.name} resupply requests</h1>
          <div className="secondary">Pre-filled from NHLMIS quantity to order or recent consumption; each is approved by a person. As of {dateLabel(d.clock.sim_date)} (simulated clock). <SimChip /></div>
          <p className="print-only"><strong>DEMONSTRATION: synthetic requests, not real orders.</strong></p>
        </div>
        <div className="actions no-print">
          <a className="btn" href={`/api/state/${code}/resupply-requests.csv${sp.status ? `?status=${sp.status}` : ""}`}>Download CSV</a>
          <button className="btn primary" type="button" data-print>Print</button>
        </div>
      </div>
      <div className="no-print"><StateTabs code={code} active="resupply" /></div>
      <div className="chips no-print" style={{ marginBottom: 12 }}>
        <Link className="chip-btn" aria-pressed={!sp.status} href={`/state/${code}/resupply`}>All ({d.requests.length})</Link>
        {Object.entries(STATUS).map(([k, v]) => counts[k] ? <Link key={k} className="chip-btn" aria-pressed={sp.status === k} href={`/state/${code}/resupply?status=${k}`}>{v} ({counts[k]})</Link> : null)}
      </div>
      <div className="card" style={{ padding: 0, overflowX: "auto" }}>
        <table className="data">
          <thead><tr><th>Request</th><th>Facility</th><th>Item</th><th className="n">Quantity</th><th>Basis</th><th>Status</th><th>Requested by</th></tr></thead>
          <tbody>
            {rows.map((r: any) => (
              <tr key={r.request_id}>
                <td>{r.request_id}<div><Link href={`/cases/${r.case_id}`}>{r.case_ref}</Link></div></td>
                <td><strong>{r.facility}</strong><div className="muted" style={{ fontSize: 12 }}>{r.lga} · {r.ward}</div></td>
                <td>{r.commodity_code}</td>
                <td className="n">{Math.round(r.qty_requested).toLocaleString("en-GB")}</td>
                <td className="muted">{r.basis}</td>
                <td>{STATUS[r.status] ?? r.status}{r.expected_delivery && r.status === "approved" ? `, due ${dateLabel(r.expected_delivery)}` : ""}</td>
                <td>{r.requested_by}{r.approved_by && <div className="muted" style={{ fontSize: 12 }}>approved by {r.approved_by}</div>}</td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={7} className="empty">No resupply requests{sp.status ? " with this status" : ""} yet.</td></tr>}
          </tbody>
        </table>
      </div>
      <script dangerouslySetInnerHTML={{ __html: "document.querySelectorAll('[data-print]').forEach(b=>b.addEventListener('click',()=>window.print()))" }} />
    </>
  );
}
