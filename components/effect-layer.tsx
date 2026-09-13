"use client";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
export function EffectLayer({ children }: { children: React.ReactNode }) {
  const [host, setHost] = useState<HTMLElement | null>(null);
  useEffect(() => {
    // Native dialogs occupy the browser's top layer. Keep effects and their
    // controls inside the active dialog so they remain visible and usable.
    const update = () => {
      const dialogs =
        document.querySelectorAll<HTMLDialogElement>("dialog[open]");
      const next = dialogs.item(dialogs.length - 1) ?? null;
      setHost((previous) => (previous === next ? previous : next));
    };
    const observer = new MutationObserver(update);
    observer.observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["open"],
    });
    update();
    return () => observer.disconnect();
  }, []);
  return host?.isConnected && host.hasAttribute("open")
    ? createPortal(children, host)
    : children;
}
