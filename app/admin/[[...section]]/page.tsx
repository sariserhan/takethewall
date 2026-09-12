import { notFound } from "next/navigation";
import { AdminDashboard } from "@/components/admin-dashboard";
export default async function Page({
  params,
}: {
  params: Promise<{ section?: string[] }>;
}) {
  const { section = [] } = await params;
  if (
    section.length > 1 ||
    ![
      "",
      "publish",
      "takeovers",
      "milestones",
      "claims",
      "messages",
      "support",
      "audit",
      "settings",
    ].includes(section[0] ?? "")
  )
    notFound();
  return <AdminDashboard section={section[0] ?? "overview"} />;
}
