/**
 * ===========================================================================
 *  THE PICTURE A SHARED PROFILE LINK SHOWS
 * ===========================================================================
 * Drawn by next/og (app/(marketing)/member/[username]/share.png) for
 * /@handle, 1200 by 630: the person's cover across the top (a quiet band
 * when they have none), their photo over its edge (the default face when
 * they have none, never initials), the name, @handle and the first words of
 * their bio, then their followers and the communities they are in (a
 * creator: their products), with one dark Follow at the right, as the
 * page's own button reads. Round 12: the same card for a creator's page and
 * for a person without a store, so a shared link to either reads the same,
 * with where they are from after the handle when they said. The same order
 * as a shared community's card (components/community/public/share-card.tsx),
 * so the two read as one family in a chat.
 *
 * ONLY WHAT THEIR PAGE SHOWS ANYBODY: the communities count is left out when
 * they keep their communities private (the route decides).
 *
 * Everything is an inline style and every box with children says
 * `display: flex`: next/og reads only that. Pure, so the probe draws it too.
 */
import { clip } from "@/components/community/public/share-card"
import { compactCount } from "@/lib/communities/format"

export const PROFILE_SHARE_WIDTH = 1200
export const PROFILE_SHARE_HEIGHT = 630

const INK = "#1a1a2e"
const MUTED = "#5f6470"
const COVER_H = 236
const FACE = 152
const SIDE = 72

export interface ProfileShareModel {
  name: string
  username: string
  bio: string | null
  followers: number
  /** Null when they keep the communities they are in private, and for a creator (their page lists what they made, not what they joined). */
  communities: number | null
  /** A creator's published products; null for a person without a store (round 12: one card for both). */
  products?: number | null
  /** Where they are from, one line (lib/profile/location.ts), drawn after the handle; null when they never said. */
  location?: string | null
}

/** The default face (components/app/app-avatar.tsx DefaultAvatarGlyph), drawn for next/og: a soft circle and a plain person. */
function DefaultFace({ size }: { size: number }) {
  return (
    <div style={{ width: size, height: size, borderRadius: size / 2, display: "flex", overflow: "hidden", backgroundColor: "#eceef1" }}>
      {/* The glyph's ink is the light ground's #4b5563 at a third, as AppAvatar draws it, worked out to one colour. */}
      <svg width={size} height={size} viewBox="0 0 64 64">
        <circle cx="32" cy="25.5" r="11.5" fill="#b9bbc0" />
        <path d="M8.5 64c0-13.6 10.5-22.5 23.5-22.5S55.5 50.4 55.5 64z" fill="#b9bbc0" />
      </svg>
    </div>
  )
}

export function ProfileShareArt({ model, coverSrc, avatarSrc, fontFamily = "Inter" }: { model: ProfileShareModel; coverSrc: string | null; avatarSrc: string | null; fontFamily?: string }) {
  const long = Array.from(model.name.trim()).length > 26
  const name = clip(model.name || model.username, long ? 44 : 26)
  const bio = model.bio ? clip(model.bio, long ? 70 : 120) : null
  const facts = [
    /* "0 followers" says nothing worth a line on a new account's card: absent beats zero. */
    model.followers > 0 ? `${compactCount(model.followers)} ${model.followers === 1 ? "follower" : "followers"}` : null,
    model.products ? `${compactCount(model.products)} ${model.products === 1 ? "product" : "products"}` : null,
    model.communities ? `In ${compactCount(model.communities)} ${model.communities === 1 ? "community" : "communities"}` : null,
  ].filter((x): x is string => Boolean(x))

  return (
    <div style={{ width: PROFILE_SHARE_WIDTH, height: PROFILE_SHARE_HEIGHT, display: "flex", flexDirection: "column", backgroundColor: "#ffffff", fontFamily, position: "relative" }}>
      <div style={{ width: PROFILE_SHARE_WIDTH, height: COVER_H, display: "flex", backgroundColor: "#eceef1", borderBottom: "1px solid #e3e5e9" }}>
        {coverSrc ? <img src={coverSrc} alt="" width={PROFILE_SHARE_WIDTH} height={COVER_H} style={{ width: PROFILE_SHARE_WIDTH, height: COVER_H, objectFit: "cover" }} /> : null}
      </div>

      {/* The photo over the band's edge, on a white ring, as the page draws it. */}
      <div style={{ position: "absolute", left: SIDE, top: COVER_H - FACE / 2, width: FACE + 12, height: FACE + 12, display: "flex", alignItems: "center", justifyContent: "center", backgroundColor: "#ffffff", borderRadius: (FACE + 12) / 2, boxShadow: "0 1px 2px rgba(16,24,40,0.10)" }}>
        {avatarSrc ? <img src={avatarSrc} alt="" width={FACE} height={FACE} style={{ width: FACE, height: FACE, borderRadius: FACE / 2, objectFit: "cover" }} /> : <DefaultFace size={FACE} />}
      </div>

      <div style={{ display: "flex", flexDirection: "column", flexGrow: 1, padding: `${FACE / 2 + 30}px ${SIDE}px 52px` }}>
        <div style={{ display: "flex", alignItems: "baseline", maxWidth: PROFILE_SHARE_WIDTH - SIDE * 2 }}>
          <div style={{ display: "flex", fontSize: long ? 50 : 62, fontWeight: 600, color: INK, lineHeight: 1.08, letterSpacing: "-0.02em" }}>{name}</div>
        </div>
        <div style={{ display: "flex", marginTop: 8, fontSize: 27, color: MUTED }}>
          {`@${clip(model.username, 40)}${model.location ? `  ·  ${clip(model.location, 44)}` : ""}`}
        </div>
        {bio ? <div style={{ display: "flex", marginTop: 12, fontSize: 26, color: "#374151", lineHeight: 1.35, maxWidth: 980 }}>{bio}</div> : null}

        <div style={{ display: "flex", alignItems: "center", marginTop: "auto", width: PROFILE_SHARE_WIDTH - SIDE * 2 }}>
          <div style={{ display: "flex", alignItems: "center", flexGrow: 1, fontSize: 25, color: MUTED }}>
            {facts.map((f, i) => (
              <div key={f} style={{ display: "flex", alignItems: "center" }}>
                {i > 0 ? <div style={{ display: "flex", margin: "0 16px", color: "#b5b9c1" }}>·</div> : null}
                <div style={{ display: "flex" }}>{f}</div>
              </div>
            ))}
            <div style={{ display: "flex", alignItems: "center" }}>
              {facts.length ? <div style={{ display: "flex", margin: "0 16px", color: "#b5b9c1" }}>·</div> : null}
              <div style={{ display: "flex", color: INK, fontWeight: 600 }}>Storelib</div>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", height: 64, padding: "0 34px", borderRadius: 16, fontSize: 26, fontWeight: 600, backgroundColor: INK, color: "#ffffff", boxShadow: "0 1px 2px rgba(16,24,40,0.18)" }}>Follow</div>
        </div>
      </div>
    </div>
  )
}
