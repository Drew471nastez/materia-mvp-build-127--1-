/**
 * ===========================================================================
 *  THE PICTURE A SHARED POST LINK SHOWS
 * ===========================================================================
 * Drawn by next/og (./share.png/route.tsx), 1200 by 630, in the family of a
 * shared community's card and a shared profile's (components/community/
 * public/share-card.tsx, components/profile/profile-share-card.tsx): white,
 * Inter, ink #1a1a2e, one hairline.
 *
 *   A PUBLIC POST   the community's logo and name along the top (and the
 *                   space it is in), the post's title (else the start of
 *                   its words) large, a line of its text under it, its first
 *                   picture at the right when it has one, and along the
 *                   foot who wrote it and how many comments it has
 *   ANY OTHER       GenericPostShareArt: the community's logo and name and
 *                   "A post for members". Nothing of the post itself.
 *
 * Everything is an inline style and every box with children says
 * `display: flex`: next/og reads only that. Pure, so the probe draws it too.
 */
import { clip } from "@/components/community/public/share-card"
import { compactCount } from "@/lib/communities/format"
import { POST_SHARE_HEIGHT, POST_SHARE_WIDTH } from "./post-seo"

const INK = "#1a1a2e"
const MUTED = "#5f6470"
const SIDE = 72
const TOP = 64
const PICTURE = 400
const LOGO = 60

export interface PostShareModel {
  communityName: string
  spaceName: string | null
  headline: string
  /** A line of the post's text under the headline; null when the headline already is the text. */
  excerpt: string | null
  authorName: string | null
  commentCount: number
}

function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean)
  return ((words[0]?.[0] ?? "") + (words[1]?.[0] ?? "")).toUpperCase() || "C"
}

/** The community along the top: its logo (else its letters on ink) and its name. */
function CommunityRow({ name, space, logoSrc }: { name: string; space: string | null; logoSrc: string | null }) {
  return (
    <div style={{ display: "flex", alignItems: "center" }}>
      {logoSrc ? (
        <img src={logoSrc} alt="" width={LOGO} height={LOGO} style={{ width: LOGO, height: LOGO, borderRadius: 16, objectFit: "cover", border: "1px solid #e5e7eb" }} />
      ) : (
        <div style={{ width: LOGO, height: LOGO, borderRadius: 16, display: "flex", alignItems: "center", justifyContent: "center", backgroundColor: INK, color: "#ffffff", fontSize: 24, fontWeight: 600 }}>
          {initials(name)}
        </div>
      )}
      <div style={{ display: "flex", marginLeft: 18, fontSize: 28, fontWeight: 600, color: INK }}>{clip(name, 34)}</div>
      {space ? (
        <div style={{ display: "flex", alignItems: "center", fontSize: 26, color: MUTED }}>
          <div style={{ display: "flex", margin: "0 14px", color: "#b5b9c1" }}>·</div>
          <div style={{ display: "flex" }}>{clip(space, 24)}</div>
        </div>
      ) : null}
    </div>
  )
}

/** The default face (components/app/app-avatar.tsx), for an author without a photo. */
function DefaultFace({ size }: { size: number }) {
  return (
    <div style={{ width: size, height: size, borderRadius: size / 2, display: "flex", overflow: "hidden", backgroundColor: "#eceef1" }}>
      <svg width={size} height={size} viewBox="0 0 64 64">
        <circle cx="32" cy="25.5" r="11.5" fill="#b9bbc0" />
        <path d="M8.5 64c0-13.6 10.5-22.5 23.5-22.5S55.5 50.4 55.5 64z" fill="#b9bbc0" />
      </svg>
    </div>
  )
}

