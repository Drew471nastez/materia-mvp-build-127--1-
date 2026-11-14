import { NextRequest, NextResponse } from "next/server"
import { deadlineFetch } from "@/lib/net/deadline"
import { embedAddress } from "@/lib/onepage/embed-address"
import { embedLookupRefusal } from "@/lib/onepage/embed-gate"

/* A provider that does not answer is given up on after EMBED_FETCH_MS, not at the platform's 300 seconds: the lookup answers without those details, as it does when the provider says no. */
const EMBED_FETCH_MS = 8_000
const embedFetch = (url: string, init: RequestInit = {}) => deadlineFetch(url, init, { ms: EMBED_FETCH_MS })

// Extract Spotify entity info from URL
function extractSpotifyInfo(url: string): { type: 'track' | 'album' | 'artist' | 'playlist', id: string } | null {
  try {
    const urlObj = new URL(url)
    const pathParts = urlObj.pathname.split('/').filter(Boolean)

    if (pathParts.length >= 2) {
      const type = pathParts[0] as 'track' | 'album' | 'artist' | 'playlist'
      const id = pathParts[1].split('?')[0]
      if (['track', 'album', 'artist', 'playlist'].includes(type) && id) {
        return { type, id }
      }
    }
    return null
  } catch {
    return null
  }
}

