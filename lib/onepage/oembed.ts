/**
 * ===========================================================================
 *  A LINK'S CARD FROM THE SERVICE'S OWN oEMBED (round AR3)
 * ===========================================================================
 * Open Graph (lib/onepage/link-metadata) reads a page's <meta> tags. Some
 * services answer a server's request for the page with a sign-in wall, a
 * cookie page or nothing useful (TikTok, Spotify's apps, SoundCloud), but
 * they publish oEmbed: a small JSON with the title, the author and the
 * picture. app/api/onepage/link-preview asks it first for these addresses.
 *
 * SAFETY. The endpoint is never read from the page (no oEmbed discovery):
 * it is one of the fixed https addresses below, picked by the pasted
 * address's own host, and the pasted address only travels as a query
 * parameter. The answer is fetched through fetchPublic (the same private
 * address guard as the page), read as JSON of at most 64 KB, and only text
 * comes out: the title and the author cleaned of markup, the picture checked
 * as a public https address. The answer's `html` is never used.
 *
 * Pure: no fetch here, so the tests run on recorded answers
 * (tests/fixtures/oembed).
 */
import { cleanMetaText, safePictureUrl, type LinkMetadata } from "./link-metadata"

type Provider = { name: string; hosts: RegExp; endpoint: (url: string) => string }

/* i18n-ignore-start: services' own names and addresses. */
const PROVIDERS: Provider[] = [
  { name: "YouTube", hosts: /^(www\.|m\.)?youtube\.com$|^youtu\.be$/, endpoint: (u) => `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(u)}` },
  { name: "Vimeo", hosts: /^(www\.)?vimeo\.com$/, endpoint: (u) => `https://vimeo.com/api/oembed.json?url=${encodeURIComponent(u)}` },
  { name: "Spotify", hosts: /^open\.spotify\.com$/, endpoint: (u) => `https://open.spotify.com/oembed?url=${encodeURIComponent(u)}` },
  { name: "SoundCloud", hosts: /^(www\.|m\.)?soundcloud\.com$/, endpoint: (u) => `https://soundcloud.com/oembed?format=json&url=${encodeURIComponent(u)}` },
  { name: "TikTok", hosts: /^(www\.|m\.)?tiktok\.com$/, endpoint: (u) => `https://www.tiktok.com/oembed?url=${encodeURIComponent(u)}` },
  { name: "X", hosts: /^(www\.|mobile\.)?(x|twitter)\.com$/, endpoint: (u) => `https://publish.twitter.com/oembed?omit_script=1&url=${encodeURIComponent(u)}` },
  { name: "Canva", hosts: /^(www\.)?canva\.com$/, endpoint: (u) => `https://www.canva.com/_oembed?url=${encodeURIComponent(u)}` },
  { name: "Typeform", hosts: /^([a-z0-9-]+\.)?typeform\.com$/, endpoint: (u) => `https://api.typeform.com/oembed?url=${encodeURIComponent(u)}` },
  { name: "Mixcloud", hosts: /^(www\.)?mixcloud\.com$/, endpoint: (u) => `https://app.mixcloud.com/oembed/?format=json&url=${encodeURIComponent(u)}` },
]
/* i18n-ignore-end */

/** The fixed oEmbed address for a pasted page, or null when its service is not one of these. */
export function oembedEndpoint(raw: string): { provider: string; url: string } | null {
  let u: URL
  try {
    u = new URL(raw)
  } catch {
    return null
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null
  if (u.username || u.password || (u.port && u.port !== "443" && u.port !== "80")) return null
  const host = u.hostname.toLowerCase()
  const p = PROVIDERS.find((x) => x.hosts.test(host))
  if (!p) return null
  u.protocol = "https:"
  u.hash = ""
  return { provider: p.name, url: p.endpoint(u.toString()) }
}

/**
 * What an oEmbed answer gives a link's card. Only `title`, `author_name` and
 * `thumbnail_url` are read; everything else (its html above all) is ignored.
 */
export function parseOEmbed(json: unknown, address: string, provider: string): LinkMetadata | null {
  if (!json || typeof json !== "object" || Array.isArray(json)) return null
  const o = json as Record<string, unknown>
  const title = typeof o.title === "string" ? cleanMetaText(o.title, 200) : ""
  const author = typeof o.author_name === "string" ? cleanMetaText(o.author_name, 120) : ""
  const image = typeof o.thumbnail_url === "string" ? safePictureUrl(o.thumbnail_url, address) : null
  if (!title && !image) return null
  let host = ""
  try {
    host = new URL(address).hostname
  } catch {
    return null
  }
  return {
    title: title || author || host,
    description: author && title ? `${provider} · ${author}` : provider,
    image,
    favicon: safePictureUrl("/favicon.ico", `https://${host}/`),
    url: address,
  }
}
