"use client";
import { useEffect } from "react";
import { browserIdentity } from "@/lib/client-events";
export function ReferralVisit({ publicId }: { publicId: string }) {
  useEffect(() => {
    let stopped = false,
      completed = false,
      busy = false,
      timer: ReturnType<typeof setTimeout> | undefined;
    const controller = new AbortController();
    const start = async () => {
      if (
        stopped ||
        completed ||
        busy ||
        document.visibilityState !== "visible"
      )
        return;
      busy = true;
      try {
        const response = await fetch("/api/referrals", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "begin",
            publicId,
            visitorId: browserIdentity().visitorId,
          }),
          signal: controller.signal,
        });
        if (!response.ok || response.status === 204) {
          completed = true;
          return;
        }
        const data = await response.json();
        if (stopped || document.visibilityState !== "visible") return;
        timer = setTimeout(
          async () => {
            timer = undefined;
            if (stopped || document.visibilityState !== "visible") return;
            completed = true;
            try {
              await fetch("/api/referrals", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  action: "complete",
                  publicId,
                  proof: data.proof,
                }),
                keepalive: true,
                signal: controller.signal,
              });
            } catch {}
          },
          Math.max(5000, Number(data.waitMs) || 5000) + 100,
        );
      } catch {
      } finally {
        busy = false;
      }
    };
    const onVisibility = () => {
      if (timer) {
        clearTimeout(timer);
        timer = undefined;
      }
      if (document.visibilityState === "visible") void start();
    };
    void start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stopped = true;
      controller.abort();
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [publicId]);
  return null;
}
