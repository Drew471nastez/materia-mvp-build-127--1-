/**
 * ===========================================================================
 *  A PICTURE AT THE SIZE IT IS SHOWN, NOT THE SIZE IT WAS TAKEN
 * ===========================================================================
 * Round 12 (the owner's "Aw, Snap! Error code: 5" on the OnePage editor). A
 * photo is kept up to 4096px on its long side (lib/onepage/media-upload
 * prepareImage), and the editor and the live page drew that file itself: a
 * 54px avatar in the editor or a 350px photo block held a 4032 by 3024
 * picture, 46MB once decoded, and the live page drew each one twice (one per
 * layout). A page with a dozen photos asked the browser for half a gigabyte.
 *
 * Every OnePage picture goes through the image optimizer at the width it is
 * drawn (twice that for a sharp screen, lib/images/optimized-url): a photo
 * block is a 1080px file, an avatar or a thumbnail 128px or so. What the
 * optimizer cannot take is drawn as it is: an address on a host it does not
 * fetch, a data: or blob: address (a picture still being cropped), and an
 * SVG (next.config has no dangerouslyAllowSVG, so the optimizer refuses it).
 */
import { optimizedImageUrl } from "@/lib/images/optimized-url"

/** The widest a OnePage column draws anything, in CSS pixels (the computer's card, less its padding). */
export const ONEPAGE_COLUMN_PX = 540

const SVG = /\.svg(?:[?#]|$)/i

/** `url` as the optimizer's copy for `cssWidth` CSS pixels, or `url` itself where the optimizer cannot help. */
export function onePageImageSrc<T extends string | null | undefined>(url: T, cssWidth: number): T {
  if (!url || SVG.test(url)) return url
  return optimizedImageUrl(url, cssWidth) as T
}
