/**
 * ===========================================================================
 *  WHAT THE ANNOUNCEMENT BAR SAYS, AND FOR HOW LONG
 * ===========================================================================
 * Theme settings › Announcement bar has a message, and now more messages,
 * one per line, which take turns. The bar itself is in ThemePage; the rules
 * are here, pure, so a test can read them.
 */

/** Most messages a bar takes turns between. More than this is a paragraph. */
export const MAX_ANNOUNCEMENTS = 6

/** The messages, in order: the first message, then each non-empty line of the rest, each once. */
export function announcementMessages(theme: Record<string, unknown>): string[] {
  const first = typeof theme.announcement_bar_text === "string" ? theme.announcement_bar_text.trim() : ""
  const more = typeof theme.announcement_bar_messages === "string" ? theme.announcement_bar_messages.split(/\r?\n/) : []
  const out: string[] = []
  for (const line of [first, ...more]) {
    const t = line.replace(/\s+/g, " ").trim().slice(0, 200)
    if (t && !out.includes(t)) out.push(t)
    if (out.length >= MAX_ANNOUNCEMENTS) break
  }
  return out
}

/** Seconds per message, 3 to 10, 5 unless set. */
export function announcementSeconds(theme: Record<string, unknown>): number {
  const n = Number(theme.announcement_bar_rotate)
  return Number.isFinite(n) && n > 0 ? Math.min(10, Math.max(3, Math.round(n))) : 5
}
