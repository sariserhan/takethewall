"use client";
import { useEffect, useRef } from "react";
export function Dialog({
  open,
  onClose,
  title,
  children,
  wide = false,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open) {
      if (!d.open) d.showModal();
      document.body.style.overflow = "hidden";
    } else {
      d.close();
      document.body.style.overflow = document.querySelector("dialog[open]")
        ? "hidden"
        : "";
    }
    return () => {
      d.close();
      document.body.style.overflow = document.querySelector("dialog[open]")
        ? "hidden"
        : "";
    };
  }, [open]);
  return (
    <dialog
      ref={ref}
      className={wide ? "dialog wide" : "dialog"}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      aria-label={title}
    >
      <div className="dialog-inner">
        <div className="dialog-heading">
          <h2>{title}</h2>
          <button className="close" onClick={onClose} aria-label="Close dialog">
            ×
          </button>
        </div>
        {children}
      </div>
    </dialog>
  );
}
