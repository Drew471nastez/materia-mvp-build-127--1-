"use client"

/**
 * A SPOTIFY OR APPLE MUSIC LINK, PLAYED ON THE PAGE (round AN).
 *
 * A link to a song, an album or a playlist can go to the service, open the
 * service's player in the block sheet (components/onepage/block-sheet), or
 * draw the player on the page itself. The link's own choice is kept where it
 * always was (`spotify_mode`, `apple_music_mode` in lib/onepage/types):
 *
 *   go_to_url        the link goes to the service
 *   audio_preview    the player in the sheet
 *   show_streaming   the player in the sheet, with the other services that
 *                    have it listed under it (Spotify only)
 *   on_page          the player drawn in place of the button
 *
 * The two pop-ups the page used to draw for these (their own panels, a
 * close button inside, a different motion on a phone and on a computer) are
 * gone: the sheet is the one every block opens.
 */

import type * as React from "react"
import { ChevronRight } from "lucide-react"
import { tt } from "@/lib/i18n/text"
import { LinkIcon } from "./brand-icons"
import type { BlockSheetRequest } from "./block-sheet"

export type MusicService = "spotify" | "apple_music"

/** Spotify's player for an address, or null when it is not a song, an album, an artist, a playlist, a show or an episode. */
export function spotifyEmbedUrl(url: string): { type: string; src: string } | null {
  const m = /open\.spotify\.com\/(?:intl-[a-z-]+\/)?(track|album|artist|playlist|show|episode)\/([a-zA-Z0-9]+)/.exec(url || "")
  return m ? { type: m[1], src: `https://open.spotify.com/embed/${m[1]}/${m[2]}?utm_source=generator` } : null
}

/** Apple Music's player for an address on music.apple.com, or null. */
export function appleMusicEmbedUrl(url: string): { song: boolean; src: string } | null {
  try {
    const u = new URL(url)
    if (u.hostname !== "music.apple.com") return null
    u.hostname = "embed.music.apple.com"
    return { song: u.searchParams.has("i") || /\/song\//.test(u.pathname), src: u.toString() }
  } catch {
    return null
  }
}

/** The heights each service draws its player at: compact for one song, full for a list. */
export function musicPlayerHeight(service: MusicService, single: boolean): number {
  if (service === "spotify") return single ? 152 : 352
  return single ? 175 : 450
}

export function MusicPlayer({ service, url, title, radius = 12 }: { service: MusicService; url: string; title: string; radius?: number }) {
  const sp = service === "spotify" ? spotifyEmbedUrl(url) : null
  const am = service === "apple_music" ? appleMusicEmbedUrl(url) : null
  const src = sp?.src ?? am?.src
  if (!src) return null
  const single = sp ? sp.type === "track" || sp.type === "episode" : !!am?.song
  const height = musicPlayerHeight(service, single)
  return (
    <div data-music-player={service} className="relative w-full overflow-hidden bg-[rgba(127,127,127,0.12)]" style={{ height, borderRadius: Math.min(Math.max(radius, 0), 16) }}>
      <iframe
        src={src}
        title={title}
        loading="lazy"
        allow="autoplay *; clipboard-write; encrypted-media *; fullscreen *; picture-in-picture"
        {...(service === "apple_music" ? { sandbox: "allow-forms allow-popups allow-same-origin allow-scripts allow-storage-access-by-user-activation allow-top-navigation-by-user-activation" } : {})}
        className="absolute inset-0 block h-full w-full border-0 bg-transparent"
      />
    </div>
  )
}

const SERVICE_NAMES: Record<string, string> = {
  apple_music: "Apple Music",
  youtube_music: "YouTube Music",
  spotify: "Spotify",
  youtube: "YouTube",
  itunes: "iTunes",
  soundcloud: "SoundCloud",
  tidal: "TIDAL",
  deezer: "Deezer",
  amazon_music: "Amazon Music",
}

/** The other services that have it, as rows in the sheet's colours. */
function ListenOn({ services }: { services: { platform: string; url: string | null; found: boolean }[] }) {
  const found = services.filter((s) => s.found && s.url)
  if (!found.length) return null
  return (
    <div className="mt-4" data-music-services="">
      <p className="mb-1.5 px-1 text-[13px] font-medium text-[var(--sheet-muted)]">{tt("Listen on")}</p>
      <div className="overflow-hidden rounded-2xl bg-[var(--sheet-field)]">
        {found.map((s, i) => (
          <a
            key={s.platform}
            href={s.url || "#"}
            target="_blank"
            rel="noopener noreferrer"
            className="flex min-h-12 items-center gap-3 px-4 text-[15px] font-medium text-[var(--sheet-ink)] transition-colors hover:bg-[var(--sheet-hover)]"
            style={i ? { boxShadow: "inset 0 1px 0 var(--sheet-rule)" } : undefined}
          >
            <span className="min-w-0 flex-1 truncate">{SERVICE_NAMES[s.platform] || s.platform}</span>
            <ChevronRight aria-hidden className="h-4 w-4 shrink-0 text-[var(--sheet-muted)]" />
          </a>
        ))}
      </div>
    </div>
  )
}

/** What the sheet shows for a music link: the player, the other services when asked, and the service's own button at the foot. */
export function musicSheetRequest({
  service,
  url,
  title,
  streaming,
}: {
  service: MusicService
  url: string
  title: string
  streaming?: { platform: string; url: string | null; found: boolean }[] | null
}): Omit<BlockSheetRequest, "blockId"> {
  const name = service === "spotify" ? "Spotify" : "Apple Music"
  const icon: React.ReactNode = <LinkIcon name={service === "spotify" ? "spotify" : "apple-music"} />
  return {
    title,
    body: (
      <div className="pb-1 pt-1" data-music-sheet={service}>
        <MusicPlayer service={service} url={url} title={title} />
        {streaming?.length ? <ListenOn services={streaming} /> : null}
      </div>
    ),
    cta: { label: tt("Open in {name}", { name }), href: url, icon },
    shareUrl: url,
  }
}
