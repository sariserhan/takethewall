"use client";
import { useSearchParams } from "next/navigation";
import { ReferralVisit } from "./referral-visit";
export function HomeReferral() {
  const params = useSearchParams();
  const refs = params.getAll("ref");
  const id = refs.length === 1 ? refs[0] : null;
  if (!id || !/^ttw_[a-f0-9]{32}$/.test(id))
    return null;
  return <ReferralVisit key={id} publicId={id} />;
}
