import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import StateTabs from "@/components/StateTabs";
import { SynChip } from "@/components/actions/Chips";
import { api, apiOrNull } from "@/lib/api";

type P = { params: Promise<{ code: string }>; searchParams: Promise<{ q?: string; role?: string; lga_id?: string; level?: string; page?: string }> };

export async function generateMetadata({ params }: P): Promise<Metadata> {
  return { title: `People · ${(await params).code}` };
}

const CHANNEL: Record<string, string> = { sms: "SMS", whatsapp: "WhatsApp", email: "Email", in_app: "In-app" };

/** Synthetic directory: every role at state, LGA and facility level, with each person's open cases. */
export default async function People({ params, searchParams }: P) {
  const { code } = await params;
  const sp = await searchParams;
  const page = Number(sp.page ?? 0);
  const d = await apiOrNull(`/state/${code}/people`, undefined, {
    q: sp.q, role: sp.role, lga_id: sp.lga_id, level: sp.level, limit: "100", offset: String(page * 100),
  });
  if (!d) notFound();
  const [roles, summary] = await Promise.all([api("/meta/roles"), api(`/state/${code}/summary`)]);
  const qs = (o: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...sp, ...o })) if (v) p.set(k, v);
    return `?${p.toString()}`;
  };

  return (
    <>
      <div className="page-head">
        <div>
          <div className="crumbs"><Link href={`/state/${code}`}>{d.state.name} State</Link><span className="sep">/</span><span>People</span></div>
          <h1>{d.state.name} directory</h1>
          <div className="secondary">{d.total.toLocaleString("en-GB")} people match. Every person here is <strong>synthetic</strong>: generated names and non-dialable contacts (SIM-… numbers, .invalid emails).</div>
        </div>
      </div>
      <StateTabs code={code} active="people" />
      <form className="toolbar" method="get">
        <div className="left">
          <label className="search"><span className="sr-only">Search</span>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
            <input type="search" name="q" placeholder="Name, facility or LGA" defaultValue={sp.q ?? ""} />
          </label>
          <select name="role" defaultValue={sp.role ?? ""} aria-label="Role">
            <option value="">All roles</option>
            {roles.roles.filter((r: any) => r.level !== "national").map((r: any) => <option key={r.role_code} value={r.role_code}>{r.title}</option>)}
          </select>
          <select name="lga_id" defaultValue={sp.lga_id ?? ""} aria-label="LGA">
            <option value="">All LGAs</option>
            {[...summary.lgas].sort((a: any, b: any) => a.lga.localeCompare(b.lga)).map((l: any) => <option key={l.lga_id} value={l.lga_id}>{l.lga}</option>)}
          </select>
          <button className="btn sm" type="submit">Filter</button>
          {(sp.q || sp.role || sp.lga_id) && <Link className="btn sm ghost" href={`/state/${code}/people`}>Clear</Link>}
        </div>
      </form>
      <div className="card" style={{ padding: 0, overflowX: "auto" }}>
        <table className="data">
          <thead><tr><th>Name</th><th>Role</th><th>Where</th><th>Contact (non-real)</th><th>Prefers</th><th className="n">Open cases</th></tr></thead>
          <tbody>
            {d.people.map((p: any) => (
              <tr key={p.person_id}>
                <td><strong>{p.name}</strong><SynChip /></td>
                <td>{p.role_title}</td>
                <td>{p.facility ? <Link href={`/state/${code}/facility/${p.facility_id}`}>{p.facility}</Link> : p.lga ?? "State"}{p.facility && <div className="muted" style={{ fontSize: 12 }}>{p.lga}</div>}</td>
                <td><code>{p.phone_display}</code><div className="muted" style={{ fontSize: 12 }}>{p.email}</div></td>
                <td>{CHANNEL[p.preferred_channel]}</td>
                <td className="n">{p.open_cases > 0 ? <Link href={`/state/${code}/actions?q=&owner=${p.person_id}`}>{p.open_cases}</Link> : 0}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="pager">
        <span className="muted">{page * 100 + 1}–{Math.min(d.total, (page + 1) * 100)} of {d.total.toLocaleString("en-GB")}</span>
        {page > 0 && <Link className="btn sm" href={qs({ page: String(page - 1) })}>← Previous</Link>}
        {(page + 1) * 100 < d.total && <Link className="btn sm" href={qs({ page: String(page + 1) })}>Next →</Link>}
      </div>
    </>
  );
}
