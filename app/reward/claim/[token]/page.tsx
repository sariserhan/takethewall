import { notFound } from "next/navigation";
import { ClaimEntry } from "@/components/claim-portal";
export default async function Page({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  if (!/^[a-f0-9]{64}$/.test(token)) notFound();
  return <ClaimEntry token={token} />;
}
