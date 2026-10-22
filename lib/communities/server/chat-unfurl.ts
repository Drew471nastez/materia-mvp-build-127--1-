import "server-only"

/**
 * ===========================================================================
 *  A LINK'S CARD FOR A CHAT MESSAGE, READ BY STORELIB'S SERVER (round 38)
 * ===========================================================================
 * The composer asks /api/community/<id>/chat/unfurl?url= while a member
 * writes; the card shows above the box and goes with the message.
 *
 * SAFE TO ASK FOR ANY ADDRESS. The page is fetched by lib/api/public-fetch
 * (the same fetch a post's link card uses, feed.ts fetchLinkPreview): http or
 * https on the standard ports, no credentials, the address a name resolves to
 * checked as the socket connects (so no loopback, private, link local or
 * metadata address, and no name that answers public and then private), every
 * redirect checked the same way and three at most, 512 KB and four seconds at
 * most, and no cookies or headers of the member's. A YouTube or Vimeo video
 * is read from their oEmbed answer instead (a title and a still), through the
 * same fetch.
 *
 * KEPT. What was read is kept here for an hour (a page that gave nothing,
 * ten minutes), 500 addresses at most, so a link pasted by many people is
 * read once.
 *
 * SIGNED. The card is signed with a server key (signChatCard). A message
 * keeps a card's title, words and picture only when the signature is the
 * server's (chat-media.ts); anything else keeps the address and its site
 * name, nothing a sender wrote.
 */
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto"
import { fetchPublic } from "@/lib/api/public-fetch"
import { chatCardPayload, cleanChatCard, siteOf, type ChatLinkCard } from "../chat-links"
import { EMBED_NAMES, embedThumbUrl, postEmbedFromUrl } from "../post-media"
import { PREVIEW_MAX_BYTES, PREVIEW_TIMEOUT_MS, linkUrl, parsePreview } from "./feed"

const KEEP_MS = 60 * 60_000
const KEEP_EMPTY_MS = 10 * 60_000
const KEEP_MAX = 500
const READ = new Map<string, { at: number; card: ChatLinkCard | null }>()

const PROCESS_SECRET = randomBytes(32).toString("hex")
function secret(): string {
  return process.env.CHAT_LINK_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || PROCESS_SECRET
}

export function signChatCard(card: ChatLinkCard, key: string = secret()): string {
  return createHmac("sha256", `chat-link-card:${key}`).update(chatCardPayload(card)).digest("base64url").slice(0, 32)
}

export function chatCardSigned(card: ChatLinkCard, sig: unknown, key: string = secret()): boolean {
  if (typeof sig !== "string" || sig.length !== 32) return false
  const want = Buffer.from(signChatCard(card, key))
  const got = Buffer.from(sig)
  return want.length === got.length && timingSafeEqual(want, got)
}

function keep(url: string, card: ChatLinkCard | null) {
  if (READ.size >= KEEP_MAX) {
    const oldest = READ.keys().next().value
    if (oldest !== undefined) READ.delete(oldest)
  }
  READ.set(url, { at: Date.now(), card })
}

async function oembed(endpoint: string): Promise<{ title?: string; thumbnail_url?: string } | null> {
  try {
    const res = await fetchPublic(endpoint, { maxBytes: 64 * 1024, timeoutMs: PREVIEW_TIMEOUT_MS, maxRedirects: 2 })
    if (!res.ok) return null
    const json = (await res.json()) as Record<string, unknown>
    return { title: typeof json.title === "string" ? json.title : undefined, thumbnail_url: typeof json.thumbnail_url === "string" ? json.thumbnail_url : undefined }
  } catch {
    return null
  }
}

async function read(url: string): Promise<ChatLinkCard | null> {
  const video = postEmbedFromUrl(url)
  if (video && video.provider !== "loom") {
    const endpoint = video.provider === "youtube" ? `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(video.url)}` : `https://vimeo.com/api/oembed.json?url=${encodeURIComponent(video.url)}`
    const o = await oembed(endpoint)
    return cleanChatCard({ url: video.url, title: o?.title, image: video.thumb ?? embedThumbUrl(o?.thumbnail_url) ?? undefined, site: EMBED_NAMES[video.provider] })
  }
  try {
    const res = await fetchPublic(url, { maxBytes: PREVIEW_MAX_BYTES, timeoutMs: PREVIEW_TIMEOUT_MS, maxRedirects: 3 })
    if (!res.ok || !/text\/html|application\/xhtml/i.test(res.headers.get("content-type") || "")) return cleanChatCard({ url, site: siteOf(url) })
    const p = parsePreview(await res.text(), url)
    return cleanChatCard({ url, title: p.title, description: p.description, image: p.image, site: p.site ?? siteOf(url) })
  } catch {
    return null
  }
}

/** The card for an address somebody typed, or null when it is not a public web address or nothing could be read. */
export async function unfurlForChat(raw: unknown): Promise<ChatLinkCard | null> {
  const url = linkUrl(typeof raw === "string" ? raw.trim() : raw)
  if (!url) return null
  const hit = READ.get(url)
  if (hit && Date.now() - hit.at < (hit.card ? KEEP_MS : KEEP_EMPTY_MS)) return hit.card
  const card = await read(url)
  keep(url, card)
  return card
}
