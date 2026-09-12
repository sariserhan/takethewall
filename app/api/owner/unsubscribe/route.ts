import {
  backend,
  boundedBody,
  failure,
  HttpError,
  jsonBody,
  sameOrigin,
} from "@/lib/server";
export async function POST(req: Request) {
  try {
    const url = new URL(req.url);
    let token: string;
    if (
      req.headers
        .get("content-type")
        ?.startsWith("application/x-www-form-urlencoded")
    ) {
      const form = new URLSearchParams(
        new TextDecoder().decode(await boundedBody(req, 1024)),
      );
      if (form.get("List-Unsubscribe") !== "One-Click")
        throw new HttpError("Invalid request");
      token = url.searchParams.get("token") ?? "";
    } else {
      sameOrigin(req);
      const a = await jsonBody(req);
      token = String(a.token ?? "");
    }
    if (!/^[a-f0-9]{64}$/.test(token))
      throw new HttpError("Invalid unsubscribe link");
    if (!(await backend<boolean>("ownerUnsubscribe", { token })))
      throw new HttpError("Invalid unsubscribe link");
    return Response.json({ ok: true });
  } catch (error) {
    return failure(error);
  }
}
