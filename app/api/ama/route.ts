import { cookies } from "next/headers";
import {
  backend,
  clientHash,
  failure,
  HttpError,
  jsonBody,
  rate,
  sameOrigin,
} from "@/lib/server";
const headers = { "Cache-Control": "private, no-store" };
export async function GET(req: Request) {
  try {
    const token = (await cookies()).get("ttw-owner")?.value;
    if (!token) throw new HttpError("Open your private owner link.", 401);
    await rate(req, "ama-inbox", 30);
    return Response.json(await backend("amaInbox", { token }), { headers });
  } catch (e) {
    return failure(e);
  }
}
export async function POST(req: Request) {
  try {
    sameOrigin(req);
    await rate(req, "ama-write", 20);
    const a = await jsonBody(req);
    if (a.action === "ask") {
      await backend("amaAsk", {
        takeoverId: a.takeoverId,
        question: String(a.question ?? ""),
        honeypot: String(a.company ?? ""),
        ipHash: clientHash(req),
      });
    } else {
      const token = (await cookies()).get("ttw-owner")?.value;
      if (!token) throw new HttpError("Open your private owner link.", 401);
      if (a.action === "toggle" && typeof a.enabled === "boolean")
        await backend("amaManage", { token, enabled: a.enabled });
      else if (a.action === "answer" || a.action === "dismiss")
        await backend("amaManage", {
          token,
          questionId: a.questionId,
          ...(a.action === "dismiss"
            ? { dismiss: true }
            : { answer: String(a.answer ?? "") }),
        });
      else throw new HttpError("Unknown AMA action.");
    }
    return Response.json({ ok: true }, { headers });
  } catch (e) {
    return failure(e);
  }
}
