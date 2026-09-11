import { getToken } from "@/lib/auth-server";
import { cookies } from "next/headers";
import { sameOrigin, boundedBody, failure } from "@/lib/server";
export const runtime = "nodejs";
async function proxy(req: Request) {
  try {
    if (req.method === "POST") sameOrigin(req);
    const id = new URL(req.url).searchParams.get("id");
    if (!id || !/^[a-zA-Z0-9_]+$/.test(id))
      return new Response("Invalid document", { status: 400 });
    const session = (await cookies()).get("ttw-claim")?.value;
    const headers: Record<string, string> = {};
    if (session) headers["x-claim-session"] = session;
    else {
      const token = await getToken();
      if (!token) return new Response("Unauthorized", { status: 401 });
      headers.Authorization = `Bearer ${token}`;
    }
    const destination =
      process.env.CONVEX_HTTP_URL ?? process.env.NEXT_PUBLIC_CONVEX_SITE_URL;
    if (!destination) throw new Error("Document service unavailable");
    if (
      req.method === "GET" &&
      new URL(req.url).searchParams.get("upload") === "1"
    )
      return Response.json(
        {
          url: `${destination}/claim-document?id=${encodeURIComponent(id)}`,
          headers,
        },
        { headers: { "Cache-Control": "private, no-store" } },
      );
    let body: Uint8Array | undefined;
    if (req.method === "POST") {
      body = await boundedBody(req, 10 * 1024 * 1024);
      headers["Content-Type"] = req.headers.get("content-type") ?? "";
    }
    const upstream = await fetch(
      `${destination}/claim-document?id=${encodeURIComponent(id)}`,
      {
        method: req.method,
        headers,
        ...(body ? { body: Buffer.from(body) } : {}),
        cache: "no-store",
        redirect: "error",
        signal: AbortSignal.timeout(30_000),
      },
    );
    return new Response(upstream.body, {
      status: upstream.status,
      headers: {
        "Content-Type":
          upstream.headers.get("content-type") ?? "application/octet-stream",
        "Content-Disposition": "attachment; filename=claim-document",
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "sandbox; default-src 'none'",
        "X-Robots-Tag": "noindex, noarchive",
      },
    });
  } catch (e) {
    return failure(e);
  }
}
export const GET = proxy;
export const POST = proxy;
