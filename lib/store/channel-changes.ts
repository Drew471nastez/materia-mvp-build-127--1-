/**
 * What the product editor's Sales channels card sends: the channels whose
 * tick it changed, not every channel (lib/store/channels-server.ts
 * changeProductChannels). Plain functions, so the card and the suites share
 * them.
 */
import { channelKey, type Channel } from "./channels"

/** The channels (keys) a product is listed on, from the channels and the ids it is taken off. */
export function listedKeys(channels: Pick<Channel, "id" | "kind">[], off: readonly string[]): Set<string> {
  const gone = new Set(off.map((id) => id.toLowerCase()))
  return new Set(channels.filter((c) => !(c.id && gone.has(c.id.toLowerCase()))).map(channelKey))
}

/**
 * The ticks that differ from what was saved, among the channels the card
 * shows. A channel it does not show (the creator page and Explore for a
 * product that ships) is never in either list, so it keeps what is saved.
 */
export function channelChanges(shown: Pick<Channel, "id" | "kind">[], saved: ReadonlySet<string>, now: ReadonlySet<string>): { list: string[]; unlist: string[] } {
  const list: string[] = []
  const unlist: string[] = []
  for (const c of shown) {
    const key = channelKey(c)
    if (now.has(key) && !saved.has(key)) list.push(key)
    else if (!now.has(key) && saved.has(key)) unlist.push(key)
  }
  return { list, unlist }
}
