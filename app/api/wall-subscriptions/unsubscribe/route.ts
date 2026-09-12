import { backend, failure } from "@/lib/server";
// RFC 8058 provider POST. GET never changes preferences (email scanners follow links).
export async function POST(req: Request) {
  try {
    const token = new URL(req.url).searchParams.get("token") ?? "";
    if (!/^[a-f0-9]{64}$/.test(token))
      return new Response("Invalid link", { status: 400 });
    const ok = await backend<boolean>("wallSubscriptionManage", {
      token,
      action: "unsubscribe",
    });
    return new Response(ok ? "Unsubscribed" : "Invalid link", {
      status: ok ? 200 : 400,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (e) {
    return failure(e);
  }
}
