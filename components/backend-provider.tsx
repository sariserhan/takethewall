"use client";
import { ConvexProvider, ConvexReactClient } from "convex/react";
import { useState } from "react";
export function BackendProvider({ children }: { children: React.ReactNode }) {
  const [client] = useState(() =>
    process.env.NEXT_PUBLIC_CONVEX_URL
      ? new ConvexReactClient(process.env.NEXT_PUBLIC_CONVEX_URL)
      : null,
  );
  return client ? (
    <ConvexProvider client={client}>{children}</ConvexProvider>
  ) : (
    <p className="notice">
      The service is being configured. Please check back shortly.
    </p>
  );
}
