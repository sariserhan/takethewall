"use client";

import { useEffect, useId, useRef } from "react";

const explanations: Record<string, string> = {
  "VISITORS TODAY (UTC)":
    "Distinct browsers that viewed the wall today, from midnight UTC. A returning browser counts once per UTC day. Different devices or cleared browser storage can count separately.",
  "TOTAL VISITORS":
    "Distinct browsers recorded across the site's lifetime. This total carries on when the wall owner changes; it does not reset with a takeover.",
  "COUNTED TAKEOVERS":
    "The public takeover sequence, including any documented starting offset. An offset does not represent completed takeovers. House placements do not count.",
  "PREVIOUS OWNER":
    "The owner immediately before the current one. This shows only the most recent previous owner, rather than the full ownership history.",
  "CURRENT REIGN":
    "How long the current owner has held the wall, measured from activation. A new takeover starts a new reign.",
  "Owner since":
    "The exact activation time, shown in UTC so everyone sees the same timestamp. UTC is a worldwide time standard, not your local time zone.",
  IMPRESSIONS:
    "How many times the current owner's content was viewed. Counts usually update within 15 seconds. Repeat views can count, so this can be higher than unique visitors. For example, 2 people viewing several times could create 9 impressions.",
  "UNIQUE VISITORS":
    "Distinct browsers that viewed the current owner's content during this reign. Repeat views from the same browser count once. This starts over for each new owner.",
  CLICKS:
    "Recorded clicks on the current owner's outbound link during this reign. These are link clicks, not clicks on the Take the Wall purchase button.",
  CTR: "Click-through rate: clicks divided by impressions, multiplied by 100. For example, 5 clicks from 100 impressions is a 5% CTR.",
  REFERRALS: "Compete for the referral prize (Reward B) by sharing your owner-dashboard referral link. The eligible entrant with the most verified referrals in the milestone cohort at the cutoff starts a prize claim; a payout is subject to verification and eligibility. Accepted distinct browser visits through this takeover’s shared referral link. Visitors must keep the page visible for at least 5 seconds and pass automated checks. Repeat visits and identifiable owner self-visits do not add credit. This total belongs to this takeover, not the whole site; reward eligibility is reviewed separately.",
  "TOP REGIONS":
    "Where views of the current owner's content came from, grouped by region. Percentages are shares of impressions, not unique people. Location is approximate; Unknown means a region could not be determined.",
};

export function StatHelp({ label }: { label: string }) {
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLSpanElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const cancelClose = () => clearTimeout(timer.current);
  const close = () => panel.current?.hidePopover();
  const scheduleClose = () => {
    cancelClose();
    timer.current = setTimeout(close, 150);
  };
  useEffect(() => () => clearTimeout(timer.current), []);
  function show() {
    cancelClose();
    const popup = panel.current;
    const button = trigger.current;
    if (!popup || !button) return;
    popup.showPopover();
    const bounds = button.getBoundingClientRect();
    const { width, height } = popup.getBoundingClientRect();
    popup.style.left = `${Math.max(12, Math.min(bounds.left, window.innerWidth - width - 12))}px`;
    popup.style.top = `${Math.max(12, bounds.bottom + height + 12 <= window.innerHeight ? bounds.bottom + 8 : bounds.top - height - 8)}px`;
  }
  return (
    <span
      className="stat-help"
      onPointerEnter={(event) => {
        if (event.pointerType === "mouse") show();
      }}
      onPointerLeave={(event) => {
        if (event.pointerType === "mouse") scheduleClose();
      }}
    >
      <button
        ref={trigger}
        type="button"
        className="stat-help-trigger"
        aria-describedby={id}
        onFocus={show}
        onBlur={close}
        onClick={show}
      >
        {label}
        <span className="stat-help-icon" aria-hidden="true">
          ?
        </span>
      </button>
      <span
        ref={panel}
        id={id}
        popover="auto"
        role="tooltip"
        className="stat-help-panel"
        onPointerEnter={cancelClose}
        onPointerLeave={(event) => {
          if (event.pointerType === "mouse") scheduleClose();
        }}
      >
        <strong>{label}</strong>
        <span>{explanations[label]}</span>
      </span>
    </span>
  );
}
