import { NextRequest, NextResponse } from "next/server"
import { EMBED_HOSTS, embedSource } from "@/lib/onepage/embed-source"
import { addressSubject, rateLimit } from "@/lib/api/rate-limit"

/** How long the server waits on somebody else's page before giving up on the picture. */
const SCRAPE_TIMEOUT_MS = 8000

// Extract TikTok video info from URL
function extractTikTokInfo(url: string): { videoId: string | null, username: string | null } {
  try {
    const urlObj = new URL(url)

    // TikTok URLs formats:
    // Video: https://www.tiktok.com/@username/video/1234567890123456789
    // Short: https://vm.tiktok.com/shortcode/

    const pathParts = urlObj.pathname.split('/').filter(Boolean)

    // Standard video URL
    if (pathParts.length >= 3 && pathParts[1] === 'video') {
      const username = pathParts[0].replace('@', '')
      const videoId = pathParts[2]
      return { videoId, username }
    }

    // Profile URL
    if (pathParts.length >= 1 && pathParts[0].startsWith('@')) {
      const username = pathParts[0].replace('@', '')
      return { videoId: null, username }
    }

    // Short URL (vm.tiktok.com)
    if (urlObj.hostname === 'vm.tiktok.com') {
      return { videoId: null, username: null }
    }

    return { videoId: null, username: null }
  } catch {
    return { videoId: null, username: null }
  }
}

// Fetch metadata using TikTok oEmbed API
async function fetchTikTokMetadata(url: string): Promise<{
  title: string | null
  authorName: string | null
  thumbnailUrl: string | null
  embedUrl: string | null
  embedHtml: string | null
}> {
  let title: string | null = null
  let authorName: string | null = null
  let thumbnailUrl: string | null = null
  let embedUrl: string | null = null
  let embedHtml: string | null = null

  try {
    // Use TikTok oEmbed API
    const oembedResponse = await fetch(
      `https://www.tiktok.com/oembed?url=${encodeURIComponent(url)}`,
      { headers: { 'Accept': 'application/json' } }
    )

    if (oembedResponse.ok) {
      const data = await oembedResponse.json()

      // Get metadata from oEmbed response
      title = data.title || null
      authorName = data.author_name || null
      thumbnailUrl = data.thumbnail_url || null
      embedHtml = data.html || null

      // Extract embed URL from HTML if available
      if (embedHtml) {
        const srcMatch = embedHtml.match(/src="([^"]+)"/)
        if (srcMatch) {
          embedUrl = srcMatch[1]
        }
      }

      // Construct embed URL if we have the video info
      if (!embedUrl) {
        const { videoId, username } = extractTikTokInfo(url)
        if (videoId && username) {
          embedUrl = `https://www.tiktok.com/embed/v2/${videoId}`
        }
      }
    }
  } catch (e) {
    console.error('TikTok oEmbed error:', e)
  }

  // Fallback: Try to scrape the page for og:image if no thumbnail
  if (!thumbnailUrl) {
    try {
      /* url is tiktok.com over https: the caller's string never reaches here (lib/onepage/embed-source.ts). */
      const pageResponse = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        },
        redirect: 'follow',
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
            title = ogTitleMatch[1]
          }
        }
      }
    } catch (e) {
      console.error('TikTok page scrape error:', e)
    }
  }

  return {
    title,
    authorName,
    thumbnailUrl,
    embedUrl,
    embedHtml
  }
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const url = searchParams.get("url")

    if (!url) {
      return NextResponse.json({ error: "Missing url parameter" }, { status: 400 })
    }

    /* A TikTok address, checked by host and not by the name appearing somewhere in the string. */
    const source = embedSource(url, EMBED_HOSTS.tiktok)
    if (!source) {
      return NextResponse.json({ error: "Invalid TikTok URL" }, { status: 400 })
    }

    /* This route asks another site on the caller's behalf and needs no account, so it is counted per address. */
    const limited = await rateLimit({
      bucket: "onepage-embed",
      subjects: [addressSubject(request)],
      windows: [{ limit: 30, seconds: 60 }, { limit: 300, seconds: 3600 }],
      message: "That is a lot of links at once. Try again in a minute.",
    })
    if (limited) return limited

    const target = source.toString()
    const tiktokInfo = extractTikTokInfo(target)

    // Fetch metadata
    const { title, authorName, thumbnailUrl, embedUrl, embedHtml } = await fetchTikTokMetadata(target)

    return NextResponse.json({
      videoId: tiktokInfo.videoId,
      username: tiktokInfo.username,
      title,
      authorName,
      thumbnailUrl,
      embedUrl,
      embedHtml
    })
  } catch (error) {
    console.error("TikTok API error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
