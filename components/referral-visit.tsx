"use client";
import { useEffect } from "react";
import { browserIdentity } from "@/lib/client-events";
export function ReferralVisit({ publicId }: { publicId: string }) {
  useEffect(() => {
    let sent = false;
    const record = () => {
      if (sent || document.visibilityState !== "visible") return;
      sent = true;
      void fetch("/api/referrals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          publicId,
          visitorId: browserIdentity().visitorId,
        }),
        keepalive: true,
      }).catch(() => {});
    };
    record();
    document.addEventListener("visibilitychange", record);
    return () => document.removeEventListener("visibilitychange", record);
  }, [publicId]);
  return null;
}
