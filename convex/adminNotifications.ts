import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { enqueue, getSite } from "./model";
import { ownerBaseUrl } from "../lib/owner-secrets";

export async function notificationSettings(ctx: QueryCtx) {
  const row = await ctx.db
    .query("notificationSettings")
    .withIndex("by_key", (q) => q.eq("key", "current"))
    .unique();
  return {
    enabled: row?.enabled ?? true,
    recipient: row?.recipient ?? "serhan.sari@yahoo.com",
    revision: row?.revision ?? 0,
  };
}

// Capture the activation transaction so retries cannot report subsequently edited content.
export async function queueAdminTakeoverEmail(
  ctx: MutationCtx,
  id: Id<"takeovers">,
) {
  if (process.env.WALL_ENVIRONMENT !== "production") return;
  const preferences = await notificationSettings(ctx);
  if (!preferences.enabled) return;
  const t = await ctx.db.get(id);
  if (!t?.activatedAt) return;
  const p = await ctx.db
    .query("purchases")
    .withIndex("by_takeoverId", (q) => q.eq("takeoverId", id))
    .unique();
  if (!p || p.environment !== "production") return;
  const site = await getSite(ctx);
  const number =
    t.takeoverNumber === undefined
      ? "Uncounted placement"
      : "#" +
        (t.takeoverNumber + (site.numberingOffset ?? 0)).toLocaleString(
          "en-US",
        );
  const key = `admin_takeover_email:${id}:`;
  if (
    await ctx.db
      .query("jobs")
      .withIndex("by_key", (q) => q.eq("key", key))
      .unique()
  )
    return;
  await enqueue(ctx, "admin_takeover_email", id);
  const job = (await ctx.db
    .query("jobs")
    .withIndex("by_key", (q) => q.eq("key", key))
    .unique())!;
  const body = [
    `${t.displayName ?? t.domain} took over the wall.`,
    `Takeover: ${number}`,
    `Owner: ${t.displayName ?? t.domain}`,
    `Buyer email: ${p.buyerEmail || "Not provided (admin placement)"}`,
    ...(p.receiptEmail && p.receiptEmail !== p.buyerEmail
      ? [`Receipt email: ${p.receiptEmail}`]
      : []),
    `Content type: ${t.contentType ?? "link"}`,
    `Destination: ${t.websiteUrl || "Personal message (no link)"}`,
    `Description: ${t.description || "None"}`,
    `Image: ${t.logoStorageId ? "Uploaded; view the published content below" : "None"}`,
    `Activated: ${new Date(t.activatedAt).toISOString().replace("T", " ").replace(".000Z", " UTC")}`,
    `Source: ${t.kind === "paid" ? "Stripe payment" : "Admin publication"}`,
    `Amount: ${((p.amountCents ?? 0) / 100).toFixed(2)} ${(p.currency ?? "usd").toUpperCase()}`,
    ...(p.taxCents !== undefined ? [`Tax included in total: ${(p.taxCents / 100).toFixed(2)} USD`] : []),
    ...(p.sessionId ? [`Stripe checkout: ${p.sessionId}`] : []),
    ...(p.paymentIntentId ? [`Stripe payment: ${p.paymentIntentId}`] : []),
    ...(p.issuedByAdmin ? [`Published by admin: ${p.issuedByAdmin}`] : []),
    `Record: ${id}`,
    ...(t.auditHash ? [`Activation audit hash: ${t.auditHash}`] : []),
    ...(t.publicTakeoverId
      ? [`Published content: ${ownerBaseUrl()}/takeover/${t.publicTakeoverId}`]
      : [`Wall: ${ownerBaseUrl()}`]),
  ].join("\n\n");
  await ctx.db.patch(job._id, {
    adminRecipient: preferences.recipient,
    adminNotice: {
      subject: `New takeover ${number} — ${t.displayName ?? t.domain}`,
      body,
    },
  });
}
