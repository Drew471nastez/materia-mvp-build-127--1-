/**
 * ===========================================================================
 *  LINKS IN A CHAT MESSAGE (round 38)
 * ===========================================================================
 * The owner: "links, YouTube embeds, make sure the chat supports it, very
 * smooth and clean". Pure and browser safe: the composer, the bubble and the
 * server (lib/communities/server/chat-media.ts, chat-unfurl.ts) all decide
 * with these.
 *
 *   A LINK      an http or https address in the words, never anything else
 *               (a javascript: or data: address is words, not a link); it
 *               opens in a new tab, marked as somebody else's
 *               (rel="noopener noreferrer nofollow ugc").
 *   ITS CARD    the page's title, its line about itself, its picture and its
 *               site, as Storelib's server read them (never the browser:
 *               chat-unfurl.ts, public addresses only). One per message. The
 *               server signs what it read, so a card a message carries is
 *               the server's and not words a sender made up (chatCardPayload).
 *   A VIDEO     a YouTube, Vimeo or Loom address is a still with a play
 *               button; pressed, it plays in that site's privacy player
 *               (youtube-nocookie.com, Vimeo with do not track). Nothing of
 *               theirs loads until then, so a chat full of videos stays light.
 */
import { postEmbedFromUrl, type PostEmbedRef } from "./post-media"

/** The same addresses the words make into links (components/community/member/body-text.tsx). */
const URL_IN_WORDS = /https?:\/\/[^\s<>"']+[^\s<>"'.,;:!?)\]]/gi

export const CHAT_LINK_MAX_CHARS = 2000
export const CHAT_CARD_TITLE_MAX = 200
export const CHAT_CARD_WORDS_MAX = 300
export const CHAT_CARD_SITE_MAX = 80

/** An http or https address with no credentials, as a string, or null. */
export function webUrl(value: unknown, max = CHAT_LINK_MAX_CHARS): string | null {
  if (typeof value !== "string" || !value || value.length > max) return null
  try {
    const u = new URL(value.trim())
    if ((u.protocol !== "https:" && u.protocol !== "http:") || u.username || u.password || !u.hostname.includes(".")) return null
    return u.toString()
  } catch {
    return null
  }
}

/** An https picture address, or null. */
export function httpsPicture(value: unknown): string | null {
  const u = webUrl(value, 1000)
  return u && u.startsWith("https://") ? u : null
}

/** The addresses in a message's words, in order, each once (at most five). */
export function linksIn(text: string | null | undefined): string[] {
  if (!text) return []
  const out: string[] = []
  for (const m of text.matchAll(URL_IN_WORDS)) {
    const u = webUrl(m[0])
    if (u && !out.includes(u)) out.push(u)
    if (out.length >= 5) break
  }
  return out
}

/** The first address in the words, the one a message's card is for. */
export function firstLink(text: string | null | undefined): string | null {
  return linksIn(text)[0] ?? null
}

/** The first YouTube, Vimeo or Loom video named in the words or by the message's card. */
export function chatVideoOf(text: string | null | undefined, card?: { url: string } | null): PostEmbedRef | null {
  for (const u of [...(card ? [card.url] : []), ...linksIn(text)]) {
    const ref = postEmbedFromUrl(u)
    if (ref) return ref
  }
  return null
}

export interface ChatLinkCard {
  url: string
  title?: string
  description?: string
  image?: string
  site?: string
}

function line(value: unknown, max: number): string {
  if (typeof value !== "string") return ""
  return value
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max)
}

/** A card as it is kept and drawn: every field checked, the empty ones left out; null without a good address. */
export function cleanChatCard(raw: unknown): ChatLinkCard | null {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>
  const url = webUrl(r.url)
  if (!url) return null
  const title = line(r.title, CHAT_CARD_TITLE_MAX)
  const description = line(r.description, CHAT_CARD_WORDS_MAX)
  const site = line(r.site, CHAT_CARD_SITE_MAX)
  const image = httpsPicture(r.image)
  return { url, ...(title ? { title } : {}), ...(description ? { description } : {}), ...(image ? { image } : {}), ...(site ? { site } : {}) }
}

/** What the server signs for a card: its fields in one fixed order, so the same card always reads the same. */
export function chatCardPayload(card: ChatLinkCard): string {
  return JSON.stringify(["chat-link-card:v1", card.url, card.title ?? "", card.description ?? "", card.image ?? "", card.site ?? ""])
}

/** The site's name for a card the server did not read: its host, without www. */
export function siteOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "").slice(0, CHAT_CARD_SITE_MAX)
  } catch {
    return ""
  }
}
