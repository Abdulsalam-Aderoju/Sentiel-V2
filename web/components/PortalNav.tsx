"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import Icon from "./Icon";

export type NavLink = { href: string; label: string; icon: string; exact?: boolean; section?: string };

/** Sidebar navigation inside one portal; highlights where you are. A link with `section` starts a labelled group. */
export default function PortalNav({ links }: { links: NavLink[] }) {
  const path = usePathname();
  let last: string | undefined;
  return (
    <nav className="sn-nav" aria-label="Portal">
      {links.map((l) => {
        const on = l.exact ? path === l.href : path === l.href || path.startsWith(l.href + "/");
        const head = l.section && l.section !== last ? <div key={`s-${l.section}`} className="sn-label">{l.section}</div> : null;
        last = l.section ?? last;
        return (
          <span key={l.href} style={{ display: "contents" }}>
            {head}
            <Link href={l.href} className={on ? "active" : ""} aria-current={on ? "page" : undefined}>
              <Icon name={l.icon} /> {l.label}
            </Link>
          </span>
        );
      })}
    </nav>
  );
}
