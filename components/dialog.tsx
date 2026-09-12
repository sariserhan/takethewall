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
    const previousFocus =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
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
      if (open && previousFocus?.isConnected) previousFocus.focus();
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
      onKeyDown={(event) => {
        if (event.key !== "Tab") return;
        const focusable = Array.from(
          event.currentTarget.querySelectorAll<HTMLElement>(
            "button, a[href], input, select, textarea, [tabindex]",
          ),
        ).filter(
          (el) =>
            el.tabIndex >= 0 &&
            !el.matches(":disabled") &&
            !el.closest("[inert]") &&
            el.getClientRects().length > 0,
        );
        const first = focusable[0],
          last = focusable.at(-1);
        if (!first) {
          event.preventDefault();
          return;
        }
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }}
      aria-label={title}
    >
      <div className="dialog-inner">
        <div className="dialog-heading">
          <h2>{title}</h2>
          <button
            type="button"
            className="close"
            onClick={onClose}
            aria-label="Close dialog"
          >
            ×
          </button>
        </div>
        {children}
      </div>
    </dialog>
  );
}
