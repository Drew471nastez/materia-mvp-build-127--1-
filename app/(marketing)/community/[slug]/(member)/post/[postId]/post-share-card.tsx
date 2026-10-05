/**
 * ===========================================================================
 *  THE PICTURE A SHARED POST LINK SHOWS
 * ===========================================================================
 * Drawn by next/og (./share.png/route.tsx), 1200 by 630.
 *
 *   A PUBLIC POST   hero cover from the post's photo, GIF still, video
 *                   poster or embed thumb; title and community over it
 *   ANY OTHER       generic members-only card (no post content)
 *
 * No Storelib branding on the artwork — only the community and the post.
 */
import { clip } from "@/components/community/public/share-card"
import { compactCount } from "@/lib/communities/format"
import { POST_SHARE_HEIGHT, POST_SHARE_WIDTH } from "./post-seo"

const INK = "#1a1a2e"
const LOGO = 52

export interface PostShareModel {
  communityName: string
  spaceName: string | null
  headline: string
  excerpt: string | null
  authorName: string | null
  commentCount: number
}

function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean)
  return ((words[0]?.[0] ?? "") + (words[1]?.[0] ?? "")).toUpperCase() || "C"
}

function CommunityBadge({ name, space, logoSrc, onDark = true }: { name: string; space: string | null; logoSrc: string | null; onDark?: boolean }) {
  const title = onDark ? "#ffffff" : INK
  const sub = onDark ? "rgba(255,255,255,0.72)" : "#5f6470"
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
      {logoSrc ? (
        <img
          src={logoSrc}
          alt=""
          width={LOGO}
          height={LOGO}
          style={{ width: LOGO, height: LOGO, borderRadius: 14, objectFit: "cover", border: onDark ? "1px solid rgba(255,255,255,0.2)" : "1px solid #e5e7eb" }}
        />
      ) : (
        <div
          style={{
            width: LOGO,
            height: LOGO,
            borderRadius: 14,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: onDark ? "rgba(255,255,255,0.14)" : INK,
            color: "#ffffff",
            fontSize: 20,
            fontWeight: 700,
          }}
        >
          {initials(name)}
        </div>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <div style={{ display: "flex", fontSize: 24, fontWeight: 700, color: title, letterSpacing: "-0.02em" }}>{clip(name, 36)}</div>
        {space ? <div style={{ display: "flex", fontSize: 20, fontWeight: 500, color: sub }}>{clip(space, 28)}</div> : null}
      </div>
    </div>
  )
}

function DefaultFace({ size }: { size: number }) {
  return (
    <div style={{ width: size, height: size, borderRadius: size / 2, display: "flex", overflow: "hidden", backgroundColor: "rgba(255,255,255,0.2)" }}>
      <svg width={size} height={size} viewBox="0 0 64 64">
        <circle cx="32" cy="25.5" r="11.5" fill="rgba(255,255,255,0.55)" />
        <path d="M8.5 64c0-13.6 10.5-22.5 23.5-22.5S55.5 50.4 55.5 64z" fill="rgba(255,255,255,0.55)" />
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
  pictureSrc: string | null
  avatarSrc: string | null
  fontFamily?: string
}) {
  const headline = clip(model.headline, pictureSrc ? 100 : 110)
  const excerpt = model.excerpt ? clip(model.excerpt, pictureSrc ? 120 : 150) : null
  const comments = model.commentCount > 0 ? `${compactCount(model.commentCount)} ${model.commentCount === 1 ? "comment" : "comments"}` : null
  const titleSize = pictureSrc ? (headline.length <= 48 ? 56 : headline.length <= 72 ? 48 : 42) : headline.length <= 50 ? 62 : 52

  if (pictureSrc) {
    return (
      <div style={{ width: POST_SHARE_WIDTH, height: POST_SHARE_HEIGHT, display: "flex", flexDirection: "column", position: "relative", fontFamily, overflow: "hidden", backgroundColor: "#0c0e12" }}>
        <img src={pictureSrc} alt="" width={POST_SHARE_WIDTH} height={POST_SHARE_HEIGHT} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: "linear-gradient(180deg, rgba(8,10,14,0.35) 0%, rgba(8,10,14,0.08) 38%, rgba(8,10,14,0.55) 72%, rgba(8,10,14,0.94) 100%)",
          }}
        />
        <div style={{ position: "relative", display: "flex", padding: "44px 52px 0" }}>
          <CommunityBadge name={model.communityName} space={model.spaceName} logoSrc={logoSrc} />
        </div>
        <div style={{ position: "relative", display: "flex", flexDirection: "column", marginTop: "auto", padding: "0 52px 48px", gap: 16 }}>
          <div style={{ display: "flex", fontSize: titleSize, fontWeight: 700, color: "#ffffff", lineHeight: 1.08, letterSpacing: "-0.03em" }}>{headline}</div>
          {excerpt ? <div style={{ display: "flex", fontSize: 26, fontWeight: 500, color: "rgba(255,255,255,0.78)", lineHeight: 1.35 }}>{excerpt}</div> : null}
          <div style={{ display: "flex", alignItems: "center", marginTop: 8, fontSize: 22, fontWeight: 600, color: "rgba(255,255,255,0.88)" }}>
            {model.authorName ? (
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                {avatarSrc ? <img src={avatarSrc} alt="" width={44} height={44} style={{ width: 44, height: 44, borderRadius: 22, objectFit: "cover" }} /> : <DefaultFace size={44} />}
                <div style={{ display: "flex" }}>{clip(model.authorName, 32)}</div>
              </div>
            ) : null}
            {comments ? (
              <div style={{ display: "flex", alignItems: "center" }}>
                {model.authorName ? <div style={{ display: "flex", margin: "0 14px", color: "rgba(255,255,255,0.45)" }}>·</div> : null}
                <div style={{ display: "flex", fontWeight: 500, color: "rgba(255,255,255,0.72)" }}>{comments}</div>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={{ width: POST_SHARE_WIDTH, height: POST_SHARE_HEIGHT, display: "flex", flexDirection: "column", backgroundColor: "#ffffff", fontFamily, padding: "56px 64px 52px" }}>
      <CommunityBadge name={model.communityName} space={model.spaceName} logoSrc={logoSrc} onDark={false} />
      <div style={{ display: "flex", flexDirection: "column", flexGrow: 1, justifyContent: "center", marginTop: 32 }}>
        <div style={{ display: "flex", fontSize: titleSize, fontWeight: 700, color: INK, lineHeight: 1.1, letterSpacing: "-0.03em" }}>{headline}</div>
        {excerpt ? <div style={{ display: "flex", marginTop: 20, fontSize: 28, color: "#5f6470", lineHeight: 1.4 }}>{excerpt}</div> : null}
      </div>
      <div style={{ display: "flex", alignItems: "center", fontSize: 24, color: "#5f6470" }}>
        {model.authorName ? (
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            {avatarSrc ? <img src={avatarSrc} alt="" width={44} height={44} style={{ width: 44, height: 44, borderRadius: 22, objectFit: "cover" }} /> : <DefaultFace size={44} />}
            <div style={{ display: "flex", color: INK, fontWeight: 600 }}>{clip(model.authorName, 32)}</div>
          </div>
        ) : null}
        {comments ? (
          <div style={{ display: "flex", alignItems: "center" }}>
            {model.authorName ? <div style={{ display: "flex", margin: "0 14px", color: "#b5b9c1" }}>·</div> : null}
            <div style={{ display: "flex" }}>{comments}</div>
          </div>
        ) : null}
      </div>
    </div>
  )
}

/** Any post that is not public: which community it is in, and nothing of the post. */
export function GenericPostShareArt({ communityName, memberCount, logoSrc, fontFamily = "Inter" }: { communityName: string; memberCount: number; logoSrc: string | null; fontFamily?: string }) {
  return (
    <div style={{ width: POST_SHARE_WIDTH, height: POST_SHARE_HEIGHT, display: "flex", flexDirection: "column", backgroundColor: "#ffffff", fontFamily, padding: "56px 64px 52px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        {logoSrc ? (
          <img src={logoSrc} alt="" width={LOGO} height={LOGO} style={{ width: LOGO, height: LOGO, borderRadius: 14, objectFit: "cover", border: "1px solid #e5e7eb" }} />
        ) : (
          <div style={{ width: LOGO, height: LOGO, borderRadius: 14, display: "flex", alignItems: "center", justifyContent: "center", backgroundColor: INK, color: "#ffffff", fontSize: 20, fontWeight: 700 }}>
            {initials(communityName)}
          </div>
        )}
        <div style={{ display: "flex", fontSize: 28, fontWeight: 700, color: INK }}>{clip(communityName, 40)}</div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", flexGrow: 1, justifyContent: "center" }}>
        <div style={{ display: "flex", fontSize: 62, fontWeight: 700, color: INK, lineHeight: 1.08, letterSpacing: "-0.03em" }}>A post for members</div>
        <div style={{ display: "flex", marginTop: 18, fontSize: 28, color: "#5f6470", lineHeight: 1.4 }}>{`Join ${clip(communityName, 40)} to read this post.`}</div>
      </div>
      <div style={{ display: "flex", fontSize: 24, color: "#5f6470" }}>{`${compactCount(Math.max(0, memberCount))} ${memberCount === 1 ? "member" : "members"}`}</div>
    </div>
  )
}
