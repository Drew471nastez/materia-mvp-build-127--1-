import "server-only"

/**
 * ===========================================================================
 *  THE ONEPAGE EDITOR'S FIGURES, READ FROM WHAT ANALYTICS READS
 * ===========================================================================
 * app/api/onepage/stats answers from here. The page's views and visitors are
 * the OnePage property's, asked of the same function /app/analytics asks
 * (countVisits, analytics_report) with its older visits folded in the same
 * way (readLegacyOnePage, foldLegacy); a block's clicks are the link_click
 * events Analytics lists under Top links, with the older onepage_clicks rows
 * from before the first event. So a link's figure in the editor and on
 * Analytics come from the same rows, and robots, link previews and the
 * creator's own visits are left out of both (lib/analytics/collect).
 * lib/onepage/link-stats has the rules; this file only reads.
 */
import { bucketLabel, bucketStarts, grainFor, type Span } from "@/lib/analytics/buckets"
import {
  countVisits,
  creatorProperties,
  foldLegacy,
  readAll,
  readLegacyOnePage,
  startingAt,
  type Admin,
  type CountQuestion,
} from "@/lib/analytics/report-read"
import { parseProperty } from "@/lib/analytics/properties"
import { getMainDomain } from "@/lib/url-helpers"
import { blockIdsCounted, clicksPerBlock } from "@/lib/onepage/link-keys"
import { blockStats, type BlockStats, type ClickAt } from "@/lib/onepage/link-stats"

const PAGE = 1000

export interface StatsPage {
  id: string
  owner_id: string | null
  seller_id?: string | null
  creator_id?: string | null
  draft_blocks?: unknown
  published_blocks?: unknown
}

/** The creator whose events these are: the page's seller, else the owner's creator row. */
export async function creatorOfPage(admin: Admin, page: StatsPage): Promise<string | null> {
  const direct = page.seller_id || page.creator_id || null
  if (direct) return direct
  if (!page.owner_id) return null
  const { data } = await admin.from("creators").select("id").eq("user_id", page.owner_id).maybeSingle()
  return (data as { id?: string } | null)?.id ?? null
}

/** The question Analytics would ask for this OnePage over this period. */
async function questionFor(admin: Admin, page: StatsPage, creatorId: string, window: Span, timeZone: string): Promise<CountQuestion> {
  const properties = await creatorProperties(admin, creatorId, page.owner_id)
  return {
    creatorId,
    selector: parseProperty("onepage"),
    /* This page, the one the owner asked about, whatever the lookup found first. */
    properties: { ...properties, onePageId: page.id },
    product: null,
    window,
    previous: null,
    timeZone,
    mainDomain: getMainDomain(),
    part: "figures",
  }
}

/** Every link_click of the OnePage in the period, by its link id. */
async function readClickEvents(admin: Admin, creatorId: string, window: Span): Promise<{ rows: ClickAt[]; truncated: boolean }> {
  const start = new Date(window.start).toISOString()
  const end = new Date(window.end).toISOString()
  try {
    const read = await readAll<{ id: string; created_at: string; link_id: string | null }>((after) =>
      startingAt(
        admin
          .from("analytics_events")
          .select("id, created_at, link_id")
          .eq("creator_id", creatorId)
          .eq("event_type", "link_click")
          .eq("property_type", "onepage")
          .lt("created_at", end),
        start,
        after,
      )
        .order("created_at", { ascending: true })
        .order("id", { ascending: true })
        .limit(PAGE) as never,
    )
    return { rows: read.rows.map((r) => ({ created_at: r.created_at, link: r.link_id })), truncated: read.truncated }
  } catch {
    /* Before part 61 there is no link_id: the older table is the whole record, and readLegacyOnePage reads all of it. */
    return { rows: [], truncated: false }
  }
}

/** An email block's sign-ups in the period: the addresses it took. */
async function readSignups(admin: Admin, pageId: string, blockIds: string[], window: Span): Promise<{ rows: Array<{ created_at: string }>; truncated: boolean }> {
  const start = new Date(window.start).toISOString()
  const end = new Date(window.end).toISOString()
  try {
    return await readAll<{ id: string; created_at: string }>((after) =>
      startingAt(admin.from("onepage_leads").select("id, created_at").eq("onepage_id", pageId).in("block_id", blockIds).lt("created_at", end), start, after)
        .order("created_at", { ascending: true })
        .order("id", { ascending: true })
        .limit(PAGE) as never,
    )
  } catch {
    return { rows: [], truncated: false }
  }
}

