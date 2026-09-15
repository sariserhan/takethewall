"use client";
import { useEffect, useRef, useState } from "react";
export function ResetWallEffects({ onReset }: { onReset: () => void }) {
  const anchor = useRef<HTMLSpanElement>(null);
  const [active, setActive] = useState(false);
  useEffect(() => {
    const section = anchor.current?.closest(".wall-explore");
    if (!section) return;
    const update = () => setActive(!!section.querySelector('.experiment-menu-controls button[aria-pressed="true"]') || document.documentElement.dataset.wallTheme === "obsidian");
    const observer = new MutationObserver(update);
    observer.observe(section, { subtree:true, attributes:true, attributeFilter:["aria-pressed"], childList:true });
    observer.observe(document.documentElement, { attributes:true, attributeFilter:["data-wall-theme"] });
    update();
    return () => observer.disconnect();
  }, []);
  return <span ref={anchor} className="playground-reset">{active && <button type="button" onClick={onReset}>Reset effects ↺</button>}</span>;
}
