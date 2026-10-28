/**
 * A page address asked for as a picture, a stylesheet, a script or a font
 * (Sec-Fetch-Dest), which proxy.ts answers 404 without rendering anything.
 * Every real file here has an extension or lives under /api, /_next, /media
 * or /cdn; a page has neither. See proxy.ts for why it exists.
 */
const SUBRESOURCE = new Set(["image", "style", "script", "font", "audio", "video", "track"])
/** A page address (no file extension, not an API, Next or media path) asked for by an <img>, <link>, <script> or font: never something a page answers. */
export function pageAskedAsSubresource(dest: string | null, pathname: string): boolean {
  if (!dest || !SUBRESOURCE.has(dest)) return false
  if (/^\/(?:api|_next|media|cdn|files|_vercel)(?:\/|$)/.test(pathname)) return false
  /* A website's home screen icon (lib/website-builder/site-favicon.ts): a picture at an address without an extension, on purpose (the proxy never sees a .png). */
  if (pathname === "/apple-touch-icon") return false
  const last = pathname.split("/").pop() ?? ""
  return !/\.[a-z0-9]{1,8}$/i.test(last)
}
