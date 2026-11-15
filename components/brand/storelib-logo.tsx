import Image from "next/image"
import type { CSSProperties } from "react"
import { STORELIB_S_PATH, STORELIB_S_TRANSFORM } from "@/components/storelib-mark"
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
  variant = "picture",
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
  /**
   * "outline": the same mark as white line art, no violet (landing round 9,
   * the owner, for the black marketing footer: "a white outline version, not
   * the colourful purple one"). The square's edge and the S are both drawn as
   * lines in `currentColor`, from the letter's real curves
   * (components/storelib-mark), in the same box and corner as the picture.
   * Nothing to download. Every other place draws the picture.
   */
  variant?: "picture" | "outline"
} & { [data: `data-${string}`]: string | undefined }) {
  if (variant === "outline") {
    /* 200 units to the square: the corner as the same share of it as the picture's, the lines 1.5px at 40px. */
    const unit = 200 / size
    const stroke = Math.max(1.25, size / 27) * unit
    const corner = storelibLogoRadius(size) * unit
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
        data-storelib-logo="outline"
        className={className}
        fill="none"
        stroke="currentColor"
        strokeWidth={stroke}
        strokeLinejoin="round"
        style={{ ...(fluid ? null : { width: size, height: size }), flexShrink: 0, color: "#fff", overflow: "visible", ...style }}
      >
        <rect x={stroke / 2} y={stroke / 2} width={200 - stroke} height={200 - stroke} rx={corner} />
        {/*
          The S in its own box (x 55 to 147.4, y 44 to 155.9 of the letter's
          200 units), drawn a fifth larger and centred, as it sits in the
          picture: an inner viewBox sizes it, so its line is divided by the
          same fifth to stay as thick as the square's.
          data-keep-transform: globals.css flattens transforms inside a
          `.group` on touch screens, and this one places the S.
        */}
        <svg x={43.3} y={31.6} width={113.4} height={136.8} viewBox="54 43 94.5 114" overflow="visible">
          <path d={STORELIB_S_PATH} transform={STORELIB_S_TRANSFORM} strokeWidth={stroke / 1.2} data-keep-transform="" />
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
