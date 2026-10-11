import { CASE_STATUS, PRIORITY } from "@/lib/actions";

/** Shown next to every synthetic person's name. */
export function SynChip() {
  return <span className="syn-chip" title="Synthetic person: generated for the demo; not a real official">Synthetic</span>;
}

export function PersonName({ name, role }: { name?: string | null; role?: string | null }) {
  if (!name) return <span className="muted">unassigned</span>;
  return (
    <span className="person">
      <span>{name}</span>
      {role && <span className="muted"> · {role}</span>}
      <SynChip />
    </span>
  );
}

export function StatusChip({ status }: { status: string }) {
  const s = CASE_STATUS[status] ?? { label: status, color: "var(--st-neutral)", icon: "•" };
  return (
    <span className="tag" title={s.label}>
      <span aria-hidden style={{ color: s.color }}>{s.icon}</span>
      {s.label}
    </span>
  );
}

export function PriorityChip({ p }: { p: string }) {
  const s = PRIORITY[p] ?? { label: p, color: "var(--st-neutral)" };
  return (
    <span className="prio" style={{ borderColor: `color-mix(in srgb, ${s.color} 55%, transparent)` }} title={s.label}>
      <i aria-hidden style={{ background: s.color }} />{p}
    </span>
  );
}

export function SimLabel({ text = "Simulated, not sent" }: { text?: string }) {
  return <span className="sim-chip" title="No message is ever sent; this is a simulation"><span aria-hidden>⚠</span>{text}</span>;
}
