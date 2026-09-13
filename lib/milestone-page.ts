import { fetchQuery } from "convex/nextjs";
import { cache } from "react";
import { api } from "@/convex/_generated/api";
import { MILESTONES } from "@/lib/config";
export const milestoneOf = cache(async (value: string) => {
  if (!/^[1-9][0-9]*$/.test(value)) return null;
  const known = MILESTONES.find((m) => String(m.takeoverNumber) === value);
  try {
    const data = await fetchQuery(api.rewards.overview, {});
    const m = data.milestones.find((m) => String(m.number) === value);
    return m
      ? {
          takeoverNumber: m.number,
          title: data.promotionEnabled
            ? `The $${m.rewardUsd.toLocaleString("en-US")} Wall`
            : `Milestone #${m.number.toLocaleString("en-US")}`,
        }
      : null;
  } catch {
    if (known)
      return {
        ...known,
        title: `Milestone #${known.takeoverNumber.toLocaleString("en-US")}`,
      };
    throw new Error("Milestone service temporarily unavailable");
  }
});
