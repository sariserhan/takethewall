import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
const http = httpRouter();
http.route({
  path: "/server",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const secret = process.env.WALL_SERVER_SECRET;
    if (
      !secret ||
      secret.length < 32 ||
      request.headers.get("authorization") !== `Bearer ${secret}`
    )
      return new Response("Unauthorized", { status: 401 });
    if (Number(request.headers.get("content-length") ?? 0) > 3_000_000)
      return new Response("Too large", { status: 413 });
    try {
      const text = await request.text();
      if (text.length > 3_000_000)
        return new Response("Too large", { status: 413 });
      const { op, args } = JSON.parse(text);
      let result: unknown;
      switch (op) {
        case "claimStart":
          result = await ctx.runMutation(internal.claimAuth.start, args);
          break;
        case "claimVerify":
          result = await ctx.runMutation(internal.claimAuth.verify, args);
          break;
        case "claimSession":
          result = await ctx.runMutation(internal.claimAuth.sessionValid, args);
          break;
        case "claimLogout":
          result = await ctx.runMutation(internal.claimAuth.logout, args);
          break;
        case "pending":
          result = await ctx.runMutation(internal.purchases.pending, args);
          break;
        case "attach":
          result = await ctx.runMutation(internal.purchases.attach, args);
          break;
        case "activate":
          result = await ctx.runMutation(internal.purchases.activate, args);
          break;
        case "expire":
          result = await ctx.runMutation(internal.purchases.expire, args);
          break;
        case "status":
          result = await ctx.runMutation(internal.purchases.confirmation, args);
          break;
        case "rate":
          result = await ctx.runMutation(internal.analytics.rate, args);
          break;
        case "event":
          result = await ctx.runMutation(internal.analytics.record, args);
          break;
        case "context":
          result = await ctx.runQuery(internal.wall.activeContext, args);
          break;
        case "reserveUpload":
          result = await ctx.runMutation(internal.uploads.reserve, args);
          break;
        case "upload": {
          if (typeof args.base64 !== "string" || args.base64.length > 2_800_000)
            throw new Error("Invalid image");
          const bytes = Uint8Array.from(atob(args.base64), (c) =>
            c.charCodeAt(0),
          );
          const storageId = await ctx.storage.store(
            new Blob([bytes], { type: "image/webp" }),
          );
          try {
            await ctx.runMutation(internal.uploads.finish, {
              key: args.key,
              storageId,
            });
          } catch (error) {
            await ctx.storage.delete(storageId);
            throw error;
          }
          result = { storageId, logoUrl: await ctx.storage.getUrl(storageId) };
          break;
        }
        default:
          return new Response("Unknown operation", { status: 404 });
      }
      return Response.json(result, {
        headers: { "Cache-Control": "no-store" },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Request failed";
      return Response.json(
        {
          error: message.includes("Too many requests")
            ? "Too many requests. Try again later."
            : "Request could not be completed.",
        },
        { status: message.includes("Too many requests") ? 429 : 400 },
      );
    }
  }),
});
export default http;