export function PostShareArt({
  model,
  logoSrc,
  pictureSrc,
  avatarSrc,
  fontFamily = "Inter",
}: {
  model: PostShareModel
  logoSrc: string | null
  /** The post's first picture, already cut square on the server, or null. */
  pictureSrc: string | null
  avatarSrc: string | null
  fontFamily?: string
}) {
  const textWidth = POST_SHARE_WIDTH - SIDE * 2 - (pictureSrc ? PICTURE + 48 : 0)
  const n = Array.from(model.headline).length
  const size = pictureSrc ? (n <= 40 ? 54 : n <= 70 ? 46 : 40) : n <= 50 ? 62 : n <= 80 ? 52 : 44
  const headline = clip(model.headline, pictureSrc ? 96 : 110)
  const excerpt = model.excerpt ? clip(model.excerpt, pictureSrc ? 90 : 150) : null
  const comments = model.commentCount > 0 ? `${compactCount(model.commentCount)} ${model.commentCount === 1 ? "comment" : "comments"}` : null

  return (
    <div style={{ width: POST_SHARE_WIDTH, height: POST_SHARE_HEIGHT, display: "flex", flexDirection: "column", backgroundColor: "#ffffff", fontFamily, padding: `${TOP}px ${SIDE}px 56px`, position: "relative" }}>
      <CommunityRow name={model.communityName} space={model.spaceName} logoSrc={logoSrc} />

      <div style={{ display: "flex", flexGrow: 1, alignItems: "center", marginTop: 28 }}>
        <div style={{ display: "flex", flexDirection: "column", width: textWidth }}>
          <div style={{ display: "flex", fontSize: size, fontWeight: 600, color: INK, lineHeight: 1.12, letterSpacing: "-0.02em" }}>{headline}</div>
          {excerpt ? <div style={{ display: "flex", marginTop: 18, fontSize: 26, color: MUTED, lineHeight: 1.4 }}>{excerpt}</div> : null}
        </div>
        {pictureSrc ? (
          <img src={pictureSrc} alt="" width={PICTURE} height={PICTURE} style={{ width: PICTURE, height: PICTURE, marginLeft: 48, borderRadius: 24, objectFit: "cover", border: "1px solid #e5e7eb" }} />
        ) : null}
      </div>

      {/* Who wrote it and how many answered, along the foot, with Storelib's name at the end. */}
      <div style={{ display: "flex", alignItems: "center", marginTop: 24, fontSize: 25, color: MUTED }}>
        {model.authorName ? (
          <div style={{ display: "flex", alignItems: "center" }}>
            {avatarSrc ? <img src={avatarSrc} alt="" width={48} height={48} style={{ width: 48, height: 48, borderRadius: 24, objectFit: "cover" }} /> : <DefaultFace size={48} />}
            <div style={{ display: "flex", marginLeft: 14, color: INK, fontWeight: 600 }}>{clip(model.authorName, 30)}</div>
          </div>
        ) : null}
        {comments ? (
          <div style={{ display: "flex", alignItems: "center" }}>
            {model.authorName ? <div style={{ display: "flex", margin: "0 16px", color: "#b5b9c1" }}>·</div> : null}
            <div style={{ display: "flex" }}>{comments}</div>
          </div>
        ) : null}
        <div style={{ display: "flex", marginLeft: "auto", color: INK, fontWeight: 600 }}>Storelib</div>
      </div>
    </div>
  )
}

/** Any post that is not public: which community it is in, and nothing of the post. */
export function GenericPostShareArt({ communityName, memberCount, logoSrc, fontFamily = "Inter" }: { communityName: string; memberCount: number; logoSrc: string | null; fontFamily?: string }) {
  return (
    <div style={{ width: POST_SHARE_WIDTH, height: POST_SHARE_HEIGHT, display: "flex", flexDirection: "column", backgroundColor: "#ffffff", fontFamily, padding: `${TOP}px ${SIDE}px 56px` }}>
      <CommunityRow name={communityName} space={null} logoSrc={logoSrc} />
      <div style={{ display: "flex", flexDirection: "column", flexGrow: 1, justifyContent: "center" }}>
        <div style={{ display: "flex", fontSize: 62, fontWeight: 600, color: INK, lineHeight: 1.1, letterSpacing: "-0.02em" }}>A post for members</div>
        <div style={{ display: "flex", marginTop: 18, fontSize: 28, color: MUTED, lineHeight: 1.4 }}>{`Members of ${clip(communityName, 40)} can read it on Storelib.`}</div>
      </div>
      <div style={{ display: "flex", alignItems: "center", fontSize: 25, color: MUTED }}>
        <div style={{ display: "flex" }}>{`${compactCount(Math.max(0, memberCount))} ${memberCount === 1 ? "member" : "members"}`}</div>
        <div style={{ display: "flex", marginLeft: "auto", color: INK, fontWeight: 600 }}>Storelib</div>
      </div>
    </div>
  )
}
