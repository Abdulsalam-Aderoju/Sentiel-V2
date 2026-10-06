import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import "maplibre-gl/dist/maplibre-gl.css";

export const metadata: Metadata = {
  title: "PHC Sentinel",
  description: "See risk before it becomes a shortage: operational risk x data confidence for Bauchi State PHCs.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="banner" role="note">
          Demonstration: facility list and boundaries are real (GRID3). All operational reporting data are{" "}
          <strong>simulated</strong> and do not describe actual Bauchi facilities.
        </div>
        <header className="topbar">
          <Link href="/" className="logo" style={{ textDecoration: "none" }}>
            PHC Sentinel<span>Bauchi State PHCDA</span>
          </Link>
          <nav>
            <Link href="/">State overview</Link>
            <Link href="/about">Method &amp; data</Link>
          </nav>
        </header>
        <main>{children}</main>
      </body>
    </html>
  );
}
