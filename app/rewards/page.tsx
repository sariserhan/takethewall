import { redirect } from "next/navigation";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ version?: string }>;
}) {
  const { version } = await searchParams;
  redirect(
    "/?info=rewards" +
      (version ? "&version=" + encodeURIComponent(version) : ""),
  );
}
