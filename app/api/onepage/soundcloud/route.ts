import { NextRequest, NextResponse } from "next/server"
import { EMBED_HOSTS, embedSource } from "@/lib/onepage/embed-source"
import { addressSubject, rateLimit } from "@/lib/api/rate-limit"

/** How long the server waits on somebody else's page before giving up on the picture. */
const SCRAPE_TIMEOUT_MS = 8000

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
    const oembedResponse = await fetch(
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
      /* url is soundcloud.com over https: the caller's string never reaches here (lib/onepage/embed-source.ts). */
      const pageResponse = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        },
        signal: AbortSignal.timeout(SCRAPE_TIMEOUT_MS)
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
  try {
    const searchParams = request.nextUrl.searchParams
    const url = searchParams.get("url")

    if (!url) {
      return NextResponse.json({ error: "Missing url parameter" }, { status: 400 })
    }

    /* A SoundCloud address: the host was not checked at all before, so any address was scraped and read back. */
    const source = embedSource(url, EMBED_HOSTS.soundcloud)
    const soundcloudInfo = source ? extractSoundCloudInfo(source.toString()) : null

    if (!source || !soundcloudInfo) {
      return NextResponse.json({ error: "Invalid SoundCloud URL" }, { status: 400 })
    }

    /* This route asks another site on the caller's behalf and needs no account, so it is counted per address. */
    const limited = await rateLimit({
      bucket: "onepage-embed",
      subjects: [addressSubject(request)],
      windows: [{ limit: 30, seconds: 60 }, { limit: 300, seconds: 3600 }],
      message: "That is a lot of links at once. Try again in a minute.",
    })
    if (limited) return limited

    // Fetch metadata
    const { title, artistName, thumbnailUrl, type } = await fetchSoundCloudMetadata(source.toString())

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
