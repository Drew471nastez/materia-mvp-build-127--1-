/**
 * What a published file says it is.
 *
 * Its own module, with no imports, because both the publish step (server) and
 * the tests need it and the publish module is `server-only` — pulling this out
 * of there is what stops a pure MIME lookup dragging Supabase and
 * `next/headers` behind it.
 *
 * A CLOSED LIST, and unknown extensions are `application/octet-stream` rather
 * than guessed. Published output is served with `X-Content-Type-Options:
 * nosniff`, so a wrong Content-Type is a file the browser refuses rather than
 * one it interprets — and a *guessed* one is how a `.txt` somebody uploaded
 * gets executed as a script.
 */

const CONTENT_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
  ".webp": "image/webp",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".woff2": "font/woff2",
  ".ico": "image/x-icon",
}

export function contentTypeFor(path: string): string {
  const dot = path.lastIndexOf(".")
  return (dot === -1 ? undefined : CONTENT_TYPES[path.slice(dot).toLowerCase()]) ?? "application/octet-stream"
}
