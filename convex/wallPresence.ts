import { Presence } from "@convex-dev/presence";
import { v } from "convex/values";
import { components } from "./_generated/api";
import { internalMutation, query } from "./_generated/server";
const presence = new Presence(components.presence);
const room = "wall";

// Only the authenticated server bridge can submit signed browser identities.
export const heartbeat = internalMutation({
  args: { visitorHash: v.string(), pageId: v.string(), city: v.string(), country: v.string() },
  returns: v.object({ sessionToken: v.string() }),
  handler: async (ctx, args) => {
    const location = await ctx.db.query("presenceLocations").withIndex("by_visitorHash", q => q.eq("visitorHash", args.visitorHash)).unique();
    if (!location) await ctx.db.insert("presenceLocations", { visitorHash: args.visitorHash, city: args.city, country: args.country });
    else if (args.city !== location.city || args.country !== location.country)
      await ctx.db.patch(location._id, { city: args.city, country: args.country });
    const { sessionToken } = await presence.heartbeat(ctx, room, args.visitorHash, args.pageId, 15_000);
    return { sessionToken };
  },
});
export const disconnect = internalMutation({
  args: { sessionToken: v.string() }, returns: v.null(),
  handler: (ctx, { sessionToken }) => presence.disconnect(ctx, sessionToken),
});
export const live = query({
  args: {},
  returns: v.array(v.object({ id: v.string(), receivedAt: v.number(), city: v.string(), country: v.string() })),
  handler: async ctx => {
    const online = await presence.listRoom(ctx, room, true, 500);
    const rows = await Promise.all(online.map(async user => {
      const location = await ctx.db.query("presenceLocations").withIndex("by_visitorHash", q => q.eq("visitorHash", user.userId)).unique();
      if (!location) return null;
      // Use an opaque document ID in public output, never the browser hash.
      return { id: location._id, receivedAt: location._creationTime, city: location.city, country: location.country };
    }));
    return rows.filter(row => row !== null);
  },
});
