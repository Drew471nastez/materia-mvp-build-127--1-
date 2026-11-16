import Image from "next/image"
import type { CSSProperties } from "react"
import { STORELIB_LOGO, STORELIB_LOGO_GROUND, STORELIB_LOGO_SHADOW, storelibLogoRadius } from "@/lib/brand/logo"
import { STORELIB_S_PATH, STORELIB_S_TRANSFORM } from "@/components/storelib-mark"

/* Landing round 11, the owner: "the Storelib icon in the footer should not be outlined like that". Round 9's white line art is gone. Landing round 12: the footer draws the solid mark (variant "solid", below); every other place draws the picture. */

/**
 * The solid mark's colours (landing round 13, the owner: "make the S white
 * and the square a black gradient with some depth that matches the footer's
 * colour", a dark app icon, not a white square and not outlined). The square
 * runs from a lifted near black at the top to the footer's own black at the
 * foot (footer.storelib-footer: #050506 to #0a0a0c), a soft light over its
 * top third, and a fine inner edge, `edge` CSS px wide, brightest along the
 * top and nearly gone at the foot.
 */
export const STORELIB_SOLID = {
  top: "#2a2a30",
  middle: "#141418",
  bottom: "#08080a",
  sheen: 0.09,
  edge: 1,
  edgeTop: 0.2,
  edgeBottom: 0.05,
} as const

/** The ring between a 200 unit square with corner `r` and the same square `inset` units in: two rounded rectangles, filled evenodd. */
function roundedRing(r: number, inset: number) {
  const rect = (o: number, rr: number) => {
    const a = o
    const b = 200 - o
    const k = Math.max(0, rr)
    const n = (v: number) => +v.toFixed(2)
    return `M${n(a + k)} ${n(a)}H${n(b - k)}A${n(k)} ${n(k)} 0 0 1 ${n(b)} ${n(a + k)}V${n(b - k)}A${n(k)} ${n(k)} 0 0 1 ${n(b - k)} ${n(b)}H${n(a + k)}A${n(k)} ${n(k)} 0 0 1 ${n(a)} ${n(b - k)}V${n(a + k)}A${n(k)} ${n(k)} 0 0 1 ${n(a + k)} ${n(a)}Z`
  }
  return rect(0, r) + rect(inset, r - inset)
}

/**
 * ===========================================================================
 *  THE STORELIB LOGO, THE ONE WAY IT IS DRAWN
 * ===========================================================================
 * Every page that shows the logo shows it through this: the header, the
 * sidebars, the footers, sign in, onboarding, checkout, the editors. The
 * owner's words: "everywhere it appears it must sit in a 7px border radius,
 * no sharp corners, with extremely little depth, just a tiny, almost
 * unnoticeable shadow". So the corner and the shadow live here and nowhere
 * else, and tests/brand-logo.test.ts fails on any other file that draws the
 * picture itself.
 *
 * `size` is the size it is drawn at. It is also the intrinsic width and
 * height, so the box is reserved before the file arrives and nothing moves
 * when it does. Through next/image, so a 32px logo downloads as a 64px AVIF
 * of about a kilobyte rather than the 512px original.
 *
 * `fluid`: the caller sizes it with classes (a logo that is 46px on a phone
 * and 40px on a laptop). Pass the largest size as `size`. A caller whose
 * sizes straddle 18px sets --storelib-logo-radius per breakpoint.
 *
 * `priority`: above the fold on first paint (the site header), so it is
 * preloaded instead of waiting for layout.
 *
 * `unoptimized`: the file itself rather than the optimizer's copy, for the
 * offline screen, where the optimizer is exactly what cannot be reached.
 *
 * No "use client": it renders the same on the server and in the browser.
 */
