"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

export type NavLink = { href: string; label: string; exact?: boolean; prefix?: string };

/** Navigation inside one portal; highlights where you are. */
export default function PortalNav({ links }: { links: NavLink[] }) {
  const path = usePathname();
  return (
    <nav className="pb-nav" aria-label="Portal">
      {links.map((l) => {
        const on = l.exact ? path === l.href : path === l.href || path.startsWith((l.prefix ?? l.href) + "/");
        return <Link key={l.href} href={l.href} className={on ? "active" : ""} aria-current={on ? "page" : undefined}>{l.label}</Link>;
      })}
    </nav>
  );
}
