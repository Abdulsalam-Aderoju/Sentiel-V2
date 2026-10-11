import Link from "next/link";
import { portal } from "@/lib/persona";

/** Breadcrumbs for LGA pages. A state board sees "State / LGA"; an LGA team starts at its own LGA, because
 *  it has no way up to the state. */
export async function LgaCrumbs({ code, stateName, lgaId, lgaName, here, month }: {
  code: string; stateName: string; lgaId: string; lgaName: string; here?: string; month?: string;
}) {
  const p = await portal();
  const q = month ? `?month=${month}` : "";
  return (
    <div className="crumbs">
      {p?.kind === "state" && <><Link href={`/state/${code}${q}`}>{stateName} State</Link><span className="sep">/</span></>}
      {here ? <Link href={`/state/${code}/lga/${lgaId}${q}`}>{lgaName} LGA</Link> : <span>{lgaName} LGA</span>}
      {here && <><span className="sep">/</span><span>{here}</span></>}
    </div>
  );
}

const TABS: [string, string][] = [["", "Clinics"], ["actions", "Action Centre"], ["access", "Access"], ["people", "People"]];

/** Section tabs for one LGA, shown to a state board. (An LGA team has the same links in its portal bar.) */
export async function LgaTabs({ code, lgaId, active, month }: { code: string; lgaId: string; active: string; month?: string }) {
  const p = await portal();
  if (p?.kind !== "state") return null;
  const q = month ? `?month=${month}` : "";
  return (
    <nav className="lga-tabs" aria-label="LGA sections">
      {TABS.map(([k, label]) => (
        <Link key={k} href={`/state/${code}/lga/${lgaId}${k ? `/${k}` : ""}${q}`} className={active === k ? "active" : ""} aria-current={active === k ? "page" : undefined}>{label}</Link>
      ))}
    </nav>
  );
}
