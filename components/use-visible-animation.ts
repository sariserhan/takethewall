"use client";
import { useEffect, useRef } from "react";
/** Pause decorative work outside the viewport without losing visitor presence. */
export function useVisibleAnimation() {
  const element = useRef<HTMLElement>(null);
  useEffect(() => {
    const node = element.current;
    if (!node) return;
    let visible = false;
    const update = () => { node.dataset.animating = String(visible && !document.hidden); };
    const observer = new IntersectionObserver(entries => {
      visible = entries[0]?.isIntersecting ?? false;
      update();
    });
    observer.observe(node);
    document.addEventListener("visibilitychange", update);
    update();
    return () => { observer.disconnect(); document.removeEventListener("visibilitychange", update); };
  }, []);
  return element;
}
