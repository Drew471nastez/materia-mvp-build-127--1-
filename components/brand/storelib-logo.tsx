import Image from "next/image"
import type { CSSProperties } from "react"
import { STORELIB_LOGO, STORELIB_LOGO_GROUND, STORELIB_LOGO_SHADOW, storelibLogoRadius } from "@/lib/brand/logo"
import { STORELIB_S_PATH, STORELIB_S_TRANSFORM } from "@/components/storelib-mark"

/* Landing round 11, the owner: "the Storelib icon in the footer should not be outlined like that". Round 9's white line art is gone. Landing round 12: the footer draws the solid mark (variant "solid", below); every other place draws the picture. */

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
   * "solid": one flat colour, no picture (landing round 12, the owner, for
   * the black marketing footer: a solid mark like Shopify's, not outlined
   * and not the colour logo). The square is filled in `currentColor` (white
   * by default) and the S is cut out of it, so the footer's own black shows
   * through the letter, the way Shopify's white bag carries its S. Same box,
   * same 7px corner, same letter (components/storelib-mark). Every other
   * place draws the picture.
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
        <mask id="storelib-solid-cut" maskUnits="userSpaceOnUse" x="0" y="0" width="200" height="200">
          <rect width="200" height="200" fill="#fff" />
          {/* The S in its own box, a fifth larger and centred, as it sits in the picture. data-keep-transform: globals.css flattens transforms inside a `.group` on touch screens, and this one places the S. */}
          <svg x={43.3} y={31.6} width={113.4} height={136.8} viewBox="54 43 94.5 114" overflow="visible">
            <path d={STORELIB_S_PATH} transform={STORELIB_S_TRANSFORM} fill="#000" data-keep-transform="" />
          </svg>
        </mask>
        <rect width="200" height="200" rx={corner} fill="currentColor" mask="url(#storelib-solid-cut)" />
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
