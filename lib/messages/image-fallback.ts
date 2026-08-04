/**
 * Sending a photo on a database that has not had its migration run.
 *
 * `20260806` adds `messages.image_url` and widens the shape constraint to allow
 * an image row. Until somebody runs it, an image insert fails and the only
 * honest thing the API could say was "photos are not enabled on this server" —
 * true, useless, and entirely outside the sender's control.
 *
 * So there is a second way to store one. A photo becomes an ordinary TEXT
 * message whose body begins with a sentinel no human types, followed by the
 * object path and any caption. Nothing about the schema changes, the row
 * satisfies the original constraint, and both the server and the client decode
 * it back into an image on the way out.
 *
 * This is a fallback and is written to stay one: the proper column is always
 * tried first, and the encoded form is only reached once the insert has already
 * been refused. Rows written this way keep working forever after the migration
 * lands — which is why the decoder is unconditional and has no version check.
 * No migration step has to find and rewrite them, and there is no window where a
 * photo sent yesterday stops rendering today.
 *
 * The sentinel is U+0001, a control character no keyboard produces and no paste
 * survives, so ordinary text cannot be mistaken for one of these by accident.
 */

const SENTINEL = "\u0001storelib:image\u0001"
/** Separates the object path from an optional caption. */
const SEP = "\u0001"

/** Pack an object path (and optional caption) into a text message body. */
export function encodeImageBody(path: string, caption?: string | null): string {
  return caption ? `${SENTINEL}${path}${SEP}${caption}` : `${SENTINEL}${path}`
}

/** The path and caption inside such a body, or null if it is ordinary text. */
export function decodeImageBody(
  body: string | null | undefined,
): { path: string; caption: string | null } | null {
  if (!body || !body.startsWith(SENTINEL)) return null
  const rest = body.slice(SENTINEL.length)
  const split = rest.indexOf(SEP)
  if (split < 0) return { path: rest, caption: null }
  return { path: rest.slice(0, split), caption: rest.slice(split + 1) || null }
}

/** Cheap test for the client, which only needs to know that it IS one. */
export function isEncodedImage(body: string | null | undefined): boolean {
  return !!body && body.startsWith(SENTINEL)
}
