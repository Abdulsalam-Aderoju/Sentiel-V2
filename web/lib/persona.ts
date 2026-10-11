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
