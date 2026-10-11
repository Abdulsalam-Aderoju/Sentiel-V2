import { NextRequest, NextResponse } from "next/server";

/** Keeps the three demo portals apart. The portal cookie is set at sign-in (no password in the demo);
 *  a pilot replaces it with real authentication, and the API already enforces scope per person. */
export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const raw = req.cookies.get("sentinel_portal")?.value;
  const [kind, state, lga] = raw ? decodeURIComponent(raw).split(".") : [];
  const to = (p: string) => NextResponse.redirect(new URL(p, req.url));

  if (!kind) {
    const u = new URL("/signin", req.url);
    u.searchParams.set("next", pathname);
    return NextResponse.redirect(u);
  }
  // Shared by every portal: a case page and "My cases" (the page itself checks the case is in scope).
  if (pathname.startsWith("/cases/") || pathname === "/me") return NextResponse.next();

  if (kind === "national") {
    return pathname === "/national" || pathname.startsWith("/national/") ? NextResponse.next() : to("/national");
  }
  if (kind === "state") {
    const own = `/state/${state}`;
    return pathname === own || pathname.startsWith(own + "/") ? NextResponse.next() : to(own);
  }
  if (kind === "lga") {
    const home = `/state/${state}/lga/${lga}`;
    const ok = pathname === home || pathname.startsWith(home + "/") || pathname.startsWith(`/state/${state}/facility/`);
    return ok ? NextResponse.next() : to(home);
  }
  return to("/signin");
}

export const config = {
  matcher: ["/national/:path*", "/state/:path*", "/lga/:path*", "/facility/:path*", "/cases/:path*", "/me"],
};
