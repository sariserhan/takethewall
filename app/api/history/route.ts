import { backend, failure } from "@/lib/server";
export async function GET(req: Request) {
  try {
    const raw = new URL(req.url).searchParams.get("before");
    const before = raw && /^\d+$/.test(raw) ? Number(raw) : undefined;
    const data = await backend("growthHistory", {
      ...(before && Number.isSafeInteger(before) ? { before } : {}),
    });
    if (!data)
      return new Response("Not found", {
        status: 404,
        headers: { "Cache-Control": "no-store" },
      });
    return Response.json(data, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return failure(e);
  }
}
