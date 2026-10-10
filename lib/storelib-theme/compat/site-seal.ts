/**
 * ===========================================================================
 *  ONLY THE PROXY SENDS A VISITOR TO AN IMPORTED THEME'S SITE
 * ===========================================================================
 * An imported Shopify theme runs its own JavaScript on its website, which is
 * the creator's own address (<name>.storelib.com, or their domain) with no
 * Storelib session on it. The handler that draws it lives at
 * /api/site-theme/site/<name>/…, and an /api address answers on every host,
 * storelib.com included, where the session is. Drawn there, a stranger's
 * theme would run in the signed in person's own origin.
 *
 * So the handler answers only what the proxy hands it: the proxy, having
 * decided this host is this site, seals the request with the host and the
 * name it rewrote to, and the handler checks the seal before drawing
 * anything. A request typed straight at /api/site-theme/site/… carries no
 * seal and is a 404, on every host. The seal is an HMAC with a server secret
 * and a short life, made with Web Crypto so the proxy and the route compute
 * it the same way.
 */

export const SITE_SEAL_HEADER = "x-storelib-theme-site"

/** Long enough for a rewrite to reach its route, short enough that a copied seal is soon useless. */
const LIFE_MS = 60_000

async function key(): Promise<CryptoKey | null> {
  const own = process.env.COMPAT_SITE_SECRET
  const base = own && own.length >= 32 ? own : process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!base) return null
  const enc = new TextEncoder()
  /* Derived, not the service key itself: the seal never carries anything that turns back into database access. */
  const root = await crypto.subtle.importKey("raw", enc.encode(base), { name: "HMAC", hash: "SHA-256" }, false, ["sign"])
  const derived = await crypto.subtle.sign("HMAC", root, enc.encode("storelib:compat-site:v1"))
  return crypto.subtle.importKey("raw", derived, { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"])
}

const b64url = (bytes: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
const unb64url = (s: string) => {
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/"))
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

const bodyOf = (name: string, host: string, until: number) => `${name.toLowerCase()}|${host.toLowerCase().split(":")[0]}|${until.toString(36)}`

/** The seal for a request the proxy is about to rewrite to this site's handler. Null where there is no secret to seal with. */
export async function sealSite(name: string, host: string, now = Date.now()): Promise<string | null> {
  const k = await key()
  if (!k) return null
  const until = now + LIFE_MS
  const sig = await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(bodyOf(name, host, until)))
  return `${until.toString(36)}.${b64url(sig)}`
}

/** Whether this request was sealed by the proxy for this name on this host, and not long ago. */
export async function siteSealed(seal: string | null, name: string, host: string, now = Date.now()): Promise<boolean> {
  if (!seal) return false
  const [untilRaw, sig] = seal.split(".")
  const until = parseInt(untilRaw ?? "", 36)
  if (!sig || !Number.isFinite(until) || until < now || until > now + LIFE_MS + 5_000) return false
  const k = await key()
  if (!k) return false
  try {
    return await crypto.subtle.verify("HMAC", k, unb64url(sig), new TextEncoder().encode(bodyOf(name, host, until)))
  } catch {
    return false
  }
}

/** The host a request is for, read the same way by the proxy and by the route. */
export function siteHostOf(headers: Headers): string {
  return (headers.get("x-forwarded-host") ?? headers.get("host") ?? "").split(",")[0].trim().toLowerCase()
}
