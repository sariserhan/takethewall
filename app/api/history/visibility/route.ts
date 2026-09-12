import { backend, failure } from "@/lib/server";
export async function GET() {
  try {
    return Response.json(
      { enabled: await backend<boolean>("growthVisibility", {}) },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return failure(e);
  }
}
