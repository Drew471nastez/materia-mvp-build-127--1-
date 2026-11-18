import "server-only"

/**
 * ===========================================================================
 *  A PAID BLOCK'S LOCKED PART IS SEALED WHERE IT IS STORED
 * ===========================================================================
 * Paid access (lib/onepage/paid-access) keeps a few lines of text and a link
 * behind one of the creator's products: a private video, a folder, the
 * download page buyers paid for. It was taken out only when the page was
 * drawn (withoutLocked). In the table it sat in the blocks' JSON as written,
 * and a published page's row can be read with the public anon key that every
 * browser holds (the public signup read it that way on storelib.me), so the
 * paid part was one request away for anybody who asked the table directly.
 *
 * So it is sealed before it is written: AES-256-GCM with the server's key
 * (lib/physical/secrets, as integration keys are), in one `locked_sealed`
 * field beside two plain flags the page needs (is there text, is there a
 * link). Only the server opens it: for the page's own editor, and in
 * app/api/onepage/access for a buyer. A deployment with no key keeps the
 * plain text, as before, and says so in the log once.
 *
 * Blocks saved before this are read as they are (plain) and sealed on their
 * next save.
 */
import { openSecret, sealSecret } from "@/lib/physical/secrets"
import { isPaidBlock, LOCKED_FIELDS } from "./paid-access"

type Block = { type?: unknown; data?: unknown; [k: string]: unknown }

export const SEALED_FIELD = "locked_sealed"

let warned = false

function mapBlocks<T>(blocks: T, each: (data: Record<string, unknown>) => Record<string, unknown> | null): T {
  if (!Array.isArray(blocks)) return blocks
  let changed = false
  const out = blocks.map((raw) => {
    const b = raw as Block | null
    if (!b || typeof b !== "object") return raw
    const data = (b.data ?? null) as Record<string, unknown> | null
    if (b.type === "group" && data && Array.isArray(data.children)) {
      const children = mapBlocks(data.children, each)
      if (children === data.children) return raw
      changed = true
      return { ...b, data: { ...data, children } }
    }
    if (!isPaidBlock(b) || !data) return raw
    const next = each(data)
    if (!next) return raw
    changed = true
    return { ...b, data: next }
  })
  return (changed ? out : blocks) as T
}

/** The blocks with every paid block's locked part sealed, groups included. A copy; the input is not changed. */
export function sealLocked<T>(blocks: T): T {
  return mapBlocks(blocks, (data) => {
    const plain = LOCKED_FIELDS.some((k) => k in data)
    if (!plain) return null
    const text = typeof data.locked_text === "string" ? data.locked_text.slice(0, 4000) : ""
    const url = typeof data.locked_url === "string" ? data.locked_url.trim().slice(0, 2000) : ""
    const label = typeof data.locked_label === "string" ? data.locked_label.slice(0, 40) : ""
    let sealed: string
    try {
      sealed = sealSecret(JSON.stringify({ text, url, label }))
    } catch {
      if (!warned) {
        warned = true
        console.warn("[onepage] no key to seal a paid block's locked part with: kept as written (set COMMERCE_SECRETS_KEY)")
      }
      return null
    }
    const clean: Record<string, unknown> = { ...data }
    for (const k of LOCKED_FIELDS) delete clean[k]
    clean[SEALED_FIELD] = sealed
    clean.locked_has_text = !!text.trim()
    clean.locked_has_link = !!url
    return clean
  })
}

/** One paid block's data with its locked part opened (for the access route), or as it was when it holds none sealed. */
export function openLockedData<T extends Record<string, unknown> | null | undefined>(data: T): T {
  if (!data || typeof data !== "object" || typeof data[SEALED_FIELD] !== "string") return data
  const opened = openSecret(data[SEALED_FIELD] as string)
  const clean: Record<string, unknown> = { ...data }
  delete clean[SEALED_FIELD]
  if (opened) {
    try {
      const v = JSON.parse(opened) as { text?: unknown; url?: unknown; label?: unknown }
      clean.locked_text = typeof v.text === "string" ? v.text : ""
      clean.locked_url = typeof v.url === "string" ? v.url : ""
      clean.locked_label = typeof v.label === "string" ? v.label : ""
    } catch {
      /* Unreadable: nothing opens, which is the safe answer. */
    }
  }
  return clean as T
}

/** The blocks with every paid block's locked part opened, for the page's own editor. */
export function openLocked<T>(blocks: T): T {
  return mapBlocks(blocks, (data) => (typeof data[SEALED_FIELD] === "string" ? openLockedData(data) : null))
}
