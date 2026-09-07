/**
 * A YouTube link, reduced to the one shape everything else can rely on.
 *
 * Creators paste whatever the address bar gave them — a watch URL with a
 * playlist and a timestamp on it, a youtu.be short link, a /shorts/, a /live/,
 * an /embed/ — and the About carousel builds a player from it. Storing them
 * verbatim means the renderer has to understand five formats, and the one it
 * does not understand is a blank iframe on somebody's shop.
 *
 * So the id is extracted once and stored as a canonical watch URL, and
 * anything a video id cannot be found in is refused at the point of entry
 * rather than saved to fail later.
 *
 * ONE COPY. The dialog needs it to say "that does not look like a YouTube
 * link" before a round trip, and the API needs it because the dialog is not
 * the authority on what gets stored. Those were two regexes for a while, which
 * is how a field ends up accepting something the server then silently drops.
 */

const YOUTUBE_ID =
  /(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/|v\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/

/** The 11-character video id, or null. Accepts a bare id too. */
export function youTubeVideoId(raw: unknown): string | null {
  if (typeof raw !== "string") return null
  const value = raw.trim()
  if (!value || value.length > 300) return null
  return value.match(YOUTUBE_ID)?.[1] ?? (/^[A-Za-z0-9_-]{11}$/.test(value) ? value : null)
}

/** The canonical watch URL for a link, or null if it holds no video id. */
export function youTubeWatchUrl(raw: unknown): string | null {
  const id = youTubeVideoId(raw)
  return id ? `https://www.youtube.com/watch?v=${id}` : null
}
