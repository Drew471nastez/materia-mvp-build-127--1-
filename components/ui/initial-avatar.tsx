"use client"

import { useState } from "react"
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
  // An avatar url that does not resolve must not leave a hole.
  //
  // This is the other half of the question mark: a broken <img> paints the
  // BROWSER's placeholder — a grey box with a "?" in it — and that looks
  // identical to a missing name, so the two bugs were indistinguishable from
  // the outside. A url can fail for reasons nobody here controls: an account
  // deleted its picture, an OAuth avatar moved, a host is not on the optimizer's
  // allowlist. In all of them the right answer is the letter, immediately.
  const [broken, setBroken] = useState(false)

  const letter = initialOf(name)
  const { bg, fg } = hueFor(seed || name || "storelib")

  /**
   * THE LETTER IS ALWAYS UNDERNEATH, even when there is a photograph.
   *
   * The photo used to be the only thing rendered whenever a url existed, and
   * that is the white flash in the conversation list: an <img> paints NOTHING
   * until its bytes are decoded, and it decodes on every mount — coming back
   * from a chat remounts the whole inbox, so every avatar spent its first
   * frames as an empty circle with the white card showing through it, and then
   * the faces popped in one by one. The bytes were cached; the PAINT is what
   * cannot be cached across a remount.
   *
   * So the coloured initial — which is pure CSS and paints on the first frame,
   * always — sits underneath, and the photograph simply covers it whenever it
   * is ready. On a warm cache that is a frame or two of colour nobody registers;
   * on a cold load it is a plausible identity instead of a hole; on a broken
   * url it is the fallback this component already believed in. Nothing waits
   * for an onLoad event, because a load event that fails to fire must never be
   * able to leave somebody invisible.
   */
  const fallback = (
    <span
      aria-hidden
      className="absolute inset-0 flex items-center justify-center rounded-full font-semibold"
      style={{ background: bg, color: fg, fontSize: Math.round(size * 0.42) }}
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

  if (url && !broken) {
    // An SVG cannot go through next/image, and the reason is not a limitation
    // to work around: the optimizer refuses vector sources unless
    // `dangerouslyAllowSVG` is turned on, which would apply to EVERY remote
    // host in remotePatterns — including the OAuth avatar providers — and an
    // SVG served from a host you do not control is a script-execution surface.
    //
    // A plain <img> is the correct answer instead of the flag. An SVG loaded as
    // an image is rendered with scripting disabled by the browser itself, so
    // the one asset that needs this (Storelib's own mark) is safe, and nothing
    // else gains permission it did not have. There is nothing to optimise
    // either: it is vector, and already a few hundred bytes.
    const photo = /\.svgx?(\?|$)/i.test(url) ? (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={url}
        alt=""
        width={size}
        height={size}
        onError={() => setBroken(true)}
        className="absolute inset-0 h-full w-full rounded-full object-cover"
      />
    ) : (
      <Image
        src={url}
        alt=""
        width={size}
        height={size}
        onError={() => setBroken(true)}
        className="absolute inset-0 h-full w-full rounded-full object-cover"
      />
    )
    return (
      // `overflow-hidden` so the photo's corners cannot poke past the circle
      // for the frame before its own border-radius applies.
      <span className={cn("relative inline-block shrink-0 overflow-hidden rounded-full", className)} style={dimension}>
        {fallback}
        {photo}
      </span>
    )
  }

  return (
    <span className={cn("relative inline-block shrink-0 rounded-full", className)} style={dimension}>
      {fallback}
    </span>
  )
}
