import { NextRequest, NextResponse } from "next/server"
import { EMBED_HOSTS, embedSource } from "@/lib/onepage/embed-source"
import { addressSubject, rateLimit } from "@/lib/api/rate-limit"

// Helper to extract channel ID or username from YouTube URL
function extractYouTubeChannelInfo(url: string): { type: 'channel' | 'user' | 'custom' | 'video', id: string } | null {
  try {
    const urlObj = new URL(url)
    const pathname = urlObj.pathname

    // Channel ID format: youtube.com/channel/UC...
    const channelMatch = pathname.match(/\/channel\/([^\/\?]+)/)
    if (channelMatch) {
      return { type: 'channel', id: channelMatch[1] }
    }

    // Username format: youtube.com/user/username or youtube.com/@username
    const userMatch = pathname.match(/\/user\/([^\/\?]+)/)
    if (userMatch) {
      return { type: 'user', id: userMatch[1] }
    }

    // Custom URL format: youtube.com/@handle or youtube.com/c/name
    const handleMatch = pathname.match(/\/@([^\/\?]+)/)
    if (handleMatch) {
      return { type: 'custom', id: handleMatch[1] }
    }

    const customMatch = pathname.match(/\/c\/([^\/\?]+)/)
    if (customMatch) {
      return { type: 'custom', id: customMatch[1] }
    }

    // Video format: youtube.com/watch?v=... or youtu.be/...
    if (pathname.includes('/watch') || urlObj.host === 'youtu.be') {
      const videoId = urlObj.searchParams.get('v') || pathname.replace('/', '')
      if (videoId) {
        return { type: 'video', id: videoId }
      }
    }

    return null
  } catch {
    return null
  }
}

// Fetch channel page to get channel ID from handle/username
async function resolveChannelId(info: { type: string, id: string }): Promise<string | null> {
  if (info.type === 'channel') {
    return info.id
  }

  // For custom handles and usernames, we need to fetch the channel page
  let channelUrl: string
  if (info.type === 'custom') {
    channelUrl = `https://www.youtube.com/@${info.id}`
  } else if (info.type === 'user') {
    channelUrl = `https://www.youtube.com/user/${info.id}`
  } else {
    return null
  }

  try {
    const response = await fetch(channelUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    })

    if (!response.ok) return null

    const html = await response.text()

    // Look for channel ID in the page
    const channelIdMatch = html.match(/\"channelId\":\"(UC[^\"]+)\"/)
    if (channelIdMatch) {
      return channelIdMatch[1]
    }

    // Alternative pattern
    const altMatch = html.match(/channel_id=([^\"&]+)/)
    if (altMatch) {
      return altMatch[1]
    }

    return null
  } catch {
    return null
  }
}

// Fetch latest video from YouTube RSS feed
async function fetchLatestVideo(channelId: string): Promise<{ videoId: string, title: string, thumbnailUrl: string } | null> {
  try {
    const rssUrl = `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`
    const response = await fetch(rssUrl)

    if (!response.ok) return null

    const xml = await response.text()

    // Parse the first video entry from RSS
    const videoIdMatch = xml.match(/<yt:videoId>([^<]+)<\/yt:videoId>/)
    const titleMatch = xml.match(/<entry>[\s\S]*?<title>([^<]+)<\/title>/)

    if (!videoIdMatch) return null

    const videoId = videoIdMatch[1]
    const title = titleMatch ? titleMatch[1] : 'Latest Video'

    return {
      videoId,
      title,
      thumbnailUrl: `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`
    }
  } catch {
    return null
  }
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const url = searchParams.get("url")

    if (!url) {
      return NextResponse.json({ error: "Missing url parameter" }, { status: 400 })
    }

    /* A YouTube address, by host: the path alone used to be enough, so any site with a /channel/... path was accepted. */
    const source = embedSource(url, EMBED_HOSTS.youtube)
    const info = source ? extractYouTubeChannelInfo(source.toString()) : null

    if (!source || !info) {
      return NextResponse.json({ error: "Invalid YouTube URL" }, { status: 400 })
    }

    /* This route asks YouTube on the caller's behalf and needs no account, so it is counted per address. */
    const limited = await rateLimit({
      bucket: "onepage-embed",
      subjects: [addressSubject(request)],
      windows: [{ limit: 30, seconds: 60 }, { limit: 300, seconds: 3600 }],
      message: "That is a lot of links at once. Try again in a minute.",
    })
    if (limited) return limited

    // If it's already a video, just return the video info
    if (info.type === 'video') {
      return NextResponse.json({
        type: 'video',
        videoId: info.id,
        thumbnailUrl: `https://img.youtube.com/vi/${info.id}/maxresdefault.jpg`
      })
    }

    // Resolve to channel ID
    const channelId = await resolveChannelId(info)

    if (!channelId) {
      return NextResponse.json({ error: "Could not resolve channel ID" }, { status: 404 })
    }

    // Fetch latest video
    const latestVideo = await fetchLatestVideo(channelId)

    return NextResponse.json({
      type: 'channel',
      channelId,
      profileUrl: `https://www.youtube.com/channel/${channelId}`,
      latestVideo: latestVideo || null
    })
  } catch (error) {
    console.error("YouTube API error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
