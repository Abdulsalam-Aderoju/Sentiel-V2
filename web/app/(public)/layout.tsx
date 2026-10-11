import Link from "next/link";
import { Logo } from "@/components/Logo";
import { portal, portalHome } from "@/lib/persona";

/** Public pages (landing, sign-in, method): no portal navigation, so nobody mixes up the three portals. */
export default async function PublicLayout({ children }: { children: React.ReactNode }) {
  const p = await portal();
  return (
    <>
      <header className="pubbar">
        <Logo />
        <nav aria-label="Main">
          <Link href="/#how" className="hide-sm">How it works</Link>
          <Link href="/#portals" className="hide-sm">The three portals</Link>
          <Link href="/about">Method &amp; data</Link>
          {p
            ? <Link className="btn primary sm" href={portalHome(p)}>Back to my portal</Link>
            : <Link className="btn primary sm" href="/signin">Enter the demo</Link>}
        </nav>
      </header>
      <main className="public">{children}</main>
      <footer className="pubfoot">
        <span>PHC Sentinel · Young Data Professionals Datathon 2026, Track 01: Health</span>
        <span>Facility lists and boundaries are real (GRID3 v3.0). Reporting data, people and messages are simulated.</span>
      </footer>
    </>
  );
}
