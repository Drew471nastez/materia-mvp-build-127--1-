/**
 * ===========================================================================
 *  A SPACE'S ICON, THE ONE ITS ADMIN SEES
 * ===========================================================================
 * Round 12: "space chips show the icon the admin set for each space (find
 * why some do not)". Why: a space's icon column holds either the emoji the
 * admin typed or, for the spaces every community starts with, a word
 * ("messages-square", "megaphone", "hand", lib/communities/server/create.ts).
 * The admin's list (components/community/creator/spaces-section.tsx
 * spaceGlyph) shows a word as its kind's emoji (Announcements as 📣), but
 * the member side drew an emoji only and nothing for a word, so the same
 * Announcements had 📣 in the dashboard and no icon on its chip.
 *
 * Now one rule for every place a space is drawn (the chips, the search, the
 * chat's head, the post card and the composer through this function): the
 * admin's emoji when there is one, else its kind's, exactly as the admin's
 * list shows it. Pure and browser safe.
 */
import type { SpaceKind } from "@/lib/communities/types"

/** A kind's own emoji: the dashboard's KIND_ICON (spaces-section.tsx), the same four. */
export const KIND_GLYPH: Record<SpaceKind, string> = { feed: "💬", chat: "⚡", announcements: "📣", resources: "📚" }

/**
 * What a person reads as one character, so a family, a flag or a skin tone is one and is never cut in half (round 31).
 * Intl.Segmenter where the browser has it (every one this app supports), else code points.
 */
export function iconGraphemes(value: string): string[] {
  const Seg = (Intl as unknown as { Segmenter?: new (l?: string, o?: { granularity: "grapheme" }) => { segment: (s: string) => Iterable<{ segment: string }> } }).Segmenter
  if (Seg) return Array.from(new Seg(undefined, { granularity: "grapheme" }).segment(value), (s) => s.segment)
  return Array.from(value)
}

/**
 * The icon the admin chose (an emoji, or up to two letters of their own since round 31), or null for nothing or an old
 * word name. A word name is letters, digits and hyphens, longer than an icon may be ("megaphone", "hand").
 */
export function chosenEmoji(icon: string | null | undefined): string | null {
  const v = (icon || "").trim()
  if (!v) return null
  const parts = iconGraphemes(v)
  if (/^[a-z0-9-]+$/i.test(v) && parts.length > 2) return null
  return parts.slice(0, 2).join("")
}

/** What a space shows as its icon: the admin's emoji, else its kind's. */
export function spaceGlyph(icon: string | null | undefined, kind: SpaceKind | string | null | undefined): string {
  return chosenEmoji(icon) ?? KIND_GLYPH[(kind as SpaceKind) ?? "feed"] ?? KIND_GLYPH.feed
}
