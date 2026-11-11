/**
 * ===========================================================================
 *  A PROFILE VIDEO THAT ARRIVES FROM ITS OWN FIRST FRAME
 * ===========================================================================
 * "When the page loads with a video, it shows the profile photo and then the
 * video; they morph and interlace."
 *
 * The page drew the profile photo, blurred and scaled up, under the video,
 * and the video itself blurred, scaled and at 65% opacity, then let both
 * transition into each other once the video said it could play. The photo
 * is a different picture (often a different crop, and since a video save
 * leaves the account photo in place, a different face), so for half a second
 * two pictures were blended through one another.
 *
 * Now the frame under the video is the video's own first frame:
 *
 *   poster   captured when the video is saved (lib/onepage/capture-poster),
 *            uploaded beside it and kept on the crop the video is drawn
 *            through (`avatar_video_crop.poster`), so it is drawn with the
 *            very same crop, at the same size and position. The video fades
 *            in over it on `playing`: same frame, so nothing appears to move.
 *   no poster (a video saved before this) the video's own first frame,
 *            asked for with a media fragment (#t=0.001) so Safari paints it,
 *            and the box's plain colour until then. Never the photo.
 *   still    prefers-reduced-motion or Save-Data: nothing plays; the poster
 *            (or the profile photo, or the first frame) stands in.
 *
 * Kept here with no DOM and no React so tests/onepage-media-r40.test.ts can
 * run every rule on its own.
 */

/** Only an address the page may draw: https, or a path on this site. */
function drawable(value: unknown): string | null {
  if (typeof value !== "string") return null
  const v = value.trim()
  if (!v || v.length > 2048 || /[\s"'<>]/.test(v)) return null
  return /^https:\/\//i.test(v) || /^\/(?![/\\])/.test(v) ? v : null
}

/** The first frame saved with a video, read from the crop it is drawn through, or null. */
export function videoPoster(crop: unknown): string | null {
  if (!crop || typeof crop !== "object") return null
  return drawable((crop as { poster?: unknown }).poster)
}

/** The crop with its first frame beside it, ready to save as `avatar_video_crop`. */
export function withPoster<T extends object>(crop: T, poster: string | null | undefined): T & { poster?: string } {
  const url = drawable(poster)
  if (!url) {
    const { poster: _drop, ...rest } = crop as T & { poster?: string }
    void _drop
    return rest as T & { poster?: string }
  }
  return { ...crop, poster: url }
}

/**
 * The address to load when there is no poster: the same file with a media
 * fragment just past zero, which makes Safari decode and paint the first
 * frame of a paused video. An address that already names a fragment is left.
 */
export function firstFrameSrc(src: string): string {
  if (!src || src.includes("#")) return src
  return `${src}#t=0.001`
}

type MotionWindow = {
  matchMedia?: (q: string) => { matches: boolean }
  navigator?: { connection?: { saveData?: boolean } }
}

/** Reduced motion or the browser's data saver: the video is shown as a still and never played. */
export function prefersStill(w: MotionWindow | null | undefined): boolean {
  if (!w) return false
  try {
    if (w.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return true
  } catch {
    /* An old browser without matchMedia plays as before. */
  }
  return w.navigator?.connection?.saveData === true
}

/**
 * What a PosterVideo draws, decided from what it has.
 *
 *   base     the picture under the video: the poster (drawn with the video's
 *            own crop) or, only when the video will not play, the photo
 *   video    whether a <video> is put on the page at all
 *   reveal   which event fades the video in: `playing`, or `loadeddata` when
 *            it stays paused on its first frame
 */
export function posterPlan(o: { poster: string | null; fallback: string | null; still: boolean; failed: boolean }): {
  base: "poster" | "fallback" | null
  video: boolean
  reveal: "playing" | "loadeddata"
} {
  if (o.failed) return { base: o.poster ? "poster" : o.fallback ? "fallback" : null, video: false, reveal: "playing" }
  if (o.still) {
    if (o.poster) return { base: "poster", video: false, reveal: "loadeddata" }
    if (o.fallback) return { base: "fallback", video: false, reveal: "loadeddata" }
    return { base: null, video: true, reveal: "loadeddata" }
  }
  return { base: o.poster ? "poster" : null, video: true, reveal: "playing" }
}

/**
 * THE HERO FADES INTO WHATEVER IS UNDER IT.
 *
 * It used to paint the page colour (or the whole gradient) over the bottom
 * of the picture. Over a pattern that is a flat band with the pattern
 * stopping at its edge, which is why Hero was switched off for patterns.
 * Masking the picture itself instead lets the page's own wallpaper, colour,
 * gradient or pattern, show through as the picture fades, so there is
 * nothing to match and nothing to cut off.
 */
/*
 * Round AS: eased rather than three straight runs, so no step shows where one
 * run meets the next (the owner's "fade" look: the picture melts into the
 * page with the name over the melted part).
 */
export const HERO_FADE_MASK = "linear-gradient(to bottom, #000 0%, #000 46%, rgba(0,0,0,0.93) 54%, rgba(0,0,0,0.79) 62%, rgba(0,0,0,0.6) 70%, rgba(0,0,0,0.4) 78%, rgba(0,0,0,0.21) 86%, rgba(0,0,0,0.07) 94%, transparent 100%)"

/**
 * THE CREATOR'S OWN COVER FADES TOO (round AS). A band with a hard foot
 * stopped where the page began; on any wallpaper the mask lets the page show
 * through instead, so it suits every theme with nothing to match. Shorter
 * than the Hero's: the profile photo sits over this foot.
 */
export const COVER_FADE_MASK = "linear-gradient(to bottom, #000 0%, #000 52%, rgba(0,0,0,0.9) 62%, rgba(0,0,0,0.68) 72%, rgba(0,0,0,0.4) 82%, rgba(0,0,0,0.14) 92%, transparent 100%)"
