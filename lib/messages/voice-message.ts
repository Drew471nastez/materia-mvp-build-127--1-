/**
 * ===========================================================================
 *  A VOICE NOTE, STORED WITHOUT A MIGRATION
 * ===========================================================================
 *
 * Exactly the arrangement lib/messages/image-fallback.ts uses for photographs,
 * and for the same reason: `messages` has a shape constraint and a `kind` it
 * validates, so a new kind means a migration, and a feature that cannot ship
 * until somebody runs SQL against production is a feature that half-exists for
 * as long as that takes.
 *
 * A voice note is therefore an ordinary TEXT row whose body begins with a
 * sentinel no human types. Nothing about the schema changes, the row satisfies
 * the constraint that is already there, and both ends decode it back into a
 * voice note on the way out.
 *
 * WHAT IS PACKED IN, AND WHY EACH PIECE HAS TO BE
 *
 *   path      the object in the private `messages` bucket. Not a URL: the
 *             bucket is private and links are minted per read, exactly as for
 *             photographs — a voice note is a recording of somebody's actual
 *             voice, which is if anything more personal than a picture of their
 *             coat.
 *
 *   ms        how long it is. Stored rather than measured on the client,
 *             because `HTMLAudioElement.duration` on a MediaRecorder blob is
 *             `Infinity` in Chrome and Safari until the whole file has been
 *             fetched and seeked — so a bubble that asked the audio element
 *             would show "∞" or a blank until you pressed play. The recorder
 *             already knows the answer to the millisecond; it just has to say
 *             so.
 *
 *   peaks     the waveform, as up to 48 integers 0-9. Computed once while
 *             recording, from the analyser that is already running to draw the
 *             live meter. The alternative is every reader downloading and
 *             decoding the audio to draw the same picture, on a thread that may
 *             hold thirty of them.
 *
 * Digits rather than a JSON array on purpose: 48 characters instead of ~200, in
 * a column shared with message text, and it cannot contain the separator.
 *
 * The sentinel is U+0002 — U+0001 is taken by the image encoding, and the two
 * must never be mistaken for one another. No keyboard produces either and no
 * paste survives them.
 */

const SENTINEL = "storelib:voice"
const SEP = ""

export type VoiceNote = {
  /** Object path in the private `messages` bucket, or a signed URL after a read. */
  path: string
  /** Length in milliseconds, as the recorder measured it. */
  ms: number
  /** 0-9 per bar, oldest first. Empty when the analyser was unavailable. */
  peaks: number[]
}

/** 48 bars is what fits a bubble at a readable width without becoming a smear. */
export const MAX_PEAKS = 48

/** Clamp to a single digit so the packed form is always one char per bar. */
function packPeaks(peaks: number[]): string {
  return peaks
    .slice(0, MAX_PEAKS)
    .map((p) => String(Math.max(0, Math.min(9, Math.round(p)))))
    .join("")
}

export function encodeVoiceBody(path: string, ms: number, peaks: number[]): string {
  const safeMs = Math.max(0, Math.round(Number.isFinite(ms) ? ms : 0))
  return `${SENTINEL}${path}${SEP}${safeMs}${SEP}${packPeaks(peaks)}`
}

/**
 * The note inside such a body, or null if it is ordinary text.
 *
 * Deliberately forgiving about the tail: a row written by an older build with
 * no peaks, or with a duration that failed to parse, still decodes into a
 * playable note. A voice message that will not render because its waveform is
 * missing would be a decoration deciding whether the content exists.
 */
export function decodeVoiceBody(body: string | null | undefined): VoiceNote | null {
  if (!body || !body.startsWith(SENTINEL)) return null
  const parts = body.slice(SENTINEL.length).split(SEP)
  const path = parts[0]
  if (!path) return null
  const ms = Number.parseInt(parts[1] ?? "", 10)
  const peaks = (parts[2] ?? "").split("").map((c) => Number.parseInt(c, 10) || 0)
  return { path, ms: Number.isFinite(ms) && ms > 0 ? ms : 0, peaks }
}

/** Cheap test for callers that only need to know that it IS one. */
export function isEncodedVoice(body: string | null | undefined): boolean {
  return !!body && body.startsWith(SENTINEL)
}

/** "0:07" — what a voice note says about itself on the bubble and while recording. */
export function formatVoiceDuration(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000))
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}:${String(s).padStart(2, "0")}`
}
