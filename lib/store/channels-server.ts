import "server-only"

/**
 * ===========================================================================
 *  A STORE'S SALES CHANNELS, READ AND WRITTEN
 * ===========================================================================
 * sales_channels and product_channel_listings (SQL parts 109 and 111),
 * always filtered by the caller's own creator id. The model is
 * lib/store/channels.ts. What the storefront, the creator page and Explore
 * ask here is `offChannel` / `offChannelAmong`: the products taken off, which
 * fail open (nothing hidden) when the tables are not there yet, so a page
 * never loses its products to a missing database part.
 */
import { BUILT_IN, BUILT_IN_KINDS, MAX_CHANNELS, isBuiltIn, readChannel, withBuiltIns, type BuiltInKind, type Channel, type ChannelKind } from "./channels"
import { isMissingTable } from "./settings-server"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any

export const CHANNELS_NEED_PART = "Sales channels need their database update. Run SQL parts 109 and 111 in Supabase, then try again."
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export interface ChannelSetup {
  channels: Channel[]
  /** The channel new products start on alone (store_settings.default_sales_channel_id), as a key; null for every channel. */
  defaultKey: string | null
  ready: boolean
}

async function rows(db: Db, creatorId: string): Promise<{ list: Channel[]; ready: boolean }> {
  const { data, error } = await db.from("sales_channels").select("id, kind, name, description, enabled, position").eq("creator_id", creatorId).order("position").order("created_at").limit(MAX_CHANNELS + 5)
  if (error) return { list: [], ready: false }
  return { list: ((data ?? []) as Record<string, unknown>[]).map((r) => ({ id: String(r.id), kind: (r.kind as ChannelKind) ?? "custom", name: String(r.name), description: (r.description as string) ?? null, enabled: r.enabled !== false })), ready: true }
}

export async function loadChannels(db: Db, creatorId: string): Promise<ChannelSetup> {
  const [{ list, ready }, settings, off] = await Promise.all([
    rows(db, creatorId),
    db.from("store_settings").select("default_sales_channel_id").eq("creator_id", creatorId).maybeSingle(),
    db.from("product_channel_listings").select("channel_id").eq("creator_id", creatorId).eq("listed", false).limit(5000),
  ])
  const counts = new Map<string, number>()
  for (const r of (off.data ?? []) as { channel_id: string }[]) counts.set(r.channel_id, (counts.get(r.channel_id) ?? 0) + 1)
  const channels = withBuiltIns(list).map((c) => ({ ...c, off: c.id ? (counts.get(c.id) ?? 0) : 0 }))
  const def = (settings.data?.default_sales_channel_id as string | null) ?? null
  const defChannel = def ? channels.find((c) => c.id === def) : null
  return { channels, defaultKey: defChannel ? (defChannel.id as string) : null, ready }
}

/** A built-in channel's row, made the first time it is needed. */
async function builtInId(db: Db, creatorId: string, kind: BuiltInKind): Promise<string | null> {
  const { data } = await db.from("sales_channels").select("id").eq("creator_id", creatorId).eq("kind", kind).maybeSingle()
  if (data?.id) return data.id as string
  const { data: made, error } = await db
    .from("sales_channels")
    .insert({ creator_id: creatorId, kind, name: BUILT_IN[kind].name, description: BUILT_IN[kind].description, is_storefront: kind === "storefront", position: BUILT_IN_KINDS.indexOf(kind) })
    .select("id")
    .single()
  if (made?.id) return made.id as string
  /* Two saves at once: the other one made it. */
  if (error) {
    const { data: again } = await db.from("sales_channels").select("id").eq("creator_id", creatorId).eq("kind", kind).maybeSingle()
    return (again?.id as string) ?? null
  }
  return null
}

/** A key the editor or Settings sent (an id of this store's, or a built-in kind) as a channel id. */
export async function channelIdOf(db: Db, creatorId: string, key: unknown): Promise<string | null> {
  if (isBuiltIn(key)) return builtInId(db, creatorId, key)
  if (typeof key !== "string" || !UUID.test(key)) return null
  const { data } = await db.from("sales_channels").select("id").eq("id", key).eq("creator_id", creatorId).maybeSingle()
  return (data?.id as string) ?? null
}

type Done = { ok: true; setup: ChannelSetup } | { ok: false; error: string; status: number }
const failed = (error: { code?: string } | null | undefined, what: string): Done => ({ ok: false, error: isMissingTable(error) ? CHANNELS_NEED_PART : what, status: isMissingTable(error) ? 409 : 500 })

export async function createChannel(db: Db, creatorId: string, input: unknown): Promise<Done> {
  const read = readChannel(input)
  if (read.ok === false) return { ok: false, error: read.error, status: 400 }
  const now = await loadChannels(db, creatorId)
  if (!now.ready) return { ok: false, error: CHANNELS_NEED_PART, status: 409 }
  if (now.channels.length >= MAX_CHANNELS) return { ok: false, error: `A store has up to ${MAX_CHANNELS} channels.`, status: 400 }
  if (now.channels.some((c) => c.name.toLowerCase() === read.name.toLowerCase())) return { ok: false, error: "There is already a channel with that name.", status: 400 }
  const { error } = await db.from("sales_channels").insert({ creator_id: creatorId, kind: "custom", name: read.name, description: read.description, enabled: read.enabled, position: now.channels.length })
  if (error) return failed(error, "The channel could not be saved.")
  return { ok: true, setup: await loadChannels(db, creatorId) }
}

