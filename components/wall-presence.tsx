"use client";
import { useEffect } from "react";
import { context } from "@/lib/client-events";

export function WallPresence({ takeoverId }: { takeoverId?: string }) {
  useEffect(() => {
    if (!takeoverId || window.location.pathname !== "/") return;
    let stopped = false, generation = 0, busy = false;
    let sessionToken: string | null = null;
    let sessionId = crypto.randomUUID();
    const disconnect = (token: string) => {
      const body = JSON.stringify({ action: "disconnect", sessionToken: token });
      if (navigator.sendBeacon?.("/api/presence", new Blob([body], { type: "application/json" }))) return;
      void fetch("/api/presence", { method: "POST", headers: { "Content-Type": "application/json" }, body, keepalive: true }).catch(() => {});
    };
    const leave = () => {
      generation++;
      sessionId = crypto.randomUUID();
      if (sessionToken) disconnect(sessionToken);
      sessionToken = null;
    };
    const beat = async () => {
      if (stopped || document.hidden || busy) return;
      busy = true;
      const started = generation;
      const heartbeatSession = sessionId;
      try {
        const signed = await context(takeoverId);
        if (stopped || document.hidden || started !== generation) return;
        const response = await fetch("/api/presence", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "heartbeat", token: signed.token, sessionId: heartbeatSession }),
        });
        if (!response.ok) return;
        const result: { sessionToken: string | null } = await response.json();
        if (stopped || document.hidden || started !== generation) {
          if (result.sessionToken) disconnect(result.sessionToken);
        } else sessionToken = result.sessionToken;
      } catch { /* Presence must never interrupt the wall. */ }
      finally { busy = false; }
    };
    const visibility = () => { if (document.hidden) leave(); else void beat(); };
    void beat();
    const timer = setInterval(() => void beat(), 15_000);
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("pagehide", leave);
    window.addEventListener("pageshow", visibility);
    return () => {
      stopped = true;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("pagehide", leave);
      window.removeEventListener("pageshow", visibility);
      leave();
    };
  }, [takeoverId]);
  return null;
}
