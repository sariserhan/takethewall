import {
  internalAction,
  internalQuery,
  internalMutation,
} from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { detachedProof } from "../lib/timestamp-proof";
export const due = internalQuery({
  args: {},
  returns: v.array(
    v.object({ id: v.id("auditCheckpoints"), hash: v.string() }),
  ),
  handler: async (ctx) => {
    const rows = await ctx.db
      .query("auditCheckpoints")
      .withIndex("by_state_next", (q) =>
        q.eq("state", "pending").lte("nextAt", Date.now()),
      )
      .take(5);
    return rows.map((r) => ({ id: r._id, hash: r.finalHash }));
  },
});
export const finish = internalMutation({
  args: {
    id: v.id("auditCheckpoints"),
    proofStorageId: v.optional(v.id("_storage")),
  },
  returns: v.null(),
  handler: async (ctx, a) => {
    const c = await ctx.db.get(a.id);
    if (!c) return null;
    if (c.state !== "pending") {
      if (a.proofStorageId) await ctx.storage.delete(a.proofStorageId);
      return null;
    }
    await ctx.db.patch(c._id, {
      attempts: c.attempts + 1,
      nextAt:
        Date.now() +
        Math.min(86400_000, 60_000 * 2 ** Math.min(c.attempts, 11)),
      ...(a.proofStorageId
        ? { proofStorageId: a.proofStorageId, state: "submitted" as const }
        : {}),
    });
    return null;
  },
});
export const submit = internalAction({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    if (process.env.AUDIT_ANCHORING_ENABLED !== "true") return null;
    const due = await ctx.runQuery(internal.anchoring.due, {});
    for (const c of due) {
      try {
        const digest = Uint8Array.from(
          c.hash.match(/../g)!.map((s) => parseInt(s, 16)),
        );
        const response = await fetch(
          "https://alice.btc.calendar.opentimestamps.org/digest",
          {
            method: "POST",
            headers: {
              Accept: "application/vnd.opentimestamps.v1",
              "Content-Type": "application/x-www-form-urlencoded",
            },
            body: digest,
            signal: AbortSignal.timeout(10000),
            redirect: "error",
          },
        );
        if (!response.ok) throw new Error("Calendar unavailable");
        const reader = response.body?.getReader();
        if (!reader) throw new Error("Empty receipt");
        const chunks: Uint8Array[] = [];
        let length = 0;
        while (true) {
          const r = await reader.read();
          if (r.done) break;
          length += r.value.length;
          if (length > 10000) {
            await reader.cancel();
            throw new Error("Receipt too large");
          }
          chunks.push(r.value);
        }
        const tree = new Uint8Array(length);
        let offset = 0;
        for (const chunk of chunks) {
          tree.set(chunk, offset);
          offset += chunk.length;
        }
        const proof = detachedProof(c.hash, tree);
        const proofStorageId = await ctx.storage.store(
          new Blob([proof], { type: "application/vnd.opentimestamps.ots" }),
        );
        await ctx.runMutation(internal.anchoring.finish, {
          id: c.id,
          proofStorageId,
        });
      } catch {
        await ctx.runMutation(internal.anchoring.finish, { id: c.id });
      }
    }
    return null;
  },
});
