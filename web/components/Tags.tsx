import { CONF_COLOR, SEV_COLOR, TAG_STYLE } from "@/lib/api";

export function QueueTag({ tag }: { tag: string }) {
  const s = TAG_STYLE[tag] ?? { color: "var(--st-neutral)", label: tag, icon: "•" };
  return (
    <span className="tag" title={s.label}>
      <span aria-hidden style={{ color: s.color, fontSize: 10 }}>{s.icon}</span>
      {s.label}
    </span>
  );
}

export function SevBadge({ sev, muted }: { sev?: string | null; muted?: boolean }) {
  if (!sev) return <span className="muted">n/a</span>;
  return (
    <span className="tag" style={muted ? { opacity: 0.6 } : undefined}>
      <span className="dot" style={{ background: SEV_COLOR[sev] }} />
      {sev.charAt(0) + sev.slice(1).toLowerCase()}
    </span>
  );
}

export function ConfBadge({ conf }: { conf: string }) {
  return (
    <span className="tag">
      <span className="dot" style={{ background: CONF_COLOR[conf], borderRadius: 2 }} />
      {conf.charAt(0) + conf.slice(1).toLowerCase()} confidence
    </span>
  );
}