export async function updateChannel(db: Db, creatorId: string, id: unknown, input: unknown): Promise<Done> {
  if (typeof id !== "string" || !UUID.test(id)) return { ok: false, error: "That channel was not found.", status: 404 }
  const read = readChannel(input)
  if (read.ok === false) return { ok: false, error: read.error, status: 400 }
  const { data: row } = await db.from("sales_channels").select("id, kind").eq("id", id).eq("creator_id", creatorId).maybeSingle()
  if (!row) return { ok: false, error: "That channel was not found.", status: 404 }
  if (row.kind !== "custom") return { ok: false, error: "Storelib's own channels keep their names.", status: 400 }
  const now = await loadChannels(db, creatorId)
  if (now.channels.some((c) => c.id !== id && c.name.toLowerCase() === read.name.toLowerCase())) return { ok: false, error: "There is already a channel with that name.", status: 400 }
  const { error } = await db.from("sales_channels").update({ name: read.name, description: read.description, enabled: read.enabled, updated_at: new Date().toISOString() }).eq("id", id).eq("creator_id", creatorId)
  if (error) return failed(error, "The channel could not be saved.")
  return { ok: true, setup: await loadChannels(db, creatorId) }
}

export async function deleteChannel(db: Db, creatorId: string, id: unknown): Promise<Done> {
  if (typeof id !== "string" || !UUID.test(id)) return { ok: false, error: "That channel was not found.", status: 404 }
  const { data: row } = await db.from("sales_channels").select("id, kind").eq("id", id).eq("creator_id", creatorId).maybeSingle()
  if (!row) return { ok: false, error: "That channel was not found.", status: 404 }
  if (row.kind !== "custom") return { ok: false, error: "Storelib's own channels can't be removed. Take products off them instead.", status: 400 }
  const { error } = await db.from("sales_channels").delete().eq("id", id).eq("creator_id", creatorId)
  if (error) return failed(error, "The channel could not be removed.")
  return { ok: true, setup: await loadChannels(db, creatorId) }
}

/** Settings › Sales channels › New products: one channel's key, or null for every channel. */
export async function setDefaultChannel(db: Db, creatorId: string, key: unknown): Promise<Done> {
  const id = key === null || key === "" ? null : await channelIdOf(db, creatorId, key)
  if (key && !id) return { ok: false, error: "That channel was not found.", status: 404 }
  const { error } = await db.from("store_settings").upsert({ creator_id: creatorId, default_sales_channel_id: id, updated_at: new Date().toISOString() }, { onConflict: "creator_id" })
  if (error) return failed(error, "The setting could not be saved.")
  return { ok: true, setup: await loadChannels(db, creatorId) }
}

/** The channels one product is taken off, as keys. */
export async function productOff(db: Db, creatorId: string, productId: string): Promise<string[]> {
  return (await readProductOff(db, creatorId, productId)) ?? []
}

/**
 * The same, or null when the read failed. The editor's card is drawn from
 * this, so a failed read is said rather than shown as "on every channel",
 * which a save would then have written over the real choice.
 */
export async function readProductOff(db: Db, creatorId: string, productId: string): Promise<string[] | null> {
  const { data, error } = await db.from("product_channel_listings").select("channel_id").eq("creator_id", creatorId).eq("product_id", productId).eq("listed", false)
  if (error) return isMissingTable(error) ? [] : null
  return ((data ?? []) as { channel_id: string }[]).map((r) => r.channel_id)
}

/**
 * One product's channels, set whole: `off` is every channel (key) it is
 * taken off; any other channel lists it. The product must be this store's.
 */
