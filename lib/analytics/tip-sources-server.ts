import "server-only"

/**
 * The tips of a sales report's period, by source (lib/analytics/tip-sources):
 * the order tips of the period's sales by their channel, and, where the
 * report covers the OnePage, the creator's OnePage tips by block (read
 * from onepage_tips, lib/onepage/tips-server creatorTipsIn), each named by
 * the block's title on the page now. A report for one product has no tips
 * of its own: none are listed.
 */
import type { createAdminClient } from "@/lib/supabase/admin"
import { creatorTipsIn } from "@/lib/onepage/tips-server"
import { findPageBlock, publishedBlocksOf } from "@/lib/onepage/page-block"
import { channelOfOrder, orderBreakdown, type Span } from "./commerce"
import type { CreatorProperties, PropertySelector } from "./properties"
import type { Order } from "@/lib/orders/order-view"
import { tipSourceRows, type TipSourceRow } from "./tip-sources"

type Admin = ReturnType<typeof createAdminClient>

export async function tipSourcesFor(
  admin: Admin,
  q: { creatorId: string; selector: PropertySelector; productId: string | null; span: Span; properties: CreatorProperties },
  orders: Order[],
  currency: string,
): Promise<TipSourceRow[]> {
  if (q.productId) return []
  const checkout = orders
    .map((o) => {
      const c = channelOfOrder(o, q.properties)
      return { channel: c.key, label: c.label, cents: orderBreakdown(o).tips }
    })
    .filter((c) => c.cents > 0)
  const wantsOnePage = q.selector.type === "all" || q.selector.type === "onepage"
  const onepage = wantsOnePage ? (await creatorTipsIn(admin, q.creatorId, q.span)).rows : []
  const titles: Record<string, string | null> = {}
  const pageIds = [...new Set(onepage.map((t) => t.onepage_id))].slice(0, 20)
  if (pageIds.length) {
    try {
      const { data } = await admin.from("onepages").select("id, published_blocks, draft_blocks").in("id", pageIds)
      for (const page of (data ?? []) as Array<{ id: string; published_blocks?: unknown; draft_blocks?: unknown }>) {
        for (const t of onepage) {
          if (t.onepage_id !== page.id || t.block_id in titles) continue
          const found = findPageBlock(publishedBlocksOf(page), t.block_id)
          const title = (found?.block.data as { title?: unknown } | undefined)?.title
          titles[t.block_id] = typeof title === "string" && title.trim() ? title.trim() : null
        }
      }
    } catch {
      /* the titles the tips were given under */
    }
  }
  return tipSourceRows({ checkout, onepage, currency, titles })
}
