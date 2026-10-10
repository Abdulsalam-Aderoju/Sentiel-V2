"use client";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

type St = { code: string; name: string; zone: string };

export function Logo() {
  return (
    <Link href="/" className="logo" aria-label="PHC Sentinel home">
      <span className="logo-mark" aria-hidden>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 3 4 6v6c0 4.5 3.4 8.3 8 9 4.6-.7 8-4.5 8-9V6l-8-3Z" /><path d="M12 8v6M9 11h6" />
        </svg>
      </span>
      <span>PHC Sentinel<small>Early warning for primary health care</small></span>
    </Link>
  );
}

/** Scope switcher: National Command Centre or any of the covered states, one click each.
 * Demo access has no login; a pilot adds real authentication with state-scoped access. */
export default function TopBar({ states, zones }: { states: St[]; zones: string[] }) {
  const path = usePathname();
  const params = useSearchParams();
  const month = params.get("month");
  const q = month ? `?month=${month}` : "";
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const current = path.startsWith("/state/") ? states.find((s) => s.code === path.split("/")[2]) : undefined;
  const scope = current ? current.name : path.startsWith("/national") ? "National Command Centre" : "Choose a view";

  useEffect(() => setOpen(false), [path]);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", esc); };
  }, [open]);

  return (
    <header className="topbar">
      <Logo />
      <nav className="topnav" aria-label="Main">
        <div className="scope" ref={ref}>
          <button className="navbtn scope-btn" aria-haspopup="true" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
            <span className="label"><small>{current ? `State portal · ${current.zone}` : "View"}</small>{scope}</span>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden><path d="m6 9 6 6 6-6" /></svg>
          </button>
          {open && (
            <div className="scope-menu" role="menu">
              <Link className="nat" href={`/national${q}`} role="menuitem">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" /></svg> National Command Centre
                <span className="muted" style={{ fontWeight: 500, fontSize: 12, marginLeft: "auto" }}>all {states.length} states</span>
              </Link>
              <div className="zones">
                {zones.map((z) => (
                  <div className="zone" key={z}>
                    <h4>{z}</h4>
                    {states.filter((s) => s.zone === z).map((s) => (
                      <Link key={s.code} role="menuitem" href={`/state/${s.code}${q}`} className={current?.code === s.code ? "active" : ""}>{s.name}</Link>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
        <Link href={`/national${q}`} className={path === "/national" ? "active" : ""}>National</Link>
        {current && <Link href={`/state/${current.code}${q}`} className={path === `/state/${current.code}` ? "active" : ""}>{current.name} overview</Link>}
        <span className="spacer" />
        <Link href="/national/briefing" className="hide-sm">Briefing mode</Link>
        <Link href="/about" className={path === "/about" ? "active" : ""}>Method &amp; data</Link>
      </nav>
    </header>
  );
}
