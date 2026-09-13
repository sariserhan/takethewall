"use client";
import { publicConvexClient } from "@/lib/convex-client";
import { ConvexProvider } from "convex/react";
import { useState } from "react";
export function BackendProvider({ children }: { children: React.ReactNode }) {
  const [client] = useState(publicConvexClient);
  return client ? (
    <ConvexProvider client={client}>{children}</ConvexProvider>
  ) : (
    <p className="notice">
      The service is being configured. Please check back shortly.
    </p>
  );
}
