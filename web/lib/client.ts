"use client";
// Browser-side API calls go through the same-origin proxy (/api/...).

export const PERSONA_COOKIE = "sentinel_persona";

export function getPersonaId(): string | null {
  if (typeof document === "undefined") return null;
  const m = document.cookie.match(new RegExp(`(?:^|; )${PERSONA_COOKIE}=([^;]*)`));
  return m ? decodeURIComponent(m[1]) : null;
}

export function setPersonaId(id: string | null) {
  document.cookie = id
    ? `${PERSONA_COOKIE}=${encodeURIComponent(id)}; path=/; max-age=31536000; samesite=lax`
    : `${PERSONA_COOKIE}=; path=/; max-age=0`;
  window.dispatchEvent(new CustomEvent("persona-change", { detail: id }));
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function handle(res: Response) {
  const text = await res.text();
  let data: any = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!res.ok) {
    const detail = data?.detail;
    const msg = typeof detail === "string" ? detail
      : Array.isArray(detail) ? detail.map((d: any) => d.msg).join("; ")
      : `Request failed (${res.status})`;
    throw new ApiError(res.status, msg);
  }
  return data;
}

export async function apiGet<T = any>(path: string, params?: Record<string, string | number | boolean | undefined | null>): Promise<T> {
  const u = new URL(`/api${path}`, window.location.origin);
  for (const [k, v] of Object.entries(params ?? {})) if (v != null && v !== "") u.searchParams.set(k, String(v));
  return handle(await fetch(u, { cache: "no-store" }));
}

export async function apiPost<T = any>(path: string, body: any = {}): Promise<T> {
  return handle(await fetch(`/api${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }));
}

/** POST as the current persona; throws a friendly error when none is chosen. */
export async function act<T = any>(path: string, body: any = {}): Promise<T> {
  const actor = getPersonaId();
  if (!actor) throw new ApiError(422, "Choose who you are acting as (top bar) before taking an action.");
  return apiPost<T>(path, { actor_person_id: actor, ...body });
}

// ---- portal (which of the three demo portals you are signed in to) ----------------------------------
export const PORTAL_COOKIE = "sentinel_portal";

/** national | state.<code> | lga.<code>.<lga_id>; read by middleware to keep the three portals apart. */
export function setPortal(value: string | null) {
  document.cookie = value
    ? `${PORTAL_COOKIE}=${encodeURIComponent(value)}; path=/; max-age=31536000; samesite=lax`
    : `${PORTAL_COOKIE}=; path=/; max-age=0`;
}

export function signOut() {
  setPortal(null);
  setPersonaId(null);
}
