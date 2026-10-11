import Link from "next/link";

const TABS: [string, string][] = [
  ["", "Overview"],
  ["actions", "Action Centre"],
  ["access", "Access"],
  ["gaps", "Behind the gaps"],
  ["people", "People"],
  ["resupply", "Resupply"],
];

/** State portal sections. Every tab is the same template for every state. */
export default function StateTabs({ code, active, month }: { code: string; active: string; month?: string }) {
  const q = month ? `?month=${month}` : "";
  return (
    <nav className="state-tabs" aria-label="State portal sections">
      {TABS.map(([k, label]) => (
        <Link key={k} href={`/state/${code}${k ? `/${k}` : ""}${q}`} className={active === k ? "active" : ""} aria-current={active === k ? "page" : undefined}>
          {label}
        </Link>
      ))}
    </nav>
  );
}
