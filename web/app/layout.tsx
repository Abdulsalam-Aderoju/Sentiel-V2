import type { Metadata, Viewport } from "next";
import "./globals.css";
import "./actions.css";
import "maplibre-gl/dist/maplibre-gl.css";

export const metadata: Metadata = {
  title: { default: "PHC Sentinel", template: "%s · PHC Sentinel" },
  description: "See risk before it becomes a shortage: operational risk x data confidence for primary health care in 12 Nigerian states.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1 };

/** The simulated-data banner sits in the root layout, so it is on every page:
 * landing, national map, state briefs, briefing mode, state portals and facility pages. */
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="banner" role="note" aria-label="Data notice">
          <span className="chip">All operational data simulated</span>
          <span className="long">
            Facility lists and boundaries are real (GRID3 v3.0). Reporting, stock and service figures are{" "}
            <strong>simulated</strong> and do not describe actual facilities.
          </span>
          <span className="short">Facility lists are real (GRID3); all figures are simulated.</span>
        </div>
        {children}
      </body>
    </html>
  );
}
