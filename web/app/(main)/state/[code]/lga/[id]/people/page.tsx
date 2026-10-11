import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { LgaCrumbs, LgaTabs } from "@/components/LgaNav";
import { SynChip } from "@/components/actions/Chips";
import { api, apiOrNull } from "@/lib/api";

type P = { params: Promise<{ code: string; id: string }> };

export const metadata: Metadata = { title: "LGA people" };

const CHANNEL: Record<string, string> = { sms: "SMS", whatsapp: "WhatsApp", email: "Email", in_app: "In-app" };

/** The synthetic people in one LGA: its team and the staff of each clinic. */
export default async function LgaPeople({ params }: P) {
  const { code, id } = await params;
  const [d, st] = await Promise.all([apiOrNull(`/state/${code}/people`, undefined, { lga_id: id, limit: "500" }), api(`/state/${code}/summary`)]);
  const lga = st.lgas.find((l: any) => l.lga_id === id);
  if (!d || !lga) notFound();
  return (
    <>
      <div className="page-head">
        <div>
          <LgaCrumbs code={code} stateName={st.state.name} lgaId={id} lgaName={lga.lga} here="People" />
          <h1>{lga.lga} directory</h1>
          <div className="secondary">{d.total.toLocaleString("en-GB")} people. Every person here is <strong>synthetic</strong>: generated names and non-dialable contacts (SIM-… numbers, .invalid emails).</div>
        </div>
      </div>
      <LgaTabs code={code} lgaId={id} active="people" />
      <div className="card" style={{ padding: 0, overflowX: "auto" }}>
        <table className="data">
          <thead><tr><th>Name</th><th>Role</th><th>Where</th><th>Contact (non-real)</th><th>Prefers</th><th className="n">Open cases</th></tr></thead>
          <tbody>
            {d.people.map((p: any) => (
              <tr key={p.person_id}>
                <td><strong>{p.name}</strong><SynChip /></td>
                <td>{p.role_title}</td>
                <td>{p.facility ? <Link href={`/state/${code}/facility/${p.facility_id}`}>{p.facility}</Link> : `${lga.lga} LGA team`}</td>
                <td><code>{p.phone_display}</code><div className="muted" style={{ fontSize: 12 }}>{p.email}</div></td>
                <td>{CHANNEL[p.preferred_channel]}</td>
                <td className="n">{p.open_cases}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
