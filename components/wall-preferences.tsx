"use client";
import { useEffect } from "react";
export function WallPreferences() {
  useEffect(() => {
    try { document.documentElement.dataset.wallTheme = localStorage.getItem("ttw-theme") === "obsidian" ? "obsidian" : "paper"; } catch {}
  }, []);
  return null;
}
