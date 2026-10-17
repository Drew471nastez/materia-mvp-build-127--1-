/**
 * The picture a shared event link shows. Drawn per request from the cover,
 * title, and description when the event is public; otherwise a generic card.
 */
import { ImageResponse } from "next/og"
import { sharePreviewable } from "@/lib/communities/server/public"
import { shareFonts, sharePicture } from "@/lib/communities/server/share-image"
import { eventTime } from "@/lib/communities/format"
import { eventFacts } from "../event-facts"
import { EVENT_SHARE_HEIGHT, EVENT_SHARE_WIDTH, indexableEvent } from "../event-seo"
import { EventShareArt, GenericEventShareArt } from "../event-share-card"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const BRIEF = "public, max-age=300, s-maxage=600, stale-while-revalidate=86400"
const MISSING = "public, max-age=60, s-maxage=60"

function missing(): Response {
  return new Response("Not found", { status: 404, headers: { "cache-control": MISSING } })
}

async function png(element: React.ReactElement): Promise<ArrayBuffer | null> {
  try {
    const fonts = await shareFonts()
    const image = new ImageResponse(element, { width: EVENT_SHARE_WIDTH, height: EVENT_SHARE_HEIGHT, ...(fonts.length ? { fonts } : {}) })
    return await image.arrayBuffer()
  } catch (error) {
    console.error("Event share image could not be drawn:", error instanceof Error ? error.message : "unknown")
    return null
  }
}

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string; eventId: string }> }) {
  const { slug, eventId } = await params
  const facts = await eventFacts(slug, eventId)
  if (!facts || !sharePreviewable(facts.communityRow)) return missing()
  const logo = await sharePicture(facts.community.logo_url, 144, 144, "png")
  const open = indexableEvent(facts)
  const drawn = open
    ? await png(
        <EventShareArt
          facts={facts}
          logoSrc={logo}
          coverSrc={await sharePicture(facts.event.coverUrl, 520, EVENT_SHARE_HEIGHT, "jpeg")}
          whenLabel={eventTime(facts.event.startsAt, null, { timeZone: facts.event.timezone })}
        />,
      )
    : await png(<GenericEventShareArt name={facts.community.name} logoSrc={logo} />)
  if (!drawn) return missing()
  return new Response(drawn, { headers: { "content-type": "image/png", "cache-control": BRIEF } })
}
