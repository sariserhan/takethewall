import Link from "next/link";
import { RewardRules } from "@/components/milestones";
import { PublicFooter } from "@/components/public-footer";
export const metadata = {
  title: "Reward Rules | TakeTheWall",
  description:
    "Milestone rewards, eligibility, deadlines, sequential succession and permanent wall rules.",
};
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ version?: string }>;
}) {
  const { version } = await searchParams;
  return (
    <main className="document-page">
      <Link href="/">TAKE THE WALL</Link>
      <h1>REWARD RULES</h1>
      <RewardRules version={version} />
      <PublicFooter />
    </main>
  );
}
