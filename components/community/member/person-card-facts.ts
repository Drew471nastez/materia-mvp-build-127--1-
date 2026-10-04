/**
 * THE HOVER CARD'S WORDS AND TIMING, pure and browser safe, so the card
 * (person-card.tsx), its probe and its tests read the same numbers.
 */
import { relativeTime } from "@/lib/communities/format"

/** How long a pointer rests on a name before the card opens. Long enough that passing over a feed opens nothing. */
export const CARD_OPEN_MS = 350
/** How long the card waits after the pointer leaves, so it can cross the gap from the name into the card. */
export const CARD_GRACE_MS = 160
/** How long a card's facts are reused before they are asked for again. */
export const CARD_TTL_MS = 60_000
/** Seen this recently by the heartbeat: here now. The same five minutes as the community's Online count. */
export const ONLINE_MS = 5 * 60_000

/** "Online now", "Active 2h ago", "Active Oct 2"; empty when it is not known. */
export function activeLabel(iso: string | null | undefined, now: number = Date.now()): string {
  if (!iso) return ""
  const t = Date.parse(iso)
  if (!Number.isFinite(t)) return ""
  if (now - t < ONLINE_MS) return "Online now"
  const ago = relativeTime(iso, now)
  return /^\d+[mhd]$/.test(ago) ? `Active ${ago} ago` : `Active ${ago}`
}

/** "1 community", "4 communities (1 in common)"; empty for none. */
export function communitiesLine(c: { count: number; inCommon: number } | null | undefined): string {
  if (!c || c.count <= 0) return ""
  const base = `${c.count} ${c.count === 1 ? "community" : "communities"}`
  return c.inCommon > 0 ? `${base} (${Math.min(c.inCommon, c.count)} in common)` : base
}

/** "Owner of 2 communities"; empty for none. */
export function ownerLine(n: number | null | undefined): string {
  if (!n || n <= 0) return ""
  return `Owner of ${n} ${n === 1 ? "community" : "communities"}`
}

/**
 * Whether a pointer event may open the card: a mouse, a trackpad or a pen
 * hovering. Decided per event rather than per device, so a laptop with a
 * touch screen gets the card from its trackpad and never from a finger, and
 * on a phone a tap is a tap and goes to the person's page.
 */
export function hoverPointer(pointerType: string): boolean {
  return pointerType === "mouse" || pointerType === "pen"
}
