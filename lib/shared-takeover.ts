import { cache } from "react";
import { backend } from "./server";
import type { SharedTakeover } from "./owner-types";
export const getSharedTakeover = cache(
  async (publicId: string): Promise<SharedTakeover | null> => {
    if (!/^ttw_[a-f0-9]{32}$/.test(publicId)) return null;
    return backend<SharedTakeover | null>("ownerShared", { publicId });
  },
);
