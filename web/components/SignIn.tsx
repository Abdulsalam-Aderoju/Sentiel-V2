"use client";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { apiGet, setPersonaId, setPortal } from "@/lib/client";

type St = { code: string; name: string; zone: string };
type Role = "national" | "state" | "lga";
type Person = { person_id: string; name: string; role_title: string; lga?: string; state_code?: string };

const ROLES: { id: Role; cls: string; title: string; who: string; blurb: string }[] = [
  { id: "national", cls: "p-national", title: "National", who: "Federal Ministry of Health, NPHCDA", blurb: "Compare all 12 states. No clinic detail." },
  { id: "state", cls: "p-state", title: "State board", who: "State PHC Development Agency or Board", blurb: "One state, its LGAs, its clinics and its cases." },
  { id: "lga", cls: "p-lga", title: "LGA team", who: "LGA PHC coordinators and officers", blurb: "One LGA and the clinics in it." },
];

/** Demo sign-in: choose a level, then a place. You enter as a ready-made synthetic person; there is no password.
 *  A pilot replaces this with real accounts and state-scoped access. */
export default function SignIn({ states, zones, initial }: {
  states: St[]; zones: string[]; initial: { role?: string; state?: string; lga?: string; next?: string };
}) {
  const router = useRouter();
  const [role, setRole] = useState<Role | null>(ROLES.some((r) => r.id === initial.role) ? (initial.role as Role) : null);
  const [state, setState] = useState<string | null>(states.some((s) => s.code === initial.state) ? initial.state! : null);
  const [lga, setLga] = useState<string | null>(initial.lga ?? null);
  const [lgas, setLgas] = useState<{ lga_id: string; lga: string }[]>([]);
  const [filter, setFilter] = useState("");
  const [person, setPerson] = useState<Person | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const needsState = role === "state" || role === "lga";
  const ready = role === "national" || (role === "state" && !!state) || (role === "lga" && !!state && !!lga);
  const stateName = states.find((s) => s.code === state)?.name;
  const lgaName = lgas.find((l) => l.lga_id === lga)?.lga;

  useEffect(() => {
    if (role !== "lga" || !state) { setLgas([]); return; }
    apiGet(`/state/${state}/summary`).then((r) => {
      const xs = (r.lgas as any[]).map((l) => ({ lga_id: l.lga_id, lga: l.lga })).sort((a, b) => a.lga.localeCompare(b.lga));
      setLgas(xs);
      setLga((cur) => (cur && xs.some((x) => x.lga_id === cur) ? cur : null));
    }).catch(() => setLgas([]));
  }, [role, state]);

  useEffect(() => {
    setPerson(null); setError(null);
    if (!ready || !role) return;
    apiGet("/meta/signin", { role, state: needsState ? state : undefined, lga: role === "lga" ? lga : undefined })
      .then((r) => setPerson(r.person)).catch((e) => setError(e.message));
  }, [ready, role, state, lga, needsState]);

  const shownLgas = useMemo(() => lgas.filter((l) => l.lga.toLowerCase().includes(filter.trim().toLowerCase())), [lgas, filter]);

  const enter = () => {
    if (!person || !role) return;
    setBusy(true);
    setPersonaId(person.person_id);
    const value = role === "national" ? "national" : role === "state" ? `state.${state}` : `lga.${state}.${lga}`;
    setPortal(value);
    const home = role === "national" ? "/national" : role === "state" ? `/state/${state}` : `/state/${state}/lga/${lga}`;
    const next = initial.next && initial.next.startsWith("/") && !initial.next.startsWith("//") ? initial.next : null;
    router.push(next && next.startsWith(home) ? next : home);
    router.refresh();
  };

  const cls = ROLES.find((r) => r.id === role)?.cls ?? "";

  return (
    <div className="si">
      <div className="si-head">
        <div className="eyebrow">Demo sign-in · no password</div>
        <h1>Who are you signing in as?</h1>
        <p className="secondary">Each portal shows a different level of detail and is kept separate from the others. You enter as a ready-made synthetic person.</p>
      </div>

      <fieldset className="si-step"><legend><span className="si-n">1</span> Choose your level</legend>
        <div className="si-roles">
          {ROLES.map((r) => (
            <button key={r.id} type="button" className={`si-role ${r.cls}`} aria-pressed={role === r.id}
              onClick={() => { setRole(r.id); if (r.id === "national") { setState(null); setLga(null); } }}>
              <span className="si-role-mark" aria-hidden>{role === r.id ? "✓" : ""}</span>
              <b>{r.title}</b><span className="who">{r.who}</span><span className="blurb">{r.blurb}</span>
            </button>
          ))}
        </div>
      </fieldset>

      {needsState && (
        <fieldset className="si-step"><legend><span className="si-n">2</span> Choose your state</legend>
          <div className="si-zones">
            {zones.map((z) => (
              <div key={z}><h4>{z}</h4>
                <div className="si-pills">
                  {states.filter((s) => s.zone === z).map((s) => (
                    <button key={s.code} type="button" className="si-pill" aria-pressed={state === s.code}
                      onClick={() => { setState(s.code); setLga(null); setFilter(""); }}>{s.name}</button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </fieldset>
      )}

      {role === "lga" && state && (
        <fieldset className="si-step"><legend><span className="si-n">3</span> Choose your LGA in {stateName}</legend>
          <label className="search si-search"><span className="sr-only">Filter LGAs</span>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
            <input type="search" placeholder={`Filter ${lgas.length || ""} LGAs`} value={filter} onChange={(e) => setFilter(e.target.value)} />
          </label>
          <div className="si-pills lga">
            {shownLgas.map((l) => (
              <button key={l.lga_id} type="button" className="si-pill" aria-pressed={lga === l.lga_id} onClick={() => setLga(l.lga_id)}>{l.lga}</button>
            ))}
            {lgas.length > 0 && shownLgas.length === 0 && <span className="muted">No LGA matches “{filter}”.</span>}
          </div>
        </fieldset>
      )}

      {role && (
        <div className={`si-confirm ${cls}`} aria-live="polite">
          {ready && person ? (
            <>
              <div>
                <div className="eyebrow">You will enter as</div>
                <div className="si-who"><b>{person.name}</b> <span className="syn-chip sm">Synthetic</span></div>
                <div className="secondary">{person.role_title}{role === "lga" ? ` · ${lgaName ?? person.lga} LGA, ${stateName}` : role === "state" ? ` · ${stateName}` : " · all states, summaries only"}</div>
              </div>
              <button className="btn primary lg" onClick={enter} disabled={busy}>{busy ? "Entering…" : role === "national" ? "Enter the national portal" : role === "state" ? "Enter the state board portal" : "Enter the LGA portal"} <span aria-hidden>→</span></button>
            </>
          ) : error ? <span className="simmsg err">{error}</span>
            : <span className="muted">{needsState && !state ? "Choose a state to continue." : role === "lga" && !lga ? "Choose an LGA to continue." : "Loading…"}</span>}
        </div>
      )}
    </div>
  );
}
