"use client";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { apiGet, getPersonaId, setPersonaId } from "@/lib/client";

type P = { person_id: string; name: string; role_code: string; role_title: string; level: string; state_code?: string; lga?: string; facility?: string };

const LEVEL_LABEL: Record<string, string> = { national: "National", state: "State", lga: "LGA", facility: "Facility" };

/** "Acting as": the demo has no login, so a synthetic persona stands in for a signed-in user. It sets the
 * default scope, "My cases" and the actor recorded on every action. A pilot replaces this with real accounts. */
export default function PersonaSwitcher() {
  const path = usePathname();
  const router = useRouter();
  const state = path.startsWith("/state/") ? path.split("/")[2] : null;
  const [me, setMe] = useState<P | null>(null);
  const [open, setOpen] = useState(false);
  const [picks, setPicks] = useState<P[]>([]);
  const [query, setQuery] = useState("");
  const [found, setFound] = useState<P[]>([]);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const load = () => {
      const id = getPersonaId();
      if (!id) { setMe(null); return; }
      apiGet(`/people/${encodeURIComponent(id)}`).then((r) => setMe(r.person)).catch(() => setMe(null));
    };
    load();
    window.addEventListener("persona-change", load);
    return () => window.removeEventListener("persona-change", load);
  }, []);

  useEffect(() => {
    if (!open) return;
    apiGet("/meta/personas", { state: state ?? me?.state_code ?? "bauchi" }).then((r) => setPicks(r.personas)).catch(() => setPicks([]));
    const close = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", esc); };
  }, [open, state, me?.state_code]);

  useEffect(() => {
    const st = state ?? me?.state_code;
    if (!open || query.trim().length < 2 || !st) { setFound([]); return; }
    const t = setTimeout(() => {
      apiGet(`/state/${st}/people`, { q: query.trim(), limit: 12 }).then((r) => setFound(r.people)).catch(() => setFound([]));
    }, 200);
    return () => clearTimeout(t);
  }, [query, open, state, me?.state_code]);

  const choose = (p: P | null) => {
    setPersonaId(p?.person_id ?? null);
    setMe(p);
    setOpen(false);
    setQuery("");
    router.refresh();
  };

  return (
    <div className="scope persona" ref={ref}>
      <button className="navbtn scope-btn persona-btn" aria-haspopup="true" aria-expanded={open} onClick={() => setOpen((o) => !o)}
        title="Choose who you are acting as (demo persona; no login)">
        <span className="label">
          <small>Acting as {me ? <span className="syn-chip sm">Synthetic</span> : null}</small>
          {me ? <span className="persona-name">{me.name}</span> : <span className="muted">Choose a persona</span>}
        </span>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden><path d="m6 9 6 6 6-6" /></svg>
      </button>
      {open && (
        <div className="scope-menu persona-menu" role="menu">
          {me && (
            <div className="persona-current">
              <strong>{me.name}</strong> <span className="syn-chip">Synthetic</span>
              <div className="muted" style={{ fontSize: 12 }}>{me.role_title}{me.lga ? ` · ${me.lga}` : ""}{me.facility ? ` · ${me.facility}` : ""}</div>
            </div>
          )}
          <div className="eyebrow" style={{ margin: "6px 6px 4px" }}>Quick picks</div>
          <div className="persona-picks">
            {picks.map((p) => (
              <button key={p.person_id} role="menuitem" className={`persona-pick ${me?.person_id === p.person_id ? "active" : ""}`} onClick={() => choose(p)}>
                <span className="lvl">{LEVEL_LABEL[p.level]}</span>
                <span><strong>{p.name}</strong><small>{p.role_title}{p.lga ? ` · ${p.lga}` : ""}{p.state_code && p.level !== "national" ? ` · ${p.state_code}` : ""}</small></span>
              </button>
            ))}
          </div>
          <label className="search" style={{ display: "flex", margin: "10px 4px 6px" }}>
            <span className="sr-only">Find anyone</span>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
            <input type="search" placeholder="Find anyone: name, facility or LGA" value={query} onChange={(e) => setQuery(e.target.value)} style={{ width: "100%" }} />
          </label>
          {found.length > 0 && (
            <div className="persona-picks">
              {found.map((p) => (
                <button key={p.person_id} role="menuitem" className="persona-pick" onClick={() => choose(p)}>
                  <span className="lvl">{LEVEL_LABEL[p.level]}</span>
                  <span><strong>{p.name}</strong><small>{p.role_title}{p.facility ? ` · ${p.facility}` : p.lga ? ` · ${p.lga}` : ""}</small></span>
                </button>
              ))}
            </div>
          )}
          <p className="note" style={{ margin: "8px 6px 2px" }}>
            Demo only: no login. A pilot replaces personas with real accounts and state-scoped access.
            {me && <> <button className="linkbtn" onClick={() => choose(null)}>Stop acting as {me.name.split(" ").slice(-2).join(" ")}</button></>}
          </p>
        </div>
      )}
    </div>
  );
}
