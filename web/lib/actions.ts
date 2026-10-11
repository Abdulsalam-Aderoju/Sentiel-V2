// Labels for the action layer. Status and priority always carry words, never colour alone.

export const CASE_STATUS: Record<string, { label: string; color: string; icon: string }> = {
  open: { label: "Open", color: "var(--st-serious)", icon: "○" },
  acknowledged: { label: "Acknowledged", color: "var(--series-1)", icon: "◔" },
  in_progress: { label: "In progress", color: "var(--series-1)", icon: "◑" },
  awaiting_response: { label: "Awaiting reply", color: "var(--st-warning)", icon: "◷" },
  resupply_requested: { label: "Resupply requested", color: "var(--brand)", icon: "⇪" },
  resolved: { label: "Resolved", color: "var(--st-good)", icon: "✓" },
  closed_no_action: { label: "Closed, no action", color: "var(--st-neutral)", icon: "–" },
  closed_duplicate: { label: "Closed, duplicate", color: "var(--st-neutral)", icon: "=" },
};

export const KANBAN = ["open", "acknowledged", "in_progress", "awaiting_response", "resupply_requested", "resolved"];

export const PRIORITY: Record<string, { label: string; color: string }> = {
  P1: { label: "P1 urgent", color: "var(--st-critical)" },
  P2: { label: "P2 high", color: "var(--st-serious)" },
  P3: { label: "P3 routine", color: "var(--st-neutral)" },
};

export const MSG_STATUS: Record<string, string> = {
  draft: "Draft, awaiting approval",
  approved: "Approved, queued",
  sent_simulated: "Sent (simulated)",
  delivered_simulated: "Delivered (simulated)",
  failed_simulated: "Failed (simulated)",
  replied: "Replied",
  digest_pending: "Waiting for daily digest",
  bundled: "Bundled into digest",
  cancelled: "Cancelled",
};

export const PLAYBOOK_TITLE: Record<string, string> = {
  PB_RESUPPLY: "Resupply malaria commodities",
  PB_VERIFY_STOCK: "Verify stock before acting",
  PB_VACCINE_RESUPPLY: "Resupply vaccines",
  PB_COLD_CHAIN_INSPECT: "Inspect the cold chain",
  PB_RECOVER_REPORTS: "Recover missing reports",
  PB_REQUEST_LMIS_REPORT: "Request NHLMIS report",
  PB_SESSION_SUPPORT: "Support immunisation sessions",
  PB_LGA_REPORTING_REVIEW: "LGA reporting review",
  PB_STATE_RESPONSE: "State response",
};

export const RULE_SHORT: Record<string, string> = {
  R01_act_now_commodity: "R01 Act now: commodities",
  R02_act_now_vaccine: "R02 Act now: vaccine stockout",
  R03_fridge_down: "R03 Fridge not working",
  R04_verify_then_act: "R04 Verify then act",
  R05_silent_reliable: "R05 Reliable reporter silent",
  R06_stale_nhlmis: "R06 NHLMIS report overdue",
  R07_dnas_other: "R07 Do not assume safe",
  R08_session_shortfall: "R08 Session shortfall",
  R09_lga_reporting: "R09 LGA reporting review",
  R10_state_response: "R10 State response",
};

export const EVENT_LABEL: Record<string, string> = {
  opened: "Case opened",
  acknowledged: "Acknowledged",
  assigned: "Reassigned",
  status_changed: "Status changed",
  step_entered: "Moved to next step",
  message_approved: "Message approved",
  message_delivered: "Message delivered (simulated)",
  message_failed: "Message failed (simulated)",
  message_edited: "Message edited",
  reply_received: "Reply received",
  reply_needs_review: "Reply needs human review",
  reply_reviewed: "Reply reviewed",
  field_verification: "Field verification recorded",
  live_status_changed: "Live status changed",
  resupply_requested: "Resupply request prepared",
  resupply_approved: "Resupply approved",
  resupply_delivered: "Resupply delivered (simulated)",
  escalated: "Escalated",
  reminder_drafted: "Reminder drafted",
  linked_case_opened: "Linked case opened",
  report_ingested_simulated: "Missing report received (simulated)",
  resolved: "Resolved",
  closed: "Closed",
  note: "Note",
  response_lead: "Response lead named",
  response_plan: "Response plan submitted",
};

export function days(n: number | null | undefined) {
  if (n == null) return "n/a";
  const v = Math.round(Number(n) * 10) / 10;
  return `${v} day${v === 1 ? "" : "s"}`;
}

export function dateLabel(d: string | null | undefined) {
  if (!d) return "";
  const x = new Date(`${String(d).slice(0, 10)}T00:00:00`);
  return x.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}
