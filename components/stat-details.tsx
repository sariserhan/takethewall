"use client";

import { useId, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Dialog } from "./dialog";
import { WallToolIcon } from "./wall-tool-icon";

export function StatDetails({ label, title, rows, children, trigger, className, description }: {
  description?: string;
  trigger?: ReactNode;
  className?: string;
  label: string;
  title: string;
  rows: { label: string; value: string }[];
  children: ReactNode;
}) {
  const descriptionId = useId();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className={className ?? "stat-tool-button"} aria-label={label} aria-describedby={description ? descriptionId : undefined} title={description} data-tooltip={label} aria-haspopup="dialog" onClick={() => setOpen(true)}>
        {trigger ?? <><WallToolIcon name="preview" />{label}</>}
      </button>
      {description && <span id={descriptionId} hidden>{description}</span>}
      {open && createPortal(
        <Dialog open onClose={() => setOpen(false)} title={title}>
          <dl className="stat-details-list">
            {rows.map(row => <div key={row.label}><dt>{row.label}</dt><dd>{row.value}</dd></div>)}
          </dl>
          <div className="stat-details-copy">{children}</div>
        </Dialog>, document.body,
      )}
    </>
  );
}
