import { NextRequest, NextResponse } from "next/server"
import { deadlineFetch } from "@/lib/net/deadline"
import { embedAddress } from "@/lib/onepage/embed-address"
import { embedLookupRefusal } from "@/lib/onepage/embed-gate"

/* A provider that does not answer is given up on after EMBED_FETCH_MS, not at the platform's 300 seconds: the lookup answers without those details, as it does when the provider says no. */
const EMBED_FETCH_MS = 8_000
const embedFetch = (url: string, init: RequestInit = {}) => deadlineFetch(url, init, { ms: EMBED_FETCH_MS })

// Extract SoundCloud entity info from URL
function extractSoundCloudInfo(url: string): { type: 'track' | 'playlist' | 'artist', username: string, trackSlug?: string } | null {
  try {
    const urlObj = new URL(url)
    
    // SoundCloud URLs format:
    // Artist: https://soundcloud.com/username
    // Track: https://soundcloud.com/username/track-name
    // Playlist/Set: https://soundcloud.com/username/sets/playlist-name
    
    const pathParts = urlObj.pathname.split('/').filter(Boolean)
    
    if (pathParts.length >= 1) {
      const username = pathParts[0]
      
      if (pathParts.length === 1) {
        // Just username - it's an artist page
        return { type: 'artist', username }
      } else if (pathParts[1] === 'sets' && pathParts.length >= 3) {
        // It's a playlist/set
        return { type: 'playlist', username, trackSlug: pathParts[2] }
      } else if (pathParts.length >= 2) {
        // It's a track
        return { type: 'track', username, trackSlug: pathParts[1] }
      }
    }
    return null
  } catch {
    return null
  }
}

// Fetch metadata using SoundCloud oEmbed API
async function fetchSoundCloudMetadata(url: string): Promise<{
  title: string | null
  artistName: string | null
  thumbnailUrl: string | null
  type: 'track' | 'playlist' | 'artist' | null
}> {
  let title: string | null = null
  let artistName: string | null = null
  let thumbnailUrl: string | null = null
  let type: 'track' | 'playlist' | 'artist' | null = null

  // Determine type from URL
  if (url.includes('/sets/')) {
    type = 'playlist'
  } else {
    const pathParts = new URL(url).pathname.split('/').filter(Boolean)
    if (pathParts.length === 1) {
      type = 'artist'
    } else {
      type = 'track'
    }
  }

  try {
    // Use SoundCloud oEmbed API
    const oembedResponse = await embedFetch(
      `https://soundcloud.com/oembed?format=json&url=${encodeURIComponent(url)}`,
      { headers: { 'Accept': 'application/json' } }
    )

    if (oembedResponse.ok) {
      const data = await oembedResponse.json()
      
      // Get thumbnail
      thumbnailUrl = data.thumbnail_url || null
      
      // Parse title and artist from the response
      if (data.title) {
        // oEmbed title format: "Track Name by Artist Name" or just "Artist Name" for profiles
        const fullTitle = data.title
        
        if (type === 'artist') {
          artistName = fullTitle
          title = fullTitle
        } else {
          // Try to extract "Track by Artist" format
          const byMatch = fullTitle.match(/^(.+?)\s+by\s+(.+?)$/i)
          if (byMatch) {
            title = byMatch[1].trim()
            artistName = byMatch[2].trim()
          } else {
            title = fullTitle
          }
        }
      }
      
      // Also get author name if available
      if (data.author_name && !artistName) {
        artistName = data.author_name
      }
    }
  } catch (e) {
    console.error('SoundCloud oEmbed error:', e)
  }

  // Fallback: Try to scrape the page for og:image if no thumbnail
  if (!thumbnailUrl) {
    try {
      const pageResponse = await embedFetch(url, {
        headers: { 
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
      })
      
      if (pageResponse.ok) {
        const html = await pageResponse.text()
        
        // Extract og:image
        const ogImageMatch = html.match(/<meta[^>]*property="og:image"[^>]*content="([^"]+)"/i) ||
                            html.match(/<meta[^>]*content="([^"]+)"[^>]*property="og:image"/i)
        if (ogImageMatch) {
          thumbnailUrl = ogImageMatch[1]
        }
        
        // Extract og:title if we don't have title
        if (!title) {
          const ogTitleMatch = html.match(/<meta[^>]*property="og:title"[^>]*content="([^"]+)"/i) ||
                              html.match(/<meta[^>]*content="([^"]+)"[^>]*property="og:title"/i)
          if (ogTitleMatch) {
            const fullTitle = ogTitleMatch[1]
            // Format: "Track Name by Artist | Free Listening on SoundCloud"
            const cleanTitle = fullTitle.replace(/\s*\|\s*Free Listening on SoundCloud/i, '')
            const byMatch = cleanTitle.match(/^(.+?)\s+by\s+(.+?)$/i)
            if (byMatch) {
              title = byMatch[1].trim()
              artistName = artistName || byMatch[2].trim()
            } else {
              title = cleanTitle
            }
          }
        }
      }
    } catch (e) {
      console.error('SoundCloud page scrape error:', e)
    }
  }

  return {
    title,
    artistName,
    thumbnailUrl,
    type
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

    /* SoundCloud's own address only: nothing checked the host, so the page read below was any address (lib/onepage/embed-address.ts). */
    const url = embedAddress("soundcloud", asked)
    const soundcloudInfo = url ? extractSoundCloudInfo(url) : null

    if (!url || !soundcloudInfo) {
      return NextResponse.json({ error: "Invalid SoundCloud URL" }, { status: 400 })
    }

    // Fetch metadata
    const { title, artistName, thumbnailUrl, type } = await fetchSoundCloudMetadata(url)

    return NextResponse.json({
      type: type || soundcloudInfo.type,
      username: soundcloudInfo.username,
      trackSlug: soundcloudInfo.trackSlug,
      artistName,
      title,
      thumbnailUrl
    })
  } catch (error) {
    console.error("SoundCloud API error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
