/**
 * ===========================================================================
 *  WHERE THE TIPS CAME FROM (round AS)
 * ===========================================================================
 * Two kinds of tip reach a creator through Storelib:
 *
 *   checkout   a tip added to an order at checkout (orders.tip_cents). It is
 *              part of the order, so of Total sales, and its source is the
 *              order's channel (lib/analytics/commerce channelOfOrder): a
 *              website, the OnePage, the creator page, a checkout link.
 *   onepage    a tip given on a OnePage tips block (onepage_tips, run-now
 *              parts 411 and 442): paid on its own, not an order, so never
 *              in Total sales. Its source is the block, the block's card or
 *              its amount sheet, and the site the visitor came from
 *              (lib/onepage/tips tipSource).
 *
 * Storelib analytics lists both under the Sales breakdown (tipSourceRows);
 * a tips block's own stats in the OnePage editor list its tips by where the
 * visitor came from (blockTipSummary). Pure: no clock, no database.
 */

export interface TipSourceRow {
  /** "checkout:<channel>" or "onepage:<block id>". */
  key: string
  kind: "checkout" | "onepage"
  /** The channel's or the block's name. */
  label: string
  count: number
  cents: number
  /** For a OnePage block: where its tippers came from, most first ("Instagram 3, Direct 1"). */
  from: Array<{ key: string; label: string; count: number }>
}

/* i18n-ignore-start: companies' own names. */
const SITES: Array<[RegExp, string]> = [
  [/(^|\.)instagram\.com$/, "Instagram"],
  [/(^|\.)tiktok\.com$/, "TikTok"],
  [/(^|\.)(x\.com|twitter\.com|t\.co)$/, "X"],
  [/(^|\.)(youtube\.com|youtu\.be)$/, "YouTube"],
  [/(^|\.)(facebook\.com|fb\.com|fb\.me)$/, "Facebook"],
  [/(^|\.)threads\.net$/, "Threads"],
  [/(^|\.)linkedin\.com$/, "LinkedIn"],
  [/(^|\.)snapchat\.com$/, "Snapchat"],
  [/(^|\.)pinterest\.[a-z.]+$/, "Pinterest"],
  [/(^|\.)reddit\.com$/, "Reddit"],
  [/(^|\.)google\.[a-z.]+$/, "Google"],
  [/(^|\.)bing\.com$/, "Bing"],
]
/* i18n-ignore-end */

/** A referring host as people say it: "Instagram", "Google", else the host itself; null host is a direct visit. */
export function referrerName(host: string | null | undefined): { key: string; label: string } {
  const h = (host || "").trim().toLowerCase()
  if (!h) return { key: "direct", label: "Direct" }
  for (const [match, name] of SITES) if (match.test(h)) return { key: name.toLowerCase(), label: name }
  return { key: h, label: h }
}

export interface OnePageTip {
  block_id: string
  amount_cents: number
  currency: string
  source_detail?: { block_title?: string | null; referrer_host?: string | null; placement?: string | null } | null
}

/** A tips block's tips, grouped by where the tippers came from. Tips in another currency than `currency` are left out and counted. */
export function blockTipSummary(rows: OnePageTip[], currency: string): { count: number; cents: number; other: number; from: Array<{ key: string; label: string; count: number; cents: number }> } {
  const code = currency.toLowerCase()
  const from = new Map<string, { key: string; label: string; count: number; cents: number }>()
  let count = 0
  let cents = 0
  let other = 0
  for (const r of rows) {
    if ((r.currency || "").toLowerCase() !== code) {
      other += 1
      continue
    }
    count += 1
    cents += r.amount_cents
    const site = referrerName(r.source_detail?.referrer_host)
    const row = from.get(site.key) ?? { ...site, count: 0, cents: 0 }
    row.count += 1
    row.cents += r.amount_cents
    from.set(site.key, row)
  }
  return { count, cents, other, from: [...from.values()].sort((a, b) => b.cents - a.cents || b.count - a.count || a.label.localeCompare(b.label)) }
}

/**
 * Every source of the period's tips, largest first: each checkout channel's
 * order tips, and each OnePage tips block's tips (named by the block's title
 * now, else the one it had when the tip was given, else "Tips"). OnePage
 * tips in another currency than the report's are left out.
 */
export function tipSourceRows(input: {
  checkout: Array<{ channel: string; label: string; cents: number }>
  onepage: OnePageTip[]
  currency: string
  /** Each tips block's title as the page has it now. */
  titles?: Record<string, string | null | undefined>
}): TipSourceRow[] {
  const out = new Map<string, TipSourceRow>()
  for (const c of input.checkout) {
    if (!(c.cents > 0)) continue
    const key = `checkout:${c.channel}`
    const row = out.get(key) ?? { key, kind: "checkout" as const, label: c.label, count: 0, cents: 0, from: [] }
    row.count += 1
    row.cents += c.cents
    out.set(key, row)
  }
  const code = input.currency.toLowerCase()
  const byBlock = new Map<string, OnePageTip[]>()
  for (const t of input.onepage) {
    if ((t.currency || "").toLowerCase() !== code || !(t.amount_cents > 0)) continue
    const list = byBlock.get(t.block_id) ?? []
    list.push(t)
    byBlock.set(t.block_id, list)
  }
  for (const [blockId, list] of byBlock) {
    const summary = blockTipSummary(list, input.currency)
    const named = input.titles?.[blockId]?.trim() || [...list].reverse().find((t) => t.source_detail?.block_title)?.source_detail?.block_title?.trim() || "Tips"
    out.set(`onepage:${blockId}`, { key: `onepage:${blockId}`, kind: "onepage", label: named, count: summary.count, cents: summary.cents, from: summary.from.map(({ key, label, count }) => ({ key, label, count })) })
  }
  return [...out.values()].sort((a, b) => b.cents - a.cents || b.count - a.count || a.label.localeCompare(b.label))
}
