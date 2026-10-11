import { redirect } from "next/navigation";
import PortalBar from "@/components/PortalBar";
import { api } from "@/lib/api";
import { persona, portal } from "@/lib/persona";

/** Every portal page: a portal bar that names the level you are in. Middleware keeps the portals apart. */
export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const p = await portal();
  if (!p) redirect("/signin");
  const [meta, person] = await Promise.all([api("/meta/states"), persona()]);
  const stateName = "state" in p ? meta.states.find((s: any) => s.code === p.state)?.name : undefined;
  let lgaName: string | undefined;
  if (p.kind === "lga") {
    const s = await api(`/state/${p.state}/summary`);
    lgaName = s.lgas.find((l: any) => l.lga_id === p.lga)?.lga;
  }
  return (
    <>
      <PortalBar portal={p} person={person} stateName={stateName} lgaName={lgaName} />
      <main>{children}</main>
    </>
  );
}