export function StorelibLogo({
  size,
  className,
  alt = "Storelib",
  priority = false,
  fluid = false,
  unoptimized = false,
  style,
  variant = "picture",
  ...rest
}: {
  size: number
  className?: string
  alt?: string
  priority?: boolean
  fluid?: boolean
  unoptimized?: boolean
  style?: CSSProperties
  /**
   * "solid": drawn, no picture (landing round 12, the owner, for the black
   * marketing footer: not outlined and not the colour logo). Landing round
   * 13, the owner: a dark app icon rather than a white square: the S in
   * `currentColor` (white by default) on a near black square that matches
   * the footer, with a gradient, a soft top light and a fine inner edge
   * (STORELIB_SOLID). Same box, same 7px corner, same letter
   * (components/storelib-mark). Every other place draws the picture.
   */
  variant?: "picture" | "solid"
} & { [data: `data-${string}`]: string | undefined }) {
  if (variant === "solid") {
    /* 200 units to the square, the corner the same share of it as the picture's. */
    const corner = (storelibLogoRadius(size) * 200) / size
    return (
      <svg
        {...rest}
        viewBox="0 0 200 200"
        width={size}
        height={size}
        role={alt ? "img" : undefined}
        aria-label={alt || undefined}
        aria-hidden={alt ? undefined : true}
        focusable="false"
        data-storelib-logo="solid"
        className={className}
        style={{ ...(fluid ? null : { width: size, height: size }), flexShrink: 0, color: "#fff", ...style }}
      >
        <defs>
          {/* The square: the footer's near black, lifted at the top and settling darker at the foot. */}
          <linearGradient id="storelib-solid-ground" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={STORELIB_SOLID.top} />
            <stop offset=".55" stopColor={STORELIB_SOLID.middle} />
            <stop offset="1" stopColor={STORELIB_SOLID.bottom} />
          </linearGradient>
          {/* A soft light across the top third, as on a dark app icon. */}
          <linearGradient id="storelib-solid-sheen" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#fff" stopOpacity={STORELIB_SOLID.sheen} />
            <stop offset=".42" stopColor="#fff" stopOpacity="0" />
          </linearGradient>
          {/* The fine inner edge: brightest along the top, almost gone at the foot. */}
          <linearGradient id="storelib-solid-edge" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#fff" stopOpacity={STORELIB_SOLID.edgeTop} />
            <stop offset=".5" stopColor="#fff" stopOpacity={STORELIB_SOLID.edgeBottom} />
            <stop offset="1" stopColor="#fff" stopOpacity={STORELIB_SOLID.edgeBottom} />
          </linearGradient>
        </defs>
        <rect width="200" height="200" rx={corner} fill="url(#storelib-solid-ground)" />
        <rect width="200" height="200" rx={corner} fill="url(#storelib-solid-sheen)" />
        {/* The edge is the ring between the square and the square one hairline in (a fill, evenodd), so it stays one hairline at any size and is never a drawn outline. */}
        <path d={roundedRing(corner, (STORELIB_SOLID.edge * 200) / size)} fill="url(#storelib-solid-edge)" fillRule="evenodd" />
        {/* The S in its own box, a fifth larger and centred, as it sits in the picture, in white (currentColor). data-keep-transform: globals.css flattens transforms inside a `.group` on touch screens, and this one places the S. */}
        <svg x={43.3} y={31.6} width={113.4} height={136.8} viewBox="54 43 94.5 114" overflow="visible">
          <path d={STORELIB_S_PATH} transform={STORELIB_S_TRANSFORM} fill="currentColor" data-keep-transform="" />
        </svg>
      </svg>
    )
  }
  return (
    <Image
      {...rest}
      src={STORELIB_LOGO}
      alt={alt}
      width={size}
      height={size}
      preload={priority}
      unoptimized={unoptimized}
      draggable={false}
      data-storelib-logo=""
      className={className}
      style={{
        ...(fluid ? null : { width: size, height: size }),
        flexShrink: 0,
        objectFit: "cover",
        borderRadius: `var(--storelib-logo-radius, ${storelibLogoRadius(size)}px)`,
        boxShadow: STORELIB_LOGO_SHADOW,
        /* The logo's own violet under it, so the square is there from the first frame and the S lands on it (round 3: a cold Log in drew "Storelib" with an empty space beside it first). */
        backgroundColor: STORELIB_LOGO_GROUND,
        ...style,
      }}
    />
  )
}
