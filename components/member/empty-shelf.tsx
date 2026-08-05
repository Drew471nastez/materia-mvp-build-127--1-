"use client"

/**
 * The mark above "Niciun articol listat", moving.
 *
 * ---------------------------------------------------------------------------
 * Why it is drawn here rather than played from a file
 * ---------------------------------------------------------------------------
 * The reference for this was a Creattie loop, and following it literally would
 * have meant three things worth refusing. It is a licensed third-party asset.
 * Playing it needs a Lottie runtime — a quarter of a megabyte of JavaScript to
 * animate one 64px mark on a page whose whole point is that it has nothing on
 * it. And that particular file is called "Voice Message": a hand holding a
 * phone with sound waves coming out of it, which is a fine animation and has
 * nothing to do with a wardrobe nobody has listed anything in yet.
 *
 * So this is the same intent — a soft, endless loop rather than a static glyph
 * — built from what the browser already has. Two transforms and one opacity, on
 * four small elements, every one of them a property the compositor animates on
 * its own thread. No file to fetch, no runtime to load, nothing to decode, and
 * it runs at whatever the display refreshes at rather than at the 24 frames the
 * source was baked to.
 *
 * ---------------------------------------------------------------------------
 * Why THIS motion
 * ---------------------------------------------------------------------------
 * A hanger that sways. It is the object the sentence underneath is about, an
 * empty one says exactly what the empty state means without a word, and a
 * pendulum is the one motion that can loop forever without ever looking like it
 * is restarting — it is symmetrical, so its end IS its beginning.
 *
 * The pivot is the hook, not the centre of the box, because that is where a
 * hanger actually turns; swinging around the middle is the tell that something
 * is being rotated rather than hanging. The ring behind it breathes on a longer
 * cycle than the swing, so the two never fall into step and the loop does not
 * develop a beat.
 */

export function EmptyShelf({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={`empty-shelf relative flex h-16 w-16 items-center justify-center rounded-full bg-neutral-100 text-neutral-400 ${className ?? ""}`}
    >
      {/* The breath. A ring rather than a filled disc: filled, it dims the
          glyph as it passes over it; as a ring it reads as air moving. */}
      <span className="empty-shelf-ring" />

      <svg viewBox="0 0 48 48" className="relative h-8 w-8 overflow-visible">
        {/* The rail it hangs from. Fixed — the only still thing in the frame,
            which is what gives the swing something to be measured against. */}
        <path d="M8 11h32" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" opacity="0.42" />

        {/* Everything below turns about the point where the hook meets the
            rail, because that is where a hanger actually pivots. Swinging it
            around the centre of the box is the tell that something is being
            rotated rather than hanging. */}
        <g className="empty-shelf-swing" style={{ transformOrigin: "23px 11px" }}>
          {/* The hook, drawn as one curl that crosses the rail and comes back
              down — a hanger's hook is the part that says it is a hanger, and a
              straight stem with a bend on it does not. */}
          <path
            d="M21.2 13.6a3 3 0 1 1 2.8 4.4v1.6"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {/* The shoulders. Rounded at both ends of the bottom bar so the
              triangle reads as bent wire rather than as a drawn shape. */}
          <path
            d="M24 19.6 10.4 29.6a1.7 1.7 0 0 0 1 3.1h25.2a1.7 1.7 0 0 0 1-3.1L24 19.6Z"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </g>

        {/* One spark, on its own much slower cycle, so the loop has something
            that is not simply the swing again. It is the only part of this that
            is brand-coloured — a mark of colour on an otherwise grey glyph is
            what stops an empty state reading as a disabled one. */}
        <circle className="empty-shelf-spark" cx="37" cy="16" r="2.1" fill="#7c3aed" />
      </svg>
    </span>
  )
}
