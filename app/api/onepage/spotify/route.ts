import { NextRequest, NextResponse } from "next/server"

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
    const odesliResponse = await fetch(
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
  try {
    const oembedResponse = await fetch(
      `https://open.spotify.com/oembed?url=${encodeURIComponent(spotifyUrl)}`
    )

    if (oembedResponse.ok) {
      const oembedData = await oembedResponse.json()
      if (!artistName && oembedData.title) {
        // Extract artist name from title (format is usually "Track by Artist" or just "Artist")
        const byMatch = oembedData.title.match(/by\s+(.+)$/)
        artistName = byMatch ? byMatch[1] : oembedData.title
      }
    }
  } catch (e) {
    console.error('Spotify oEmbed error:', e)
  }

  return {
    services: platforms,
    artistName,
    previewUrl
  }
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const url = searchParams.get("url")

    if (!url) {
      return NextResponse.json({ error: "Missing url parameter" }, { status: 400 })
    }

    const spotifyInfo = extractSpotifyInfo(url)

    if (!spotifyInfo) {
      return NextResponse.json({ error: "Invalid Spotify URL" }, { status: 400 })
    }

    // Fetch streaming links
    const { services, artistName, previewUrl } = await fetchStreamingLinks(url)

    return NextResponse.json({
      type: spotifyInfo.type,
      id: spotifyInfo.id,
      artistName,
      previewUrl,
      streamingServices: services
    })
  } catch (error) {
    console.error("Spotify API error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
