/**
 * ===========================================================================
 *  A SPACE'S ICON, AS THE ADMIN TYPES ONE (round 31)
 * ===========================================================================
 * The owner: the Icon field "doesn't work at all" (a caret over the emoji,
 * and a pasted family or flag cut in half by a two code point slice). The
 * icon is now picked from Storelib's emoji picker or typed into a field of
 * its own, and checked here: one emoji, or up to two characters of the
 * admin's own ("AI", "Q", "1"), counted the way a person counts them
 * (graphemes), never a word long enough to read as one of the old word names
 * (components/community/member/space-glyph.ts chosenEmoji draws what this
 * lets through, everywhere a space is shown).
 *
 * A picture as an icon is not offered: community_spaces.icon is text, and
 * every place a space is drawn (the chips, the search, the composer, a post's
 * space line) draws it as text. Pure and browser safe.
 */
import { iconGraphemes } from "@/components/community/member/space-glyph"
import { tt } from "@/lib/i18n/text"

/** The most a space's icon may be, as a person counts characters. */
export const ICON_MAX = 2
/** A ceiling on the stored text itself, under the column's 40, for an emoji sequence built to be long. */
const ICON_MAX_UNITS = 24

/** Whether the icon is an emoji (drawn at the emoji's size) rather than letters (drawn smaller and bold). */
export function isEmojiIcon(value: string): boolean {
  return /\p{Extended_Pictographic}|\p{Regional_Indicator}/u.test(value)
}

export type IconCheck = { ok: true; value: string } | { ok: false; error: string }

/**
 * What the admin typed or pasted, made an icon: spaces and invisible characters taken out, then at most ICON_MAX
 * characters. Empty is fine (the space's kind then gives its icon).
 */
export function checkSpaceIcon(raw: string): IconCheck {
  const value = raw
    .normalize("NFC")
    .replace(/[\s\u0000-\u001f\u007f-\u009f]+/g, "")
    .replace(/[<>]/g, "")
  if (!value) return { ok: true, value: "" }
  const parts = iconGraphemes(value)
  if (parts.length > ICON_MAX || value.length > ICON_MAX_UNITS) return { ok: false, error: tt("One emoji, or up to two letters.") }
  return { ok: true, value }
}
