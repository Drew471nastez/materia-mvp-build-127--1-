/**
 * ===========================================================================
 *  THE PICTURE A SHARED COMMUNITY LINK SHOWS
 * ===========================================================================
 * Drawn by next/og (app/(marketing)/community/[slug]/share.png) for
 * /community/<slug>, its About and an invite link, 1200 by 630, the size
 * every app asks for: the community's cover across the top, its logo over
 * the cover's edge, its name and line, then who runs it, how many are in it
 * and what it costs, with one dark Join at the right, as the page's own
 * button reads.
 *
 * ONLY THE COMMUNITY'S PUBLIC FACE. The same facts its page shows anybody
 * (name, line, logo, cover, creator, member count, price); never a post, a
 * member, a space or anything an invite would let in. An invite link draws
 * the same card with "You're invited" over the name; the invite itself is
 * never read for it.
 *
 * Everything is an inline style and every box with children says
 * `display: flex`: next/og reads only that. Pure, so the probe draws it too.
 */
import { compactCount } from "@/lib/communities/format"

export const COMMUNITY_SHARE_WIDTH = 1200
export const COMMUNITY_SHARE_HEIGHT = 630

const INK = "#1a1a2e"
const MUTED = "#5f6470"
const COVER_H = 236
const LOGO = 132
const SIDE = 72

export interface CommunityShareModel {
  name: string
  tagline: string | null
  creatorName: string | null
  memberCount: number
  /** "Free", "$9/month", or null when there is no price to say. */
  priceLine: string | null
  /** Who may come in without an invite: an invite only community says so instead of a price. */
  inviteOnly: boolean
  /** Drawn for an invite link: "You're invited" over the name. */
  invite: boolean
}

