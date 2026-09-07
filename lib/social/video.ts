/**
 * Video links, reduced to the one shape everything else can rely on.
 *
 * THIS IS THE THIRD TIME. There was a regex in the About renderer
 * (`extractYouTubeId`), one in the story dialog, and one in the API route.
 * Two were merged into lib/social/youtube last week and the third was missed —
 * it lives 400 lines away from anything that looked related, and it is the one
 * that decides what the visitor actually sees. So: one module, and the old
 * youtube-only entry points are re-exported from it rather than kept alive
 * separately.
 *
 * NOT ONLY YOUTUBE. Vimeo is here because creators have Vimeo links and
 * pasting one used to produce a YouTube embed of nothing — a blank black
 * rectangle on their page, saved without complaint.
 *
 * Adding a provider is one entry in PROVIDERS. Everything downstream — the
 * editor's validation, the stored URL, the embed, the thumbnail — follows from
 * it, because none of them do any parsing of their own.
 */

export type VideoProvider = "youtube" | "vimeo"

export interface ParsedVideo {
  provider: VideoProvider
  id: string
  /** What gets stored: canonical, no playlist params, no timestamps. */
  url: string
  /** What the <iframe> loads. */
  embedUrl: string
  /** A still, where the provider serves one without an API call. */
  thumbnailUrl: string | null
  /** For a label in the editor: "YouTube", "Vimeo". */
  label: string
}

interface ProviderSpec {
  label: string
  /** First capture group is the id. */
  patterns: RegExp[]
  /** A bare id with no URL around it, if that is unambiguous for this provider. */
  bareId?: RegExp
  url: (id: string) => string
  embed: (id: string) => string
  thumbnail: (id: string) => string | null
}

const PROVIDERS: Record<VideoProvider, ProviderSpec> = {
  youtube: {
    label: "YouTube",
    patterns: [
      /(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/|v\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/,
    ],
    // 11 characters is YouTube's id length and nothing else here looks like it.
    bareId: /^[A-Za-z0-9_-]{11}$/,
    url: (id) => `https://www.youtube.com/watch?v=${id}`,
    embed: (id) => `https://www.youtube-nocookie.com/embed/${id}`,
    // `hqdefault` exists for every video; `maxresdefault` does not, and a
    // missing one renders as a grey 404 image rather than falling back.
    thumbnail: (id) => `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
  },
  vimeo: {
    label: "Vimeo",
    patterns: [/vimeo\.com\/(?:video\/|channels\/[^/]+\/|groups\/[^/]+\/videos\/)?(\d{6,12})/],
    url: (id) => `https://vimeo.com/${id}`,
    embed: (id) => `https://player.vimeo.com/video/${id}`,
    // Vimeo's still needs an oEmbed call, which a render pass should not make.
    thumbnail: () => null,
  },
}

const MAX_URL = 300

/** The video behind a link, or null if there isn't one. */
export function parseVideoUrl(raw: unknown): ParsedVideo | null {
  if (typeof raw !== "string") return null
  const value = raw.trim()
  if (!value || value.length > MAX_URL) return null

  for (const [name, spec] of Object.entries(PROVIDERS) as Array<[VideoProvider, ProviderSpec]>) {
    for (const pattern of spec.patterns) {
      const id = value.match(pattern)?.[1]
      if (id) {
        return {
          provider: name,
          id,
          url: spec.url(id),
          embedUrl: spec.embed(id),
          thumbnailUrl: spec.thumbnail(id),
          label: spec.label,
        }
      }
    }
  }

  // A bare id is only tried after every URL pattern has failed, or a Vimeo
  // numeric id would be read as something else.
  for (const [name, spec] of Object.entries(PROVIDERS) as Array<[VideoProvider, ProviderSpec]>) {
    if (spec.bareId?.test(value)) {
      return {
        provider: name,
        id: value,
        url: spec.url(value),
        embedUrl: spec.embed(value),
        thumbnailUrl: spec.thumbnail(value),
        label: spec.label,
      }
    }
  }

  return null
}

/** The canonical URL to store, or null. */
export function canonicalVideoUrl(raw: unknown): string | null {
  return parseVideoUrl(raw)?.url ?? null
}

/**
 * The embed URL for something already stored.
 *
 * A stored value that no longer parses returns null rather than an iframe
 * pointed at a guess — a black rectangle on a creator's page is worse than a
 * missing one, because it looks like the site is broken rather than the item.
 */
export function videoEmbedUrl(raw: unknown): string | null {
  return parseVideoUrl(raw)?.embedUrl ?? null
}

/**
 * @deprecated Use canonicalVideoUrl. Kept so the API route and the story
 * dialog keep compiling while both move over; it now accepts Vimeo too, which
 * is the point.
 */
export const youTubeWatchUrl = canonicalVideoUrl
