import { z } from "zod"
import { LIMITS } from "@/lib/storelib-theme/types"

export type BlockShape = { id: string; type: string; settings: Record<string, unknown>; hidden?: boolean; static?: boolean; blocks?: BlockShape[] }

/**
 * ===========================================================================
 *  A BLOCK, AS EVERY SAVE DOOR READS ONE
 * ===========================================================================
 * zod drops a key it was not told about. The routes used to describe a
 * block as `{ id, type, settings }`, so the moment blocks could hold blocks,
 * saving a page would have kept the outer block and silently thrown away
 * everything inside it. One description, shared by every route that takes
 * sections, carries the whole tree: its blocks, whether it is hidden, and
 * whether its template placed it.
 *
 * IN A FILE OF ITS OWN, so a bundle that does not save leaves it, and zod
 * with it, out. The canvas's live layer reads ./block-tree's helpers, and
 * the live layer is in every published website's section renderer. Marked
 * pure inside ./block-tree, the schema still left zod (61KB) in every
 * website's script, because the import alone kept it (round 12, measured in
 * the production build's site chunks).
 */
export const BlockInstanceSchema: z.ZodType<BlockShape> = /* @__PURE__ */ z.lazy(() =>
  z.object({
    id: z.string().min(1).max(128),
    type: z.string().min(1).max(64),
    settings: z.record(z.unknown()),
    hidden: z.boolean().optional(),
    static: z.boolean().optional(),
    blocks: z.array(BlockInstanceSchema).max(LIMITS.blocksPerSection).optional(),
  }),
) as z.ZodType<BlockShape>
