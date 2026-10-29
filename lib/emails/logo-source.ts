/**
 * WHICH LOGO ADDRESSES THE SEND MAY READ (lib/emails/logo-shape-server.ts).
 * A store's logo address is the store's to set, so reading it at send must
 * never become a way to make Storelib's server fetch something else. Only
 * a public object in Storelib's own storage (the Supabase project in
 * NEXT_PUBLIC_SUPABASE_URL) is read: given as it is, as Storelib's
 * /media/ address for it, or through the inbox resizer (/api/email/img?u=)
 * on Storelib's own origin, which is unwrapped once to its source. https
 * only, no user or password, no other port. Anything else is null: its
 * shape is unknown and the logo is drawn alone, as before. The fetch itself
 * follows no redirect and refuses private addresses (lib/api/public-fetch).
 *
 * Pure: it reads only the public env.
 */
import { INBOX_IMAGE_PATH } from "@/lib/email-campaigns/inbox-image"
import { toStorageUrl } from "@/lib/storage/media-url"

const PUBLIC_PATH = "/storage/v1/object/public/"

function plainHttps(raw: string): URL | null {
  try {
    const u = new URL(raw)
    if (u.protocol !== "https:" || u.username || u.password || (u.port && u.port !== "443")) return null
    return u
  } catch {
    return null
  }
}

function storageHost(): string | null {
  const u = plainHttps((process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim())
  return u ? u.host.toLowerCase() : null
}

function ownHosts(): string[] {
  const out: string[] = []
  for (const raw of [process.env.NEXT_PUBLIC_APP_URL, `https://${process.env.NEXT_PUBLIC_MAIN_DOMAIN || "storelib.com"}`]) {
    const u = raw ? plainHttps(raw) : null
    if (u) out.push(u.host.toLowerCase(), `www.${u.host.toLowerCase().replace(/^www\./, "")}`)
  }
  return out
}

/** The address to read for a logo's size, or null when it is not one of Storelib's own stored pictures. */
export function logoFetchTarget(src: string): string | null {
  let u = plainHttps(src)
  if (!u) return null
  /* The inbox resizer on Storelib's own origin: its source, once (a resizer address inside it is refused below). */
  if (ownHosts().includes(u.host.toLowerCase()) && u.pathname === INBOX_IMAGE_PATH) {
    u = plainHttps(u.searchParams.get("u") || "")
    if (!u) return null
  }
  /* Storelib's /media/ address for a stored file: the file itself. */
  u = plainHttps(toStorageUrl(u.toString()))
  const host = storageHost()
  if (!u || !host || u.host.toLowerCase() !== host || !u.pathname.startsWith(PUBLIC_PATH) || u.pathname.includes("..")) return null
  return u.toString()
}
