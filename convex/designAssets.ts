import { v } from "convex/values";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { designImageKeys, parseWallDesign } from "../lib/wall-design";
export const designAssets = v.array(
  v.object({ key: v.string(), storageId: v.id("_storage") }),
);
export const designUploads = v.array(
  v.object({ key: v.string(), uploadKey: v.string() }),
);
export const publicDesignImages = v.array(
  v.object({ key: v.string(), url: v.string() }),
);
type Asset = { key: string; storageId: Id<"_storage"> };
export async function resolveDesignAssets(
  ctx: MutationCtx,
  design: string | undefined,
  uploads: { key: string; uploadKey: string }[] | undefined,
  ownerHash: string,
  existing: Asset[] = [],
) {
  if ((uploads?.length ?? 0) > 16) throw Error("Too many canvas images.");
  const keys = designImageKeys(parseWallDesign(design));
  const assets: Asset[] = [];
  for (const key of keys) {
    const input = uploads?.find((u) => u.key === key);
    if (!input?.uploadKey) {
      const old = existing.find((a) => a.key === key);
      if (!old) throw Error("Upload the canvas image again.");
      assets.push(old);
      continue;
    }
    const upload = await ctx.db
      .query("uploads")
      .withIndex("by_key", (q) => q.eq("key", input.uploadKey))
      .unique();
    if (
      !upload?.storageId ||
      upload.claimed ||
      upload.ownerHash !== ownerHash ||
      upload.expiresAt <= Date.now()
    )
      throw Error("Canvas image upload expired. Upload it again.");
    await ctx.db.patch(upload._id, { claimed: true });
    assets.push({ key, storageId: upload.storageId });
  }
  return assets;
}
export async function projectDesignImages(ctx: QueryCtx, assets: Asset[] = []) {
  const rows = await Promise.all(
    assets.map(async (a) => ({
      key: a.key,
      url: await ctx.storage.getUrl(a.storageId),
    })),
  );
  return rows.filter((a): a is { key: string; url: string } => !!a.url);
}

export async function retainDesignAssets(
  ctx: MutationCtx,
  takeoverId: Id<"takeovers">,
  assets: Asset[],
) {
  for (const asset of assets) {
    const existing = await ctx.db
      .query("canvasImageRefs")
      .withIndex("by_takeover_storage", (q) =>
        q.eq("takeoverId", takeoverId).eq("storageId", asset.storageId),
      )
      .unique();
    if (!existing)
      await ctx.db.insert("canvasImageRefs", {
        takeoverId,
        storageId: asset.storageId,
      });
  }
}
