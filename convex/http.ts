import { authComponent, createAuth } from "./auth";
import { validatePrivateDocument } from "../lib/private-document";
import type { Id } from "./_generated/dataModel";
import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { api, internal } from "./_generated/api";
const http = httpRouter();
authComponent.registerRoutes(http, createAuth);
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
        case "checkoutResumeEmail":
          result = await ctx.runMutation(internal.recovery.requestResume, args);
          break;
        case "checkoutResume":
          result = await ctx.runQuery(internal.recovery.resume, args);
          break;
        case "recoveryFind":
          result = await ctx.runMutation(internal.recovery.find, args);
          break;
        case "recoverySend":
          result = await ctx.runMutation(internal.recovery.sendLink, args);
          break;
        case "wallSubscribe":
          result = await ctx.runMutation(
            internal.wallSubscriptions.subscribe,
            args,
          );
          break;
        case "wallSubscriptionManage":
          result = await ctx.runMutation(
            internal.wallSubscriptions.manage,
            args,
          );
          break;
        case "alertSubscribe":
          result = await ctx.runMutation(
            internal.milestoneAlerts.subscribe,
            args,
          );
          break;
        case "alertManage":
          result = await ctx.runMutation(internal.milestoneAlerts.manage, args);
          break;
        case "ownerRepeat":
          result = await ctx.runMutation(internal.owners.repeat, args);
          break;
        case "ownerFeedback":
          result = await ctx.runMutation(internal.owners.feedback, args);
          break;
        case "ownerEdit":
          result = await ctx.runMutation(internal.owners.edit, args);
          break;
        case "ownerDashboard":
          result = await ctx.runQuery(internal.owners.dashboard, args);
          break;
        case "ownerPreferences":
          result = await ctx.runMutation(internal.owners.preferences, args);
          break;
        case "ownerRequestLink":
          result = await ctx.runMutation(internal.owners.requestLink, args);
          break;
        case "ownerUnsubscribe":
          result = await ctx.runMutation(internal.owners.unsubscribe, args);
          break;
        case "growthVisibility":
          result = await ctx.runQuery(api.growth.visibility, {});
          break;
        case "growthHistory":
          result = await ctx.runQuery(internal.growth.history, args);
          break;
        case "referralVisit":
          result = await ctx.runMutation(internal.growth.visit, args);
          break;
        case "growthSitemap":
          result = await ctx.runQuery(internal.growth.sitemap, args);
          break;
        case "growthSitemapCount":
          result = await ctx.runQuery(internal.growth.sitemapCount, args);
          break;
        case "ownerShared":
          result = await ctx.runQuery(internal.owners.sharedTakeover, args);
          break;
        case "emailDelivery":
          result = await ctx.runMutation(internal.emailDelivery.record, args);
          break;
        case "paymentIssue":
          result = await ctx.runMutation(internal.paymentIssues.record, args);
          break;
        case "contentReport":
          result = await ctx.runMutation(internal.support.reportContent, args);
          break;
        case "supportSubmit":
          result = await ctx.runMutation(internal.support.submit, args);
          break;
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
for (const method of ["GET", "POST"] as const)
  http.route({
    path: "/claim-document",
    method,
    handler: httpAction(async (ctx, req) => {
      const headers = {
        "Access-Control-Allow-Origin":
          process.env.SITE_URL ?? "https://takethewall.com",
        Vary: "Origin",
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "sandbox; default-src 'none'",
        "X-Robots-Tag": "noindex, noarchive",
      };
      let stored: Id<"_storage"> | undefined;
      try {
        const id = new URL(req.url).searchParams.get(
          "id",
        ) as Id<"claimDocuments">;
        const session = req.headers.get("x-claim-session") ?? undefined;
        const access = await ctx.runMutation(internal.documents.access, {
          id,
          session,
          write: method === "POST",
        });
        if (method === "GET") {
          if (!access.storageId)
            return new Response("Unavailable", { status: 404, headers });
          const blob = await ctx.storage.get(access.storageId);
          if (!blob)
            return new Response("Unavailable", { status: 404, headers });
          return new Response(blob, {
            headers: {
              ...headers,
              "Content-Type": access.contentType,
              "Content-Disposition": "attachment; filename=claim-document",
            },
          });
        }
        const reader = req.body?.getReader();
        if (!reader) throw new Error("Missing body");
        const chunks: Uint8Array[] = [];
        let size = 0;
        while (true) {
          const chunk = await reader.read();
          if (chunk.done) break;
          size += chunk.value.length;
          if (size > 10 * 1024 * 1024) {
            await reader.cancel();
            throw new Error("Too large");
          }
          chunks.push(chunk.value);
        }
        const bytes = new Uint8Array(size);
        let offset = 0;
        for (const chunk of chunks) {
          bytes.set(chunk, offset);
          offset += chunk.length;
        }
        const contentType = req.headers.get("content-type") ?? "";
        validatePrivateDocument(bytes, contentType);
        stored = await ctx.storage.store(
          new Blob([bytes], { type: contentType }),
        );
        await ctx.runMutation(internal.documents.finish, {
          id,
          session,
          storageId: stored,
          contentType,
          size,
        });
        return Response.json({ ok: true }, { headers });
      } catch {
        if (stored) await ctx.storage.delete(stored);
        return new Response("Document unavailable", { status: 403, headers });
      }
    }),
  });
http.route({
  path: "/claim-document",
  method: "OPTIONS",
  handler: httpAction(
    async () =>
      new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin":
            process.env.SITE_URL ?? "https://takethewall.com",
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
          "Access-Control-Allow-Headers":
            "Content-Type, Authorization, X-Claim-Session",
          "Access-Control-Max-Age": "600",
          Vary: "Origin",
        },
      }),
  ),
});
export default http;
