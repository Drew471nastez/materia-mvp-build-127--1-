/**
 * The digital product the checkout scene sells in its mocks. Landing round 8
 * (the owner: the Cine Tones LUT pack "with the same cover as in Sell what
 * you make", in place of the e-book the earlier rounds sold): Mara Quinn's
 * Cine Tones LUT Pack, a set of colour grading looks for video.
 *
 * The cover is the one everything-in-one-place.tsx draws, built here again
 * from the same picture (public/home/everything/lut-still.webp, a graded
 * desert road still): black, the still across the top fading into it, a small
 * "LUT Pack" over it, and "Cine Tones" big and heavy at the foot. It is sized
 * in its own container units, so the same markup reads at 48px in an order
 * line and at 300px in a store tile.
 */

export const EBOOK = {
  title: "Cine Tones LUT Pack",
  author: "Mara Quinn",
  kind: "LUT pack",
  file: "Cine-Tones-LUT-Pack.zip",
  size: "38.2 MB",
  priceCents: 2900,
} as const
/** The same product under its own name. */
export const LUT_PACK = EBOOK

export const LUT_STILL = "/home/everything/lut-still.webp"
/** The same still at 240 x 135 (7 KB, against 55 KB), for a cover drawn at thumbnail size: an order line, the instant checkout's head. Landing round 12 (the page audit: the 720px still was drawn 21 to 28px wide). */
export const LUT_STILL_SMALL = "/home/everything/lut-still-240.webp"
/** The still at every width it is kept at (landing round 19: a 480px copy too, scripts/build-home-image-variants.mjs), for srcset. */
export const LUT_STILL_SET = `${LUT_STILL_SMALL} 240w, /home/everything/lut-still-480.webp 480w, ${LUT_STILL} 720w`

/** `small`: the cover is drawn under about 120px wide, so it takes the small still. */
export function EbookCover({ className = "", small = false }: { className?: string; small?: boolean }) {
  return (
    <span className={`ebc ${className}`}>
      {/* Landing round 19: the full cover is drawn about a third of a phone wide (125px at 390) and 16% of a wider screen, so it takes the 480px copy on a phone. */}
      <img className="ebc-img" src={small ? LUT_STILL_SMALL : LUT_STILL} srcSet={small ? undefined : LUT_STILL_SET} sizes={small ? undefined : "(max-width:1023px) 34vw, 16vw"} alt="" width={small ? 240 : 720} height={small ? 135 : 405} loading="lazy" decoding="async" />
      <span className="ebc-tag">LUT Pack</span>
      <span className="ebc-name">
        <span>Cine</span>
        <span>Tones</span>
      </span>
    </span>
  )
}

export const EBOOK_COVER_CSS = `
.ebc{position:relative;display:block;aspect-ratio:1;overflow:hidden;background:#0a0a0b;color:#fff;container-type:inline-size;text-align:left}
.ebc-img{position:absolute;left:0;top:0;display:block;width:100%;height:64%;object-fit:cover;object-position:50% 60%}
.ebc::before{content:"";z-index:1;position:absolute;left:0;right:0;top:0;height:30%;background:linear-gradient(rgba(10,10,11,.5),rgba(10,10,11,0))}
.ebc::after{content:"";position:absolute;left:0;right:0;top:26%;height:39%;background:linear-gradient(rgba(10,10,11,0),rgba(10,10,11,.55) 50%,#0a0a0b)}
.ebc-tag{z-index:1;position:absolute;left:7cqw;top:7cqw;font-size:max(4.6cqw,3px);font-weight:600;line-height:1;letter-spacing:.18em;text-transform:uppercase}
.ebc-name{z-index:1;position:absolute;left:6.4cqw;bottom:6.4cqw;display:flex;flex-direction:column;font-size:21cqw;font-weight:800;line-height:.84;letter-spacing:-.05em;text-transform:uppercase}
`

/** One stylesheet for every cover on the page (React keeps one copy per href). */
export function EbookCoverStyle() {
  return (
    <style href="w13-ebook-cover" precedence="default">
      {EBOOK_COVER_CSS}
    </style>
  )
}