// Try to use odesli.co (song.link) API to find streaming links
async function fetchStreamingLinks(spotifyUrl: string): Promise<{
  services: {
    platform: string
    url: string | null
    found: boolean
  }[]
  artistName: string | null
  previewUrl: string | null
}> {
  const platforms = [
    { platform: 'apple_music', found: false, url: null as string | null },
    { platform: 'youtube_music', found: false, url: null as string | null },
    { platform: 'soundcloud', found: false, url: null as string | null },
    { platform: 'tidal', found: false, url: null as string | null },
    { platform: 'deezer', found: false, url: null as string | null },
    { platform: 'amazon_music', found: false, url: null as string | null },
  ]

  let artistName: string | null = null
  let previewUrl: string | null = null

  try {
    // First try odesli.co (song.link) API - it's the best for finding cross-platform links
    const odesliResponse = await embedFetch(
      `https://api.song.link/v1-alpha.1/links?url=${encodeURIComponent(spotifyUrl)}&userCountry=US`,
      { headers: { 'Accept': 'application/json' } }
    )

    if (odesliResponse.ok) {
      const data = await odesliResponse.json()

      // Map odesli platforms to our platform names
      const platformMapping: Record<string, string> = {
        'appleMusic': 'apple_music',
        'youtubeMusic': 'youtube_music',
        'soundcloud': 'soundcloud',
        'tidal': 'tidal',
        'deezer': 'deezer',
        'amazonMusic': 'amazon_music',
        'amazon': 'amazon_music',
      }

      // Extract links from odesli response
      if (data.linksByPlatform) {
        for (const [odesliPlatform, linkData] of Object.entries(data.linksByPlatform)) {
          const ourPlatform = platformMapping[odesliPlatform]
          if (ourPlatform) {
            const platformIndex = platforms.findIndex(p => p.platform === ourPlatform)
            if (platformIndex !== -1 && (linkData as any).url) {
              platforms[platformIndex].found = true
              platforms[platformIndex].url = (linkData as any).url
            }
          }
        }
      }

      // Try to get artist name from entity info
      if (data.entitiesByUniqueId) {
        const entities = Object.values(data.entitiesByUniqueId) as any[]
        const firstEntity = entities[0]
        if (firstEntity) {
          artistName = firstEntity.artistName || firstEntity.title || null
        }
      }
    }
  } catch (e) {
    console.error('Odesli API error:', e)
  }

  // Also get Spotify oEmbed data for thumbnail and name
  let title: string | null = null
  let thumbnailUrl: string | null = null
  let type: 'track' | 'album' | 'artist' | 'playlist' | null = null

  try {
    const oembedResponse = await embedFetch(
      `https://open.spotify.com/oembed?url=${encodeURIComponent(spotifyUrl)}`
    )

    if (oembedResponse.ok) {
      const oembedData = await oembedResponse.json()
      thumbnailUrl = oembedData.thumbnail_url || null

      // Parse type from URL
      if (spotifyUrl.includes('/track/')) type = 'track'
      else if (spotifyUrl.includes('/album/')) type = 'album'
      else if (spotifyUrl.includes('/artist/')) type = 'artist'
      else if (spotifyUrl.includes('/playlist/')) type = 'playlist'

      if (oembedData.title) {
        // Parse title based on type
        // Track format: "Track Name - song and target by Artist on Spotify" or "Track by Artist"
        // Album format: "Album Name - album by Artist on Spotify"
        // Artist format: "Artist Name"
        const fullTitle = oembedData.title

        if (type === 'track') {
          // Try to extract "Song by Artist" format
          const songMatch = fullTitle.match(/^(.+?)\s*[-–]\s*song.*?by\s+(.+?)(?:\s+on\s+Spotify)?$/i)
          if (songMatch) {
            title = songMatch[1].trim()
            artistName = songMatch[2].trim()
          } else {
            const byMatch = fullTitle.match(/^(.+?)\s+by\s+(.+?)(?:\s+on\s+Spotify)?$/i)
            if (byMatch) {
              title = byMatch[1].trim()
              artistName = byMatch[2].trim()
            } else {
              title = fullTitle.replace(/\s+on\s+Spotify$/i, '').trim()
            }
          }
        } else if (type === 'album') {
          const albumMatch = fullTitle.match(/^(.+?)\s*[-–]\s*album.*?by\s+(.+?)(?:\s+on\s+Spotify)?$/i)
          if (albumMatch) {
            title = albumMatch[1].trim()
            artistName = albumMatch[2].trim()
          } else {
            const byMatch = fullTitle.match(/^(.+?)\s+by\s+(.+?)(?:\s+on\s+Spotify)?$/i)
            if (byMatch) {
              title = byMatch[1].trim()
              artistName = byMatch[2].trim()
            } else {
              title = fullTitle.replace(/\s+on\s+Spotify$/i, '').trim()
            }
          }
        } else if (type === 'artist') {
          artistName = fullTitle.replace(/\s+on\s+Spotify$/i, '').trim()
          title = artistName
        } else if (type === 'playlist') {
          const playlistMatch = fullTitle.match(/^(.+?)\s*[-–]\s*playlist.*?by\s+(.+?)(?:\s+on\s+Spotify)?$/i)
          if (playlistMatch) {
            title = playlistMatch[1].trim()
            artistName = playlistMatch[2].trim()
          } else {
            title = fullTitle.replace(/\s+on\s+Spotify$/i, '').trim()
          }
        } else {
          title = fullTitle.replace(/\s+on\s+Spotify$/i, '').trim()
        }
      }
    }
  } catch (e) {
    console.error('Spotify oEmbed error:', e)
  }

  return {
    services: platforms,
    artistName,
    title,
    thumbnailUrl,
    type,
    previewUrl
  }
}

export async function GET(request: NextRequest) {
  /* The OnePage editor's, signed in and counted (lib/onepage/embed-gate.ts, round AW). */
  const refused = await embedLookupRefusal(request)
  if (refused) return refused
  try {
    const searchParams = request.nextUrl.searchParams
    const asked = searchParams.get("url")

    if (!asked) {
      return NextResponse.json({ error: "Missing url parameter" }, { status: 400 })
    }

    /* Spotify's own address only (lib/onepage/embed-address.ts): it is handed to song.link and Spotify's oEmbed below. */
    const url = embedAddress("spotify", asked)
    const spotifyInfo = url ? extractSpotifyInfo(url) : null

    if (!url || !spotifyInfo) {
      return NextResponse.json({ error: "Invalid Spotify URL" }, { status: 400 })
    }

    // Fetch streaming links and Spotify info
    const { services, artistName, title, thumbnailUrl, type, previewUrl } = await fetchStreamingLinks(url)

    return NextResponse.json({
      type: type || spotifyInfo.type,
      id: spotifyInfo.id,
      artistName,
      title,
      thumbnailUrl,
      previewUrl,
      streamingServices: services
    })
  } catch (error) {
    console.error("Spotify API error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
