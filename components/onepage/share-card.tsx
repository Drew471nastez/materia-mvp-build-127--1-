/**
 * ===========================================================================
 *  THE PICTURE A SHARED ONEPAGE LINK SHOWS, DRAWN ONCE FOR TWO RENDERERS
 * ===========================================================================
 * The same elements draw the share image on the server (next/og, in
 * app/(marketing)/[sellername]/links/share.png) and the preview of it in the
 * editor's Settings, so the preview is the image and not a likeness of it.
 * That is why everything here is an inline style, every box with children
 * says `display: flex`, and nothing uses a class: next/og reads only that.
 *
 * 1200 by 630, the size every app asks for. The page's own background (its
 * colour, its gradient or its photo, dimmed), the photo in a circle, the name
 * in the title colour and the address under it. An uploaded picture replaces
 * all of it, cropped at the point the creator dragged to.
 */
import { SHARE_IMAGE_HEIGHT as H, SHARE_IMAGE_WIDTH as W, coverRect, type ShareCardModel } from "@/lib/onepage/seo"

type Size = { width: number; height: number }

/** The name's size: two lines of 64px fit about 26 characters a line. */
function nameSize(name: string): number {
  const n = Array.from(name).length
  return n <= 18 ? 72 : n <= 28 ? 62 : n <= 44 ? 52 : 44
}

export function ShareCardArt({
  card,
  avatarSrc,
  backgroundSrc,
  backgroundSize,
  fontFamily = "Inter",
}: {
  card: ShareCardModel
  /** The photo to draw: a data URL on the server, the photo's address in the editor. Null draws the initials. */
  avatarSrc: string | null
  backgroundSrc?: string | null
  /** The background photo's own size, where the renderer cannot cover a box itself. */
  backgroundSize?: Size | null
  fontFamily?: string
}) {
  const photo = backgroundSrc && card.background.imageUrl
  const cover = photo && backgroundSize ? coverRect(backgroundSize.width, backgroundSize.height, W, H, 50, 50) : null
  const shown = Array.from(card.name).length > 60 ? `${Array.from(card.name).slice(0, 59).join("")}…` : card.name
  return (
    <div
      style={{
        width: W,
        height: H,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        position: "relative",
        overflow: "hidden",
        backgroundColor: card.background.color,
        /* Only when there is one: next/og reads every key it is given, an undefined one included. */
        ...(card.background.gradient ? { backgroundImage: card.background.gradient } : {}),
        fontFamily,
      }}
    >
      {photo ? (
        <img
          src={backgroundSrc!}
          alt=""
          width={cover?.width ?? W}
          height={cover?.height ?? H}
          style={
            cover
              ? { position: "absolute", left: cover.left, top: cover.top, width: cover.width, height: cover.height }
              : { position: "absolute", left: 0, top: 0, width: W, height: H, objectFit: "cover" }
          }
        />
      ) : null}
      {photo ? (
        <div style={{ position: "absolute", left: 0, top: 0, width: W, height: H, display: "flex", backgroundColor: `rgba(0,0,0,${card.background.dim})` }} />
      ) : null}
      {avatarSrc ? (
        <img
          src={avatarSrc}
          alt=""
          width={208}
          height={208}
          style={{ width: 208, height: 208, borderRadius: 104, objectFit: "cover", boxShadow: "0 12px 40px rgba(0,0,0,0.18)" }}
        />
      ) : (
        <div
          style={{
            width: 208,
            height: 208,
            borderRadius: 104,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: card.accent,
            color: card.accentText,
            fontSize: 84,
            fontWeight: 600,
            letterSpacing: -1,
          }}
        >
          {card.initials}
        </div>
      )}
      <div
        style={{
          display: "flex",
          marginTop: 40,
          maxWidth: 1000,
          textAlign: "center",
          justifyContent: "center",
          color: card.text,
          fontSize: nameSize(shown),
          fontWeight: 600,
          lineHeight: 1.12,
          letterSpacing: -1.5,
        }}
      >
        {shown}
      </div>
      <div style={{ display: "flex", marginTop: 18, color: card.muted, fontSize: 30, fontWeight: 400, letterSpacing: -0.2 }}>{card.address}</div>
    </div>
  )
}

/** An uploaded picture, cropped to 1200 by 630 at the creator's point. */
export function ShareCardUpload({ src, size, focal }: { src: string; size: Size; focal: { x: number; y: number } }) {
  const r = coverRect(size.width, size.height, W, H, focal.x, focal.y)
  return (
    <div style={{ width: W, height: H, display: "flex", position: "relative", overflow: "hidden", backgroundColor: "#f3f4f6" }}>
      <img src={src} alt="" width={r.width} height={r.height} style={{ position: "absolute", left: r.left, top: r.top, width: r.width, height: r.height }} />
    </div>
  )
}
