/**
 * ===========================================================================
 *  WHICH ADDRESS A ONEPAGE MUSIC OR VIDEO LOOKUP MAY READ (round AW)
 * ===========================================================================
 * app/api/onepage/{tiktok,soundcloud,spotify,apple-music,youtube} read a
 * service's oEmbed, song.link and the link's own page for a link a creator
 * pasted into a OnePage button. Whose link it was had been decided by a
 * substring ("tiktok.com" or "music.apple.com" anywhere in it) or, for
 * SoundCloud, by nothing at all, so the page read was any address:
 * http://169.254.169.254/?tiktok.com was fetched from Storelib's servers,
 * by anybody, signed in or not.
 *
 * Now the address has to be the service's own host, or a host under it, over
 * http or https on the standard port, with no name or password in it. An
 * address typed without a scheme (the editor keeps what was typed) is read
 * as https, which is what the lookup asks anyway. Pure, so it has a test.
 */

export type EmbedService = "tiktok" | "soundcloud" | "spotify" | "appleMusic" | "youtube"

/** The hosts each lookup answers for: the host itself, or any host under it (www., m., vm., on., open., geo.). */
export const EMBED_HOSTS: Readonly<Record<EmbedService, readonly string[]>> = {
  tiktok: ["tiktok.com"],
  soundcloud: ["soundcloud.com"],
  spotify: ["spotify.com"],
  appleMusic: ["music.apple.com"],
  youtube: ["youtube.com", "youtu.be"],
}

/** Longer than any link a person pastes; the same ceiling as the link preview's. */
export const EMBED_ADDRESS_MAX = 2048

/** The address to look up, written out in full, or null when it is not this service's. */
export function embedAddress(service: EmbedService, raw: unknown): string | null {
  if (typeof raw !== "string") return null
  const text = raw.trim()
  if (!text || text.length > EMBED_ADDRESS_MAX) return null
  let url: URL
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:/i.test(text) ? text : `https://${text}`)
  } catch {
    return null
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null
  if (url.username || url.password || url.port) return null
  const host = url.hostname.toLowerCase().replace(/\.$/, "")
  if (!EMBED_HOSTS[service].some((root) => host === root || host.endsWith(`.${root}`))) return null
  return url.href
}
