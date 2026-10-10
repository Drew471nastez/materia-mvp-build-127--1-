/**
 * ===========================================================================
 *  SALES CHANNELS
 * ===========================================================================
 * Where a store's products are sold (Settings › Sales channels, SQL parts
 * 109 and 111). Three are places Storelib runs, and taking a product off
 * one really hides it there:
 *
 *   storefront     the store's website: its product lists, collections,
 *                  search and sitemap
 *   creator_page   storelib.com/name and the one page
 *   marketplace    Explore, where buyers find new creators
 *
 * Any other channel a store makes is `custom`, a name and a note for its own
 * use (a market stall, a wholesale list): Storelib shows nothing there, it
 * only keeps which products belong to it.
 *
 * A product is on every channel until someone takes it off one; a row in
 * product_channel_listings records only that. Its link keeps working
 * wherever it is listed, so a product taken off everything is a product
 * sold by its link alone.
 */

export type ChannelKind = "storefront" | "creator_page" | "marketplace" | "custom"
export const BUILT_IN_KINDS = ["storefront", "creator_page", "marketplace"] as const
export type BuiltInKind = (typeof BUILT_IN_KINDS)[number]

export interface Channel {
  /** Null for a built-in channel nobody has changed yet: it has no row. */
  id: string | null
  kind: ChannelKind
  name: string
  description: string | null
  enabled: boolean
  /** How many products are taken off it. */
  off?: number
}

export const BUILT_IN: Record<BuiltInKind, { name: string; description: string }> = {
  storefront: { name: "Online store", description: "Your website: its product lists, collections and search." },
  creator_page: { name: "Creator page", description: "storelib.com/you and your one page." },
  marketplace: { name: "Explore", description: "Storelib's marketplace, where buyers find new creators." },
}

export const isBuiltIn = (kind: unknown): kind is BuiltInKind => typeof kind === "string" && (BUILT_IN_KINDS as readonly string[]).includes(kind)

export const MAX_CHANNELS = 20

/** A channel as the product editor and the API name it: its id, or its kind for a built-in without a row. */
export const channelKey = (c: Pick<Channel, "id" | "kind">): string => c.id ?? c.kind

/** The store's channels in their order: the three built-ins first, then its own. */
export function withBuiltIns(rows: Channel[]): Channel[] {
  const out: Channel[] = BUILT_IN_KINDS.map((kind) => rows.find((r) => r.kind === kind) ?? { id: null, kind, name: BUILT_IN[kind].name, description: BUILT_IN[kind].description, enabled: true, off: 0 })
  return [...out.map((c) => (isBuiltIn(c.kind) ? { ...c, name: BUILT_IN[c.kind].name, description: BUILT_IN[c.kind].description, enabled: true } : c)), ...rows.filter((r) => r.kind === "custom")]
}

/**
 * Which channels a new product starts on: all of them, or only the store's
 * chosen one (Settings › Sales channels › New products).
 */
export function startingChannels(channels: Channel[], defaultKey: string | null): Set<string> {
  const keys = channels.filter((c) => c.enabled).map(channelKey)
  if (!defaultKey || !keys.includes(defaultKey)) return new Set(keys)
  return new Set([defaultKey])
}

/** What a channel form sent, checked. */
export function readChannel(input: unknown): { ok: true; name: string; description: string | null; enabled: boolean } | { ok: false; error: string } {
  const body = (input ?? {}) as Record<string, unknown>
  const clean = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/[\u0000-\u001f\u007f<>]/g, "").replace(/\s+/g, " ").trim().slice(0, max) : "")
  const name = clean(body.name, 80)
  if (!name) return { ok: false, error: "Give the channel a name." }
  return { ok: true, name, description: clean(body.description, 300) || null, enabled: body.enabled !== false }
}

/** Products a list shows on a channel: every product but the ones taken off it. */
export function listedOn<T extends { id: string }>(products: T[], off: ReadonlySet<string>): T[] {
  return off.size === 0 ? products : products.filter((p) => !off.has(p.id))
}
