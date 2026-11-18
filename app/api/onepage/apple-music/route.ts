import { NextRequest, NextResponse } from "next/server"
import { deadlineFetch } from "@/lib/net/deadline"
import { embedAddress } from "@/lib/onepage/embed-address"
import { embedLookupRefusal } from "@/lib/onepage/embed-gate"

/* A provider that does not answer is given up on after EMBED_FETCH_MS, not at the platform's 300 seconds: the lookup answers without those details, as it does when the provider says no. */
const EMBED_FETCH_MS = 8_000
const embedFetch = (url: string, init: RequestInit = {}) => deadlineFetch(url, init, { ms: EMBED_FETCH_MS })

// Extract Apple Music entity info from URL
function extractAppleMusicInfo(url: string): { type: 'song' | 'album' | 'artist' | 'playlist', id: string, country: string } | null {
  try {
    const urlObj = new URL(url)
    
    // Apple Music URLs formats:
    // https://music.apple.com/us/album/album-name/1234567890
    // https://music.apple.com/us/album/album-name/1234567890?i=1234567891 (for a specific song)
    // https://music.apple.com/us/song/song-name/1234567890 (direct song URL)
    // https://music.apple.com/us/artist/artist-name/1234567890
    // https://music.apple.com/us/playlist/playlist-name/pl.1234567890
    
    const pathParts = urlObj.pathname.split('/').filter(Boolean)
    
    if (pathParts.length >= 3) {
      const country = pathParts[0] || 'us'
      const type = pathParts[1]
      
      // Check if it's a song (album with ?i= parameter)
      const songId = urlObj.searchParams.get('i')
      if (songId && type === 'album') {
        return { type: 'song', id: songId, country }
      }
      
      // Get the ID from the last part
      const id = pathParts[pathParts.length - 1]
      
      // Handle direct song URLs (type === 'song')
      if (type === 'song') {
        return { type: 'song', id, country }
      } else if (type === 'album') {
        return { type: 'album', id, country }
      } else if (type === 'artist') {
        return { type: 'artist', id, country }
      } else if (type === 'playlist') {
        return { type: 'playlist', id, country }
      }
    }
    return null
  } catch {
    return null
  }
}

// Fetch metadata from Apple Music page
async function fetchAppleMusicMetadata(appleMusicUrl: string): Promise<{
  artistName: string | null
  title: string | null
  thumbnailUrl: string | null
  type: 'song' | 'album' | 'artist' | 'playlist' | null
  previewUrl: string | null
}> {
  let artistName: string | null = null
  let title: string | null = null
  let thumbnailUrl: string | null = null
  let type: 'song' | 'album' | 'artist' | 'playlist' | null = null
  let previewUrl: string | null = null

  // Determine type from URL
  if (appleMusicUrl.includes('/song/')) {
    type = 'song'
  } else if (appleMusicUrl.includes('/album/') && appleMusicUrl.includes('?i=')) {
    type = 'song'
  } else if (appleMusicUrl.includes('/album/')) {
    type = 'album'
  } else if (appleMusicUrl.includes('/artist/')) {
    type = 'artist'
  } else if (appleMusicUrl.includes('/playlist/')) {
    type = 'playlist'
  }

  try {
    // First try odesli.co API for better metadata
    const odesliResponse = await embedFetch(
      `https://api.song.link/v1-alpha.1/links?url=${encodeURIComponent(appleMusicUrl)}&userCountry=US`,
      { headers: { 'Accept': 'application/json' } }
    )

    if (odesliResponse.ok) {
      const data = await odesliResponse.json()

      // Try to get info from entity data
      if (data.entitiesByUniqueId) {
        const entities = Object.values(data.entitiesByUniqueId) as any[]
        // Find Apple Music entity first, fallback to any entity
        const appleEntity = entities.find((e: any) => e.apiProvider === 'itunes') || entities[0]
        
        if (appleEntity) {
          artistName = appleEntity.artistName || null
          title = appleEntity.title || null
          thumbnailUrl = appleEntity.thumbnailUrl || null
          
          // Update type from odesli if available
          if (appleEntity.type === 'song') type = 'song'
          else if (appleEntity.type === 'album') type = 'album'
        }
      }
    }
  } catch (e) {
    console.error('Odesli API error:', e)
  }

  // Fallback: Scrape Apple Music page directly
  if (!thumbnailUrl || !title) {
    try {
      const pageResponse = await embedFetch(appleMusicUrl, {
        headers: { 
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
      })
      
      if (pageResponse.ok) {
        const html = await pageResponse.text()
        
        // Extract og:image for thumbnail
        if (!thumbnailUrl) {
          const ogImageMatch = html.match(/<meta[^>]*property="og:image"[^>]*content="([^"]+)"/i) ||
                              html.match(/<meta[^>]*content="([^"]+)"[^>]*property="og:image"/i)
          if (ogImageMatch) {
            // Increase image quality
            thumbnailUrl = ogImageMatch[1]
              .replace(/\d+x\d+/, '600x600')
          }
        }
        
        // Extract og:title for title/artist
        if (!title || !artistName) {
          const ogTitleMatch = html.match(/<meta[^>]*property="og:title"[^>]*content="([^"]+)"/i) ||
                              html.match(/<meta[^>]*content="([^"]+)"[^>]*property="og:title"/i)
          if (ogTitleMatch) {
            const fullTitle = ogTitleMatch[1]
            
            // Parse title based on format "Title by Artist on Apple Music"
            if (type === 'song' || type === 'album') {
              const match = fullTitle.match(/^(.+?)\s+by\s+(.+?)(?:\s+on\s+Apple\s+Music)?$/i)
              if (match) {
                title = title || match[1].trim()
                artistName = artistName || match[2].trim()
              } else {
                title = title || fullTitle.replace(/\s+on\s+Apple\s+Music$/i, '').trim()
              }
            } else if (type === 'artist') {
              artistName = artistName || fullTitle.replace(/\s+on\s+Apple\s+Music$/i, '').trim()
              title = title || artistName
            } else if (type === 'playlist') {
              const match = fullTitle.match(/^(.+?)\s+by\s+(.+?)(?:\s+on\s+Apple\s+Music)?$/i)
              if (match) {
                title = title || match[1].trim()
                artistName = artistName || match[2].trim()
              } else {
                title = title || fullTitle.replace(/\s+on\s+Apple\s+Music$/i, '').trim()
              }
            }
          }
        }
        
        // Try to find preview URL from page source
        const previewMatch = html.match(/"preview":\s*\{\s*"url":\s*"([^"]+)"/i) ||
                            html.match(/"previewUrl":\s*"([^"]+)"/i)
        if (previewMatch) {
          previewUrl = previewMatch[1]
        }
      }
    } catch (e) {
      console.error('Apple Music page scrape error:', e)
    }
  }

  return {
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

    /* Apple Music's own address only: "music.apple.com" anywhere in it let the page read below be any address (lib/onepage/embed-address.ts). */
    const url = embedAddress("appleMusic", asked)
    if (!url) {
      return NextResponse.json({ error: "Invalid Apple Music URL" }, { status: 400 })
    }

    const appleMusicInfo = extractAppleMusicInfo(url)
    
    // Fetch metadata
    const { artistName, title, thumbnailUrl, type, previewUrl } = await fetchAppleMusicMetadata(url)

    return NextResponse.json({
      type: type || appleMusicInfo?.type || 'song',
      id: appleMusicInfo?.id || '',
      country: appleMusicInfo?.country || 'us',
      artistName,
      title,
      thumbnailUrl,
      previewUrl
    })
  } catch (error) {
    console.error("Apple Music API error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