/** Cut to `max` characters on a word, with an ellipsis, so next/og never draws half a word off the edge. */
export function clip(text: string, max: number): string {
  const chars = Array.from(text.replace(/\s+/g, " ").trim())
  if (chars.length <= max) return chars.join("")
  const cut = chars.slice(0, max - 1).join("")
  const space = cut.lastIndexOf(" ")
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).replace(/[\s,.;:-]+$/, "")}…`
}

/** The name's size and how much line fits under it: a long name takes two lines and leaves the line one. */
export function shareLayout(name: string): { nameSize: number; nameMax: number; taglineMax: number } {
  const n = Array.from(name.trim()).length
  if (n <= 24) return { nameSize: 64, nameMax: 24, taglineMax: 130 }
  if (n <= 34) return { nameSize: 54, nameMax: 34, taglineMax: 120 }
  return { nameSize: 50, nameMax: 64, taglineMax: 62 }
}

/** The words of the one button, as the page's own button says them. */
export function shareButtonLabel(m: Pick<CommunityShareModel, "invite" | "priceLine" | "inviteOnly">): string {
  if (m.invite) return "Accept invite"
  if (m.inviteOnly) return "Invite only"
  if (m.priceLine === "Free") return "Join free"
  return "Join"
}

function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean)
  return ((words[0]?.[0] ?? "") + (words[1]?.[0] ?? "")).toUpperCase() || "C"
}

export function CommunityShareArt({
  model,
  coverSrc,
  logoSrc,
  avatarSrc,
  fontFamily = "Inter",
}: {
  model: CommunityShareModel
  /** A data URL already cut to 1200 by the band's height on the server, or null for the quiet band. */
  coverSrc: string | null
  logoSrc: string | null
  avatarSrc: string | null
  fontFamily?: string
}) {
  const layout = shareLayout(model.name)
  const name = clip(model.name, layout.nameMax)
  /* The invite's words take a line, so the community's line keeps to one. */
  const tagline = model.tagline ? clip(model.tagline, model.invite ? Math.min(layout.taglineMax, 62) : layout.taglineMax) : null
  /* Invite only is a fact, not something to press: drawn as a hairline label rather than the dark button. */
  const quiet = !model.invite && model.inviteOnly
  const facts = [
    `${compactCount(model.memberCount)} ${model.memberCount === 1 ? "member" : "members"}`,
    model.inviteOnly ? null : model.priceLine || null,
  ].filter((x): x is string => Boolean(x))
  const button = shareButtonLabel(model)

  return (
    <div style={{ width: COMMUNITY_SHARE_WIDTH, height: COMMUNITY_SHARE_HEIGHT, display: "flex", flexDirection: "column", backgroundColor: "#ffffff", fontFamily, position: "relative" }}>
      {/* The band: the cover, or a quiet ground where there is none. A hairline under it either way. */}
      <div style={{ width: COMMUNITY_SHARE_WIDTH, height: COVER_H, display: "flex", backgroundColor: "#eceef1", borderBottom: "1px solid #e3e5e9" }}>
        {coverSrc ? <img src={coverSrc} alt="" width={COMMUNITY_SHARE_WIDTH} height={COVER_H} style={{ width: COMMUNITY_SHARE_WIDTH, height: COVER_H, objectFit: "cover" }} /> : null}
      </div>

      {/* The logo, over the band's edge, on a white ring. */}
      <div
        style={{
          position: "absolute",
          left: SIDE,
          top: COVER_H - LOGO / 2,
          width: LOGO + 12,
          height: LOGO + 12,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#ffffff",
          borderRadius: 34,
          boxShadow: "0 1px 2px rgba(16,24,40,0.10)",
        }}
      >
        {logoSrc ? (
          <img src={logoSrc} alt="" width={LOGO} height={LOGO} style={{ width: LOGO, height: LOGO, borderRadius: 28, objectFit: "cover" }} />
        ) : (
          <div style={{ width: LOGO, height: LOGO, borderRadius: 28, display: "flex", alignItems: "center", justifyContent: "center", backgroundColor: INK, color: "#ffffff", fontSize: 50, fontWeight: 600 }}>
            {initials(model.name)}
          </div>
        )}
      </div>

      <div style={{ display: "flex", flexDirection: "column", flexGrow: 1, padding: `${LOGO / 2 + 30}px ${SIDE}px 52px` }}>
        {model.invite ? <div style={{ display: "flex", fontSize: 24, fontWeight: 600, color: MUTED, marginBottom: 6 }}>You&apos;re invited to join</div> : null}
        <div style={{ display: "flex", fontSize: layout.nameSize, fontWeight: 600, color: INK, lineHeight: 1.08, letterSpacing: "-0.02em", maxWidth: COMMUNITY_SHARE_WIDTH - SIDE * 2 }}>{name}</div>
        {tagline ? <div style={{ display: "flex", marginTop: 14, fontSize: 27, color: MUTED, lineHeight: 1.35, maxWidth: 980 }}>{tagline}</div> : null}

        {/* Who, how many, how much, and the one button. Pinned to the bottom, whatever the words above took. */}
        <div style={{ display: "flex", alignItems: "center", marginTop: "auto", width: COMMUNITY_SHARE_WIDTH - SIDE * 2 }}>
          <div style={{ display: "flex", alignItems: "center", flexGrow: 1, fontSize: 25, color: MUTED }}>
            {model.creatorName ? (
              <div style={{ display: "flex", alignItems: "center" }}>
                {avatarSrc ? (
                  <img src={avatarSrc} alt="" width={44} height={44} style={{ width: 44, height: 44, borderRadius: 22, objectFit: "cover", marginRight: 14 }} />
                ) : (
                  <div style={{ width: 44, height: 44, borderRadius: 22, marginRight: 14, display: "flex", alignItems: "center", justifyContent: "center", backgroundColor: "#eceef1", color: "#4b5563", fontSize: 18, fontWeight: 600 }}>
                    {initials(model.creatorName)}
                  </div>
                )}
                <div style={{ display: "flex" }}>
                  by&nbsp;<span style={{ color: INK, fontWeight: 600 }}>{clip(model.creatorName, 28)}</span>
                </div>
              </div>
            ) : null}
            {facts.map((f, i) => (
              <div key={f} style={{ display: "flex", alignItems: "center" }}>
                {model.creatorName || i > 0 ? <div style={{ display: "flex", margin: "0 16px", color: "#b5b9c1" }}>·</div> : null}
                <div style={{ display: "flex", color: i === 1 ? INK : MUTED, fontWeight: i === 1 ? 600 : 400 }}>{f}</div>
              </div>
            ))}
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              height: 64,
              padding: "0 34px",
              borderRadius: 16,
              fontSize: 26,
              fontWeight: 600,
              ...(quiet
                ? { backgroundColor: "#ffffff", color: INK, border: "2px solid #dcdfe4" }
                : { backgroundColor: INK, color: "#ffffff", boxShadow: "0 1px 2px rgba(16,24,40,0.18)" }),
            }}
          >
            {button}
          </div>
        </div>
      </div>
    </div>
  )
}
