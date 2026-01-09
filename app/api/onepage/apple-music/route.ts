import { NextRequest, NextResponse } from "next/server"

// Extract Apple Music entity info from URL
function extractAppleMusicInfo(url: string): { type: 'song' | 'album' | 'artist' | 'playlist', id: string, country: string } | null {
  try {
    const urlObj = new URL(url)
    
    // Apple Music URLs format: https://music.apple.com/{country}/{type}/{name}/{id}
    // Examples:
    // https://music.apple.com/us/album/album-name/1234567890
    // https://music.apple.com/us/album/album-name/1234567890?i=1234567891 (for a specific song)
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
      
      if (type === 'album') {
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

// Try to use odesli.co (song.link) API to find streaming links
async function fetchStreamingLinks(appleMusicUrl: string): Promise<{
  services: {
    platform: string
    url: string | null
    found: boolean
  }[]
  artistName: string | null
  title: string | null
  thumbnailUrl: string | null
  type: 'song' | 'album' | 'artist' | 'playlist' | null
  previewUrl: string | null
}> {
  const platforms = [
    { platform: 'spotify', found: false, url: null as string | null },
    { platform: 'youtube_music', found: false, url: null as string | null },
    { platform: 'soundcloud', found: false, url: null as string | null },
    { platform: 'tidal', found: false, url: null as string | null },
    { platform: 'deezer', found: false, url: null as string | null },
    { platform: 'amazon_music', found: false, url: null as string | null },
  ]

  let artistName: string | null = null
  let title: string | null = null
  let thumbnailUrl: string | null = null
  let type: 'song' | 'album' | 'artist' | 'playlist' | null = null
  let previewUrl: string | null = null

  try {
    // Use odesli.co (song.link) API to find cross-platform links
    const odesliResponse = await fetch(
      `https://api.song.link/v1-alpha.1/links?url=${encodeURIComponent(appleMusicUrl)}&userCountry=US`,
      { headers: { 'Accept': 'application/json' } }
    )

    if (odesliResponse.ok) {
      const data = await odesliResponse.json()

      // Map odesli platforms to our platform names
      const platformMapping: Record<string, string> = {
        'spotify': 'spotify',
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

      // Try to get info from entity data
      if (data.entitiesByUniqueId) {
        const entities = Object.values(data.entitiesByUniqueId) as any[]
        // Find Apple Music entity first, fallback to any entity
        const appleEntity = entities.find((e: any) => e.apiProvider === 'itunes') || entities[0]
        
        if (appleEntity) {
          artistName = appleEntity.artistName || null
          title = appleEntity.title || null
          thumbnailUrl = appleEntity.thumbnailUrl || null
          
          // Determine type
          if (appleEntity.type === 'song') type = 'song'
          else if (appleEntity.type === 'album') type = 'album'
          else if (appleMusicUrl.includes('/artist/')) type = 'artist'
          else if (appleMusicUrl.includes('/playlist/')) type = 'playlist'
        }
      }

      // Get thumbnail from page data if not found
      if (!thumbnailUrl && data.pageUrl) {
        // Try to get og:image from the page
        try {
          const pageResponse = await fetch(data.pageUrl, { 
            headers: { 'User-Agent': 'Mozilla/5.0 (compatible)' }
          })
          if (pageResponse.ok) {
            const html = await pageResponse.text()
            const ogImageMatch = html.match(/<meta[^>]*property="og:image"[^>]*content="([^"]+)"/i)
            if (ogImageMatch) {
              thumbnailUrl = ogImageMatch[1]
            }
          }
        } catch (e) {
          // Ignore page fetch errors
        }
      }
    }
  } catch (e) {
    console.error('Odesli API error for Apple Music:', e)
  }

  // Fallback: Try to scrape Apple Music page directly for metadata
  if (!thumbnailUrl || !title) {
    try {
      const pageResponse = await fetch(appleMusicUrl, {
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
            // Increase image quality by modifying the URL
            thumbnailUrl = ogImageMatch[1]
              .replace(/\d+x\d+/, '600x600')
              .replace(/\.jpg$/, '.jpg')
          }
        }
        
        // Extract og:title for title
        if (!title) {
          const ogTitleMatch = html.match(/<meta[^>]*property="og:title"[^>]*content="([^"]+)"/i) ||
                              html.match(/<meta[^>]*content="([^"]+)"[^>]*property="og:title"/i)
          if (ogTitleMatch) {
            // Title format is usually "Song Name - Single by Artist on Apple Music" or similar
            const fullTitle = ogTitleMatch[1]
            
            // Parse based on URL type
            if (appleMusicUrl.includes('/album/') && appleMusicUrl.includes('?i=')) {
              // Song URL
              type = 'song'
              const songMatch = fullTitle.match(/^(.+?)\s*[-–]\s*(?:Single|EP|Album)?\s*by\s+(.+?)(?:\s+on\s+Apple\s+Music)?$/i)
              if (songMatch) {
                title = songMatch[1].trim()
                artistName = artistName || songMatch[2].trim()
              } else {
                title = fullTitle.replace(/\s+on\s+Apple\s+Music$/i, '').trim()
              }
            } else if (appleMusicUrl.includes('/album/')) {
              type = 'album'
              const albumMatch = fullTitle.match(/^(.+?)\s+by\s+(.+?)(?:\s+on\s+Apple\s+Music)?$/i)
              if (albumMatch) {
                title = albumMatch[1].trim()
                artistName = artistName || albumMatch[2].trim()
              } else {
                title = fullTitle.replace(/\s+on\s+Apple\s+Music$/i, '').trim()
              }
            } else if (appleMusicUrl.includes('/artist/')) {
              type = 'artist'
              artistName = fullTitle.replace(/\s+on\s+Apple\s+Music$/i, '').trim()
              title = artistName
            } else if (appleMusicUrl.includes('/playlist/')) {
              type = 'playlist'
              const playlistMatch = fullTitle.match(/^(.+?)\s+by\s+(.+?)(?:\s+on\s+Apple\s+Music)?$/i)
              if (playlistMatch) {
                title = playlistMatch[1].trim()
                artistName = playlistMatch[2].trim()
              } else {
                title = fullTitle.replace(/\s+on\s+Apple\s+Music$/i, '').trim()
              }
            }
          }
        }
        
        // Try to find preview URL
        const previewMatch = html.match(/"preview":\s*\{\s*"url":\s*"([^"]+)"/i)
        if (previewMatch) {
          previewUrl = previewMatch[1]
        }
      }
    } catch (e) {
      console.error('Apple Music page scrape error:', e)
    }
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
  try {
    const searchParams = request.nextUrl.searchParams
    const url = searchParams.get("url")

    if (!url) {
      return NextResponse.json({ error: "Missing url parameter" }, { status: 400 })
    }

    const appleMusicInfo = extractAppleMusicInfo(url)

    if (!appleMusicInfo) {
      return NextResponse.json({ error: "Invalid Apple Music URL" }, { status: 400 })
    }

    // Fetch streaming links and Apple Music info
    const { services, artistName, title, thumbnailUrl, type, previewUrl } = await fetchStreamingLinks(url)

    return NextResponse.json({
      type: type || appleMusicInfo.type,
      id: appleMusicInfo.id,
      country: appleMusicInfo.country,
      artistName,
      title,
      thumbnailUrl,
      previewUrl,
      streamingServices: services
    })
  } catch (error) {
    console.error("Apple Music API error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
