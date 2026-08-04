"use client"

import Image from "next/image"
import { cn } from "@/lib/utils"

/**
 * Somebody's face, or the next best thing.
 *
 * The next best thing was a question mark. `(name || "?")` is what several
 * places fell back to, so an account with no display name and no username —
 * which is every account for the minute between signing up and filling anything
 * in — showed a grey circle with "?" in it, next to a message they had just
 * sent you. That is not a placeholder, it is the app saying it does not know who
 * this is.
 *
 * So: an initial where there is one, and a person glyph where there is not.
 * Never punctuation.
 *
 * The colour is derived from the id rather than picked, which is what makes
 * these read as identity instead of as absence. The same person is the same
 * colour on every screen and in every session, so you learn a face even when
 * there is no face — and it is a hash rather than a random, because a colour
 * that changes on reload is worse than no colour at all. Six hues, all pinned to
 * the same lightness so white text sits legibly on any of them.
 */

const HUES = [
  { bg: "#7c3aed", fg: "#ffffff" }, // brand violet
  { bg: "#0ea5e9", fg: "#ffffff" }, // sky
  { bg: "#10b981", fg: "#ffffff" }, // emerald
  { bg: "#f59e0b", fg: "#1c1917" }, // amber — dark text, it is too bright for white
  { bg: "#ef4444", fg: "#ffffff" }, // red
  { bg: "#8b5cf6", fg: "#ffffff" }, // violet
]

function hueFor(seed: string): { bg: string; fg: string } {
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0
  return HUES[h % HUES.length]
}

/** The first letter that is actually a letter — skipping emoji, punctuation and
 *  the spaces people put in front of their own names. */
function initialOf(name: string | null | undefined): string | null {
  if (!name) return null
  const m = name.trim().match(/\p{L}|\p{N}/u)
  return m ? m[0].toUpperCase() : null
}

export function InitialAvatar({
  name,
  url,
  seed,
  size = 48,
  className,
}: {
  name: string | null | undefined
  url?: string | null
  /** Stable identity for the colour. The user id, ideally — a name would change
   *  the colour the day somebody edits their profile. */
  seed?: string | null
  size?: number
  className?: string
}) {
  const dimension = { width: size, height: size }

  if (url) {
    return (
      <Image
        src={url}
        alt=""
        width={size}
        height={size}
        className={cn("shrink-0 rounded-full object-cover", className)}
        style={dimension}
      />
    )
  }

  const letter = initialOf(name)
  const { bg, fg } = hueFor(seed || name || "storelib")

  return (
    <span
      aria-hidden
      className={cn("flex shrink-0 items-center justify-center rounded-full font-semibold", className)}
      style={{ ...dimension, background: bg, color: fg, fontSize: Math.round(size * 0.42) }}
    >
      {letter ?? (
        // No name at all. A person, not a question mark — the app not knowing
        // somebody's name is not a question it should be asking the reader.
        <svg viewBox="0 0 24 24" fill="none" width={Math.round(size * 0.52)} height={Math.round(size * 0.52)}>
          <circle cx="12" cy="8" r="3.4" fill="currentColor" />
          <path d="M4.5 20c0-3.6 3.4-6 7.5-6s7.5 2.4 7.5 6" fill="currentColor" />
        </svg>
      )}
    </span>
  )
}
