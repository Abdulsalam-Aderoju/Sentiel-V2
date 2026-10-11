import { Logo } from "@/components/Logo";
import Icon from "@/components/Icon";
import PortalNav, { NavLink } from "@/components/PortalNav";
import SignOutButton from "@/components/SignOutButton";
import ThemeToggle from "@/components/ThemeToggle";
import type { Portal } from "@/lib/persona";

const BADGE_ICON = { national: "home", state: "building", lga: "flag" } as const;

/** The sidebar and top bar of a portal (Stitch shell). The portal's colour, word and icon say which level you are in. */
export default function PortalShell({ portal, person, stateName, lgaName, children }: {
  portal: NonNullable<Portal>; person: { name: string; role_title: string } | null; stateName?: string; lgaName?: string; children: React.ReactNode;
}) {
  let cls = "p-national", badge = "National portal", scope = "All 12 states", sub = "Summaries only, no clinic detail";
  let home = "/national";
  let links: NavLink[] = [
    { href: "/national", label: "Command Centre", icon: "home", exact: true },
    { href: "/national/responses", label: "State responses", icon: "reply" },
    { href: "/national/briefing", label: "Briefing mode", icon: "slides" },
  ];
  if (portal.kind === "state") {
    cls = "p-state"; badge = "State board portal"; scope = `${stateName ?? portal.state} State`; sub = "Your state and its LGAs";
    home = `/state/${portal.state}`;
    links = [
      { href: home, label: "Overview", icon: "home", exact: true },
      { href: `${home}/actions`, label: "Action Centre", icon: "tasks", section: "Work" },
      { href: `${home}/resupply`, label: "Resupply", icon: "box", section: "Work" },
      { href: "/me", label: "My cases", icon: "list", section: "Work" },
      { href: `${home}/access`, label: "Access to care", icon: "map", section: "Insight" },
      { href: `${home}/gaps`, label: "Behind the gaps", icon: "eye", section: "Insight" },
      { href: `${home}/people`, label: "People", icon: "users", section: "Insight" },
    ];
  } else if (portal.kind === "lga") {
    cls = "p-lga"; badge = "LGA portal"; scope = `${lgaName ?? "LGA"} LGA`; sub = `${stateName ?? portal.state} State · your clinics`;
    home = `/state/${portal.state}/lga/${portal.lga}`;
    links = [
      { href: home, label: "Clinics", icon: "building", exact: true },
      { href: `${home}/actions`, label: "Action Centre", icon: "tasks" },
      { href: `${home}/access`, label: "Access to care", icon: "map" },
      { href: `${home}/people`, label: "People", icon: "users" },
      { href: "/me", label: "My cases", icon: "list" },
    ];
  }
  links = [...links, { href: "/about", label: "Method & data", icon: "rule", exact: true, section: portal.kind === "state" ? "About" : undefined }];
  return (
    <div className={`shell ${cls}`}>
      <aside className="sidenav" aria-label={badge}>
        <div className="sn-brand"><Logo href={home} /></div>
        <div className="sn-portal">
          <span className="badge"><Icon name={BADGE_ICON[portal.kind]} size={14} />{badge}</span>
          <div className="scope">{scope}</div>
          <div className="sub">{sub}</div>
        </div>
        <PortalNav links={links} />
        <div className="sn-foot">
          {person && <div className="sn-person">{person.name}<small>{person.role_title} · synthetic</small></div>}
          <SignOutButton />
        </div>
      </aside>
      <div className="shell-main">
        <header className="shell-top">
          <span className="where">{badge}<small>{scope}</small></span>
          <ThemeToggle />
        </header>
        <main>{children}</main>
      </div>
    </div>
  );
}
