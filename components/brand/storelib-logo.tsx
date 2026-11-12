import Image from "next/image"
import type { CSSProperties } from "react"
import { STORELIB_LOGO, STORELIB_LOGO_GROUND, STORELIB_LOGO_SHADOW, storelibLogoRadius } from "@/lib/brand/logo"

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
  ...rest
}: {
  size: number
  className?: string
  alt?: string
  priority?: boolean
  fluid?: boolean
  unoptimized?: boolean
  style?: CSSProperties
} & { [data: `data-${string}`]: string | undefined }) {
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
