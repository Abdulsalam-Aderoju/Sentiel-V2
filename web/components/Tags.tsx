import Icon from "@/components/Icon";
import { STATUS_STYLE } from "@/lib/api";

const QUEUE: Record<string, { cls: string; label: string; icon: string }> = {
  "ACT NOW": { cls: "q-act", label: "Act now", icon: "warning" },
  "VERIFY THEN ACT": { cls: "q-verify", label: "Verify then act", icon: "search" },
  "DO NOT ASSUME SAFE": { cls: "q-dnas", label: "Do not assume safe", icon: "eye-off" },
  MONITOR: { cls: "q-monitor", label: "Monitor", icon: "check" },
};

/** The one queue chip: colour plus an icon plus words; Do not assume safe is also dashed and hatched. */
export function QueueTag({ tag }: { tag: string }) {
  const s = QUEUE[tag];
  if (!s) return <span className="chip-q">{tag}</span>;
  return <span className={`chip-q ${s.cls}`} title={s.label}><Icon name={s.icon} size={13} />{s.label}</span>;
}

const RISK = { CRITICAL: ["Critical", "--r-critical"], HIGH: ["High", "--r-high"], WATCH: ["Watch", "--r-watch"], NORMAL: ["Normal", "--r-normal"] } as const;
const CONF = { HIGH: ["High", "--c-high"], MODERATE: ["Moderate", "--c-mod"], LOW: ["Low", "--c-low"] } as const;

export function SevBadge({ sev, muted }: { sev?: string | null; muted?: boolean }) {
  const r = sev ? RISK[sev as keyof typeof RISK] : undefined;
  if (!r) return <span className="muted">n/a</span>;
  return <span className="chip-r" style={{ background: `var(${r[1]}-bg)`, color: `var(${r[1]}-fg)`, opacity: muted ? 0.6 : 1 }}>{r[0]} risk</span>;
}

export function ConfBadge({ conf }: { conf: string }) {
  const c = CONF[conf as keyof typeof CONF];
  if (!c) return <span className="muted">n/a</span>;
  return <span className="chip-r" style={{ background: `var(${c[1]}-bg)`, color: `var(${c[1]}-fg)` }}>{c[0]} confidence</span>;
}

const STATUS_Q: Record<string, { cls: string; icon: string }> = {
  act_and_verify: { cls: "q-act", icon: "warning" },
  action_load: { cls: "q-verify", icon: "search" },
  evidence_gap: { cls: "q-dnas", icon: "eye-off" },
  watch: { cls: "q-monitor", icon: "check" },
};

/** State status for the national view: icon and words in the queue token it resembles, never colour alone. */
export function StatusPill({ status, size }: { status: string; size?: "lg" }) {
  const s = STATUS_STYLE[status];
  const q = STATUS_Q[status];
  if (!s || !q) return <span className="status-pill">{status}</span>;
  return (
    <span className={`status-pill ${q.cls}`} title={s.long} style={size === "lg" ? { fontSize: 14, padding: "4px 12px" } : undefined}>
      <Icon name={q.icon} size={size === "lg" ? 15 : 13} />{s.label}
    </span>
  );
}

export function SimChip({ text = "Simulated data" }: { text?: string }) {
  return <span className="sim-chip" title="All operational reporting data are simulated"><Icon name="info" size={12} />{text}</span>;
}

export function RealChip({ text = "Real-derived data" }: { text?: string }) {
  return <span className="real-chip" title="Derived from real open data (WorldPop, MAP, GRID3); not simulated"><span aria-hidden>◆</span>{text}</span>;
}

export function ModelChip({ text = "Modelled estimate" }: { text?: string }) {
  return <span className="model-chip" title="Estimated from each PHC's own history and validated against simulator truth; the reporting data are simulated"><span aria-hidden>≈</span>{text}</span>;
}