/** The page's figures for the period and every click in it, the older rows folded in. */
async function pageAndClicks(admin: Admin, page: StatsPage, creatorId: string, window: Span, timeZone: string) {
  const q = await questionFor(admin, page, creatorId, window, timeZone)
  const [visits, legacy, events] = await Promise.all([countVisits(admin, q), readLegacyOnePage(admin, q), readClickEvents(admin, creatorId, window)])
  const wire = foldLegacy(visits.wire, legacy.legacy, q)
  const since = legacy.legacy?.since ?? null
  /* The older clicks only before the first event, as readLegacyOnePage already cut them; the events from then on. */
  const older: ClickAt[] = (legacy.legacy?.clicks ?? []).map((c) => ({ created_at: c.created_at, link: c.block_id ?? null }))
  const fromEvents = since === null ? events.rows : events.rows.filter((c) => Date.parse(c.created_at) >= since)
  return {
    page: wire.cur,
    clicks: [...older, ...fromEvents],
    truncated: visits.truncated || legacy.truncated || events.truncated,
  }
}

/** One block's figures over a period, bucketed as Analytics buckets it. */
export async function readBlockStats(
  admin: Admin,
  page: StatsPage,
  input: { blockId: string; window: Span; timeZone: string; blockType?: string | null },
): Promise<BlockStats | null> {
  const creatorId = await creatorOfPage(admin, page)
  if (!creatorId) return null
  const grain = grainFor(input.window)
  const starts = bucketStarts(input.window, grain, input.timeZone)
  const labels = starts.map((s) => bucketLabel(s, grain, input.timeZone))
  const blocks = page.draft_blocks ?? page.published_blocks
  const ids = new Set([...blockIdsCounted(blocks, input.blockId), ...blockIdsCounted(page.published_blocks, input.blockId)])
  const [counted, signups] = await Promise.all([
    pageAndClicks(admin, page, creatorId, input.window, input.timeZone),
    input.blockType === "email_capture" ? readSignups(admin, page.id, [...ids], input.window) : Promise.resolve(null),
  ])
  return blockStats({
    window: input.window,
    starts,
    labels,
    page: counted.page,
    clicks: counted.clicks,
    ids,
    signups: signups?.rows ?? null,
    truncated: counted.truncated || !!signups?.truncated,
  })
}

/**
 * Every block's clicks over a period, for the figure beside each row in the
 * editor's list: one read for the page, not one per block.
 */
export async function readPageClicks(admin: Admin, page: StatsPage, input: { window: Span; timeZone: string }) {
  const creatorId = await creatorOfPage(admin, page)
  if (!creatorId) return null
  const counted = await pageAndClicks(admin, page, creatorId, input.window, input.timeZone)
  const blocks = page.draft_blocks ?? page.published_blocks
  const block_clicks = clicksPerBlock(counted.clicks.map((c) => c.link), blocks)
  /* An email block's figure is its sign-ups (readSignups), as its own stats say. */
  const emailIds = (Array.isArray(blocks) ? (blocks as Array<{ id?: string; type?: string }>) : []).filter((b) => b?.type === "email_capture" && b.id).map((b) => b.id as string)
  if (emailIds.length > 0) {
    const leads = await (async () => {
      try {
        const start = new Date(input.window.start).toISOString()
        const end = new Date(input.window.end).toISOString()
        return await readAll<{ id: string; created_at: string; block_id: string | null }>((after) =>
          startingAt(admin.from("onepage_leads").select("id, created_at, block_id").eq("onepage_id", page.id).in("block_id", emailIds).lt("created_at", end), start, after)
            .order("created_at", { ascending: true })
            .order("id", { ascending: true })
            .limit(PAGE) as never,
        )
      } catch {
        return { rows: [] as Array<{ block_id: string | null }>, truncated: false }
      }
    })()
    for (const id of emailIds) block_clicks[id] = 0
    for (const l of leads.rows) if (l.block_id) block_clicks[l.block_id] = (block_clicks[l.block_id] ?? 0) + 1
  }
  return {
    total_views: Number(counted.page.views) || 0,
    total_visitors: Number(counted.page.visitors) || 0,
    total_clicks: counted.clicks.length,
    block_clicks,
    truncated: counted.truncated,
  }
}