export async function setProductChannels(db: Db, creatorId: string, productId: unknown, off: unknown): Promise<{ ok: true; off: string[] } | { ok: false; error: string; status: number }> {
  if (typeof productId !== "string" || !UUID.test(productId)) return { ok: false, error: "That product was not found.", status: 404 }
  if (!Array.isArray(off) || off.length > MAX_CHANNELS) return { ok: false, error: "Bad request.", status: 400 }
  const { data: product } = await db.from("products").select("id").eq("id", productId).eq("creator_id", creatorId).maybeSingle()
  if (!product) return { ok: false, error: "That product was not found.", status: 404 }
  if (!off.every((k) => typeof k === "string" && k.length <= 64)) return { ok: false, error: "Bad request.", status: 400 }
  /*
    One locked transaction when SQL 20271125 (run-now part 374) has run:
    the product row is locked, the keys resolved and the listings written
    together. Before it has run the function is not there (PGRST202, 42883)
    and the writes below do the same in steps.
  */
  if (typeof db.rpc === "function") {
    const result = await db.rpc("set_product_channels_atomic", { p_creator: creatorId, p_product: productId, p_off: off })
    if (!result.error && Array.isArray(result.data)) return { ok: true, off: (result.data as unknown[]).map(String) }
    if (result.error && !RPC_MISSING.has(result.error.code)) {
      if (isMissingTable(result.error)) return { ok: false, error: CHANNELS_NEED_PART, status: 409 }
      return { ok: false, error: result.error.code === "22023" ? "That sales channel was not found. Reload and try again." : "The sales channels could not be saved. Try again.", status: result.error.code === "22023" ? 400 : 503 }
    }
  }
  const ids: string[] = []
  for (const key of off) {
    const id = await channelIdOf(db, creatorId, key)
    /* Not this store's channel (or gone): refused, as the database function refuses it. A built-in whose row could not be made: try again. */
    if (!id) return isBuiltIn(key) ? { ok: false, error: "The sales channels could not be saved. Reload and try again.", status: 503 } : { ok: false, error: "That sales channel was not found. Reload and try again.", status: 400 }
    ids.push(id)
  }
  const keep = [...new Set(ids)]
  let clear = db.from("product_channel_listings").delete().eq("creator_id", creatorId).eq("product_id", productId)
  if (keep.length) clear = clear.not("channel_id", "in", `(${keep.join(",")})`)
  const { error: clearError } = await clear
  if (clearError) return { ok: false, error: isMissingTable(clearError) ? CHANNELS_NEED_PART : "The channels could not be saved.", status: isMissingTable(clearError) ? 409 : 500 }
  if (keep.length) {
    const { error } = await db.from("product_channel_listings").upsert(
      keep.map((channel_id) => ({ channel_id, product_id: productId, creator_id: creatorId, listed: false, updated_at: new Date().toISOString() })),
      { onConflict: "channel_id,product_id" },
    )
    if (error) return { ok: false, error: "The channels could not be saved.", status: 500 }
  }
  return { ok: true, off: keep }
}

/** PostgREST's and Postgres' "no such function": the database has not run 20271125 yet. */
const RPC_MISSING = new Set(["PGRST202", "42883"])

export interface ChannelChanges {
  /** Channels (keys) to put the product back on. */
  list?: unknown
  /** Channels (keys) to take it off. */
  unlist?: unknown
}

/**
 * ONLY WHAT THE EDITOR CHANGED, put on top of what is saved now.
 *
 * The editor used to send every channel the product was off, as its form
 * held them when it opened. A tab left open, or a second person in the
 * store, then wrote its old ticks over a newer save: Explore turned off in
 * one tab came back on when the other tab saved the Online store. Now the
 * card sends the channels whose tick it changed, and every other channel
 * keeps what is saved at the moment of the write.
 */
export async function changeProductChannels(db: Db, creatorId: string, productId: unknown, changes: ChannelChanges): Promise<{ ok: true; off: string[] } | { ok: false; error: string; status: number }> {
  if (typeof productId !== "string" || !UUID.test(productId)) return { ok: false, error: "That product was not found.", status: 404 }
  const keys = (v: unknown): string[] | null => (v === undefined || v === null ? [] : Array.isArray(v) && v.length <= MAX_CHANNELS && v.every((k) => typeof k === "string" && k.length <= 64) ? [...new Set(v as string[])] : null)
  const list = keys(changes.list)
  const unlist = keys(changes.unlist)
  if (!list || !unlist || list.some((k) => unlist.includes(k))) return { ok: false, error: "Bad request.", status: 400 }
  const { data: product } = await db.from("products").select("id").eq("id", productId).eq("creator_id", creatorId).maybeSingle()
  if (!product) return { ok: false, error: "That product was not found.", status: 404 }
  const now = await readProductOff(db, creatorId, productId)
  if (now === null) return { ok: false, error: "The sales channels could not be saved. Try again.", status: 503 }
  if (list.length === 0 && unlist.length === 0) return { ok: true, off: now }
  /* A built-in channel named by its kind is the row of that kind, when there is one; with no row the product is on it already. */
  const { data: rows, error } = await db.from("sales_channels").select("id, kind").eq("creator_id", creatorId).limit(MAX_CHANNELS + 5)
  if (error) return { ok: false, error: isMissingTable(error) ? CHANNELS_NEED_PART : "The sales channels could not be saved. Try again.", status: isMissingTable(error) ? 409 : 503 }
  const idOf = (key: string): string | null => (isBuiltIn(key) ? (((rows ?? []) as { id: string; kind: string }[]).find((r) => r.kind === key)?.id ?? null) : UUID.test(key) ? key.toLowerCase() : null)
  const back = new Set(list.map(idOf).filter((id): id is string => !!id))
  const off = [...new Set([...now.filter((id) => !back.has(id.toLowerCase())), ...unlist])]
  return setProductChannels(db, creatorId, productId, off)
}

export { offChannel, offChannelAmong } from "./channel-filter"
