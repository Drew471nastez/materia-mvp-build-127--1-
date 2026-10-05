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

/** An emoji the admin typed (at most two characters), or null for nothing or an old word name. */
export function chosenEmoji(icon: string | null | undefined): string | null {
  const v = (icon || "").trim()
  if (!v || /^[a-z0-9-]+$/i.test(v)) return null
  return Array.from(v).slice(0, 2).join("")
}

/** What a space shows as its icon: the admin's emoji, else its kind's. */
export function spaceGlyph(icon: string | null | undefined, kind: SpaceKind | string | null | undefined): string {
  return chosenEmoji(icon) ?? KIND_GLYPH[(kind as SpaceKind) ?? "feed"] ?? KIND_GLYPH.feed
}
