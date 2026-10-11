import { Logo } from "@/components/Logo";
import PortalNav, { NavLink } from "@/components/PortalNav";
import SignOutButton from "@/components/SignOutButton";
import type { Portal } from "@/lib/persona";

const ICON = {
  national: <path d="M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm-9 9h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" />,
  state: <path d="M4 20V9l8-5 8 5v11M9 20v-6h6v6" />,
  lga: <path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11Zm0-8.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z" />,
};

/** The bar that tells you which of the three portals you are in. Colour, a word and an icon each say so. */
export default function PortalBar({ portal, person, stateName, lgaName }: {
  portal: NonNullable<Portal>; person: { name: string; role_title: string } | null; stateName?: string; lgaName?: string;
}) {
  let cls = "p-national", badge = "National portal", scope = "All 12 states", sub = "Summaries only, no clinic detail";
  let home = "/national";
  let links: NavLink[] = [
    { href: "/national", label: "Command Centre", exact: true },
    { href: "/national/responses", label: "State responses" },
    { href: "/national/briefing", label: "Briefing mode" },
  ];
  if (portal.kind === "state") {
    cls = "p-state"; badge = "State board portal"; scope = `${stateName ?? portal.state} State`; sub = "Your state and its LGAs";
    home = `/state/${portal.state}`;
    links = [
      { href: home, label: "Overview", exact: true },
      { href: `${home}/actions`, label: "Action Centre" },
      { href: `${home}/access`, label: "Access" },
      { href: `${home}/gaps`, label: "Behind the gaps" },
      { href: `${home}/people`, label: "People" },
      { href: `${home}/resupply`, label: "Resupply" },
      { href: "/me", label: "My cases" },
    ];
  } else if (portal.kind === "lga") {
    cls = "p-lga"; badge = "LGA portal"; scope = `${lgaName ?? "LGA"} LGA`; sub = `${stateName ?? portal.state} State · your clinics`;
    home = `/state/${portal.state}/lga/${portal.lga}`;
    links = [
      { href: home, label: "Clinics", exact: true },
      { href: `${home}/actions`, label: "Action Centre" },
      { href: `${home}/access`, label: "Access" },
      { href: `${home}/people`, label: "People" },
      { href: "/me", label: "My cases" },
    ];
  }
  links = [...links, { href: "/about", label: "Method & data", exact: true }];
  return (
    <header className={`portalbar ${cls}`}>
      <div className="pb-row">
        <Logo href={home} />
        <span className="pb-badge">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>{ICON[portal.kind]}</svg>
          {badge}
        </span>
        <span className="pb-scope">{scope}<small>{sub}</small></span>
        <div className="pb-user">
          {person && <span className="pb-person">{person.name}<small>{person.role_title} · synthetic</small></span>}
          <SignOutButton />
        </div>
      </div>
      <div className="pb-navrow"><PortalNav links={links} /></div>
    </header>
  );
}
