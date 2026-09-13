"use client";
import { ConvexReactClient } from "convex/react";
let browserClient: ConvexReactClient | undefined;
export function publicConvexClient() {
  const url = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!url) return null;
  if (typeof window === "undefined") return new ConvexReactClient(url);
  return (browserClient ??= new ConvexReactClient(url));
}
