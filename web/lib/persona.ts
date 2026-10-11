// Server-side: read the acting persona from the cookie the switcher sets.
import { cookies } from "next/headers";
import { apiOrNull } from "./api";

export const PERSONA_COOKIE = "sentinel_persona";

export async function personaId(): Promise<string | null> {
  return (await cookies()).get(PERSONA_COOKIE)?.value ?? null;
}

export async function persona(): Promise<any | null> {
  const id = await personaId();
  if (!id) return null;
  const r = await apiOrNull(`/people/${encodeURIComponent(id)}`);
  return r?.person ?? null;
}

export const PORTAL_COOKIE = "sentinel_portal";

export type Portal =
  | { kind: "national" }
  | { kind: "state"; state: string }
  | { kind: "lga"; state: string; lga: string }
  | null;

/** The portal the visitor signed in to (cookie set at sign-in; enforced by middleware). */
export async function portal(): Promise<Portal> {
  const v = (await cookies()).get(PORTAL_COOKIE)?.value;
  if (!v) return null;
  const [kind, state, lga] = decodeURIComponent(v).split(".");
  if (kind === "national") return { kind };
  if (kind === "state" && state) return { kind, state };
  if (kind === "lga" && state && lga) return { kind, state, lga };
  return null;
}

export function portalHome(p: Portal): string {
  if (!p) return "/signin";
  return p.kind === "national" ? "/national" : p.kind === "state" ? `/state/${p.state}` : `/state/${p.state}/lga/${p.lga}`;
}
