"use client";
import { useEffect, useRef, type ReactNode } from "react";
export function StatValue({ children }: { children: ReactNode }) {
  const element = useRef<HTMLElement>(null);
  const previous = useRef<string | null>(null);
  useEffect(() => {
    const node = element.current;
    if (!node) return;
    const value = node.textContent ?? "";
    const changed = previous.current !== null && previous.current !== "—" && value !== "—" && previous.current !== value;
    previous.current = value;
    if (!changed || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const animation = node.animate([{backgroundColor:"#48cb7738"},{backgroundColor:"transparent"}], {duration:900,easing:"ease-out"});
    return () => animation.cancel();
  }, [children]);
  return <strong ref={element}>{children}</strong>;
}
