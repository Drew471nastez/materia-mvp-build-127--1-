/**
 * The picture a shared event link shows: cover, title, and a line of the
 * description. next/og only, so every box uses display:flex and inline styles.
 */
import { clip } from "@/components/community/public/share-card"
import { EVENT_SHARE_HEIGHT, EVENT_SHARE_WIDTH, eventPlain, type EventFacts } from "./event-seo"

const INK = "#1a1a2e"
const MUTED = "#5f6470"
const SIDE = 64
const COVER_W = 520

export function EventShareArt({
  facts,
  coverSrc,
  logoSrc,
  whenLabel,
  fontFamily = "Inter",
}: {
  facts: EventFacts
  coverSrc: string | null
  logoSrc: string | null
  whenLabel: string | null
  fontFamily?: string
}) {
  const excerpt = eventPlain(facts.event.description, 160)
  const textWidth = EVENT_SHARE_WIDTH - SIDE * 2 - (coverSrc ? COVER_W + 40 : 0)
  return (
    <div style={{ width: EVENT_SHARE_WIDTH, height: EVENT_SHARE_HEIGHT, display: "flex", backgroundColor: "#ffffff", fontFamily, color: INK }}>
      <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", width: textWidth + SIDE, padding: `${SIDE}px 0 ${SIDE}px ${SIDE}px` }}>
        <div style={{ display: "flex", alignItems: "center" }}>
          {logoSrc ? (
            <img src={logoSrc} alt="" width={52} height={52} style={{ width: 52, height: 52, borderRadius: 14, objectFit: "cover" }} />
          ) : (
            <div style={{ width: 52, height: 52, borderRadius: 14, backgroundColor: INK }} />
          )}
          <div style={{ display: "flex", marginLeft: 16, fontSize: 26, fontWeight: 600 }}>{clip(facts.community.name, 32)}</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          {facts.event.status === "cancelled" ? <div style={{ display: "flex", fontSize: 22, fontWeight: 600, color: "#b42318", marginBottom: 10 }}>Cancelled</div> : null}
          <div style={{ display: "flex", fontSize: 52, fontWeight: 600, lineHeight: 1.12, letterSpacing: -0.8 }}>{clip(facts.event.title, coverSrc ? 72 : 90)}</div>
          {excerpt ? <div style={{ display: "flex", marginTop: 18, fontSize: 26, lineHeight: 1.35, color: MUTED }}>{clip(excerpt, coverSrc ? 90 : 140)}</div> : null}
        </div>
        <div style={{ display: "flex", fontSize: 24, color: MUTED }}>{whenLabel || "Event"}{facts.event.location ? `  ·  ${clip(facts.event.location, 28)}` : ""}</div>
      </div>
      {coverSrc ? (
        <div style={{ display: "flex", width: COVER_W, height: EVENT_SHARE_HEIGHT, marginLeft: "auto" }}>
          <img src={coverSrc} alt="" width={COVER_W} height={EVENT_SHARE_HEIGHT} style={{ width: COVER_W, height: EVENT_SHARE_HEIGHT, objectFit: "cover" }} />
        </div>
      ) : null}
    </div>
  )
}

export function GenericEventShareArt({ name, logoSrc, fontFamily = "Inter" }: { name: string; logoSrc: string | null; fontFamily?: string }) {
  return (
    <div style={{ width: EVENT_SHARE_WIDTH, height: EVENT_SHARE_HEIGHT, display: "flex", flexDirection: "column", justifyContent: "center", padding: SIDE, backgroundColor: "#ffffff", fontFamily }}>
      <div style={{ display: "flex", alignItems: "center" }}>
        {logoSrc ? <img src={logoSrc} alt="" width={72} height={72} style={{ width: 72, height: 72, borderRadius: 18, objectFit: "cover" }} /> : <div style={{ width: 72, height: 72, borderRadius: 18, backgroundColor: INK }} />}
        <div style={{ display: "flex", marginLeft: 20, fontSize: 32, fontWeight: 600 }}>{clip(name, 36)}</div>
      </div>
      <div style={{ display: "flex", marginTop: 28, fontSize: 56, fontWeight: 600 }}>An event for members</div>
    </div>
  )
}
