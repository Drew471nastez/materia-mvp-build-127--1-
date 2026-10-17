/**
 * ===========================================================================
 *  THE ONE WAY A PASTED LINK BECOMES A URL THE SERVER WILL ASK
 * ===========================================================================
 * The four metadata routes under app/api/onepage (apple-music, soundcloud,
 * tiktok, youtube) take a link somebody pasted into the links editor and
 * read the title, the artist and the picture off it. Three of them asked the
 * link itself when the oEmbed answer was thin, and each decided it was the
 * right kind of link by looking for the service's name ANYWHERE in the
 * string:
 *
 *     if (!url.includes('music.apple.com')) return null   // then fetch(url)
 *
 * A query string carries that name as happily as a host does, so
 * `http://169.254.169.254/latest/meta-data/?x=music.apple.com` passed the
 * check and the server fetched it, with the og:title and og:image it found
 * handed back to whoever asked. The routes need no account, so that was a
 * reader for anything the deployment can reach. SoundCloud's checked the
 * host not at all. The same substring stood in for a host when Apple Music's
 * player address was built by string replacement, which put an address of
 * somebody else's choosing into an `<iframe src>` on a published page.
 *
 * So a link gets through here or not at all:
 *
 *   https only            http is upgraded, every other scheme refused, so
 *                         javascript:, data: and file: cannot reach a fetch
 *                         or an iframe
 *   the host, exactly     one of the service's own names, compared whole
 *                         after the leading "www." is dropped: a host that
 *                         merely CONTAINS or ENDS WITH the name
 *                         (music.apple.com.example.com) is not it
 *   no credentials        user:password@ in a URL is how a host is disguised
 *   the standard port     nothing on :8080 of anything
 *
 * What comes back is a URL object, so a caller reads its hostname, pathname
 * and searchParams rather than the string it was handed.
 *
 * This is a check on the shape of an address. It is not a judgement about
 * what is at the other end: a real link to a real service can still hold
 * anything that service hosts.
 */

/** The hosts each route may be given. Every name is matched whole, with "www." dropped first. */
export const EMBED_HOSTS = {
  appleMusic: ["music.apple.com", "embed.music.apple.com"],
  soundcloud: ["soundcloud.com", "m.soundcloud.com", "on.soundcloud.com", "w.soundcloud.com", "api.soundcloud.com", "snd.sc"],
  tiktok: ["tiktok.com", "m.tiktok.com", "vm.tiktok.com", "vt.tiktok.com"],
  youtube: ["youtube.com", "m.youtube.com", "music.youtube.com", "youtube-nocookie.com", "youtu.be"],
  spotify: ["spotify.com", "open.spotify.com", "spotify.link"],
} as const

/**
 * The URL this address is, when it is one of these hosts over https; null
 * otherwise. Never throws, whatever the string is.
 */
export function embedSource(raw: unknown, hosts: readonly string[]): URL | null {
  if (typeof raw !== "string" || !raw.trim()) return null
  let url: URL
  try {
    url = new URL(raw.trim())
  } catch {
    return null
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null
  if (url.username || url.password) return null
  if (url.port && url.port !== "80" && url.port !== "443") return null
  const host = url.hostname.toLowerCase().replace(/\.$/, "").replace(/^www\./, "")
  if (!hosts.some((h) => h === host)) return null
  /* One shape from here on: https, no credentials, no port, the host as the list spells it. */
  const clean = new URL(`https://${host}${url.pathname}${url.search}`)
  return clean
}

/** Apple Music's player address for a link, or null when the link is not Apple Music's. */
export function appleMusicEmbedUrl(raw: unknown): string | null {
  const url = embedSource(raw, EMBED_HOSTS.appleMusic)
  if (!url) return null
  return `https://embed.music.apple.com${url.pathname}${url.search}`
}
