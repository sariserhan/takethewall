"use client";
import { useSearchParams } from "next/navigation";
import { ReferralVisit } from "./referral-visit";
export function HomeReferral() {
  const params = useSearchParams();
  const id = params.get("ref");
  if (params.get("via") !== "share" || !id || !/^ttw_[a-f0-9]{32}$/.test(id))
    return null;
  return <ReferralVisit key={id} publicId={id} />;
}
