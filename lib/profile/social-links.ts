/**
 * The social handles saved on join (profiles.*_url, or a full address).
 * The same six the Create a profile step offers, in that order.
 */
export const PROFILE_SOCIALS = ["tiktok", "instagram", "youtube", "twitter", "linkedin", "bluesky"] as const

export type ProfileSocialId = (typeof PROFILE_SOCIALS)[number]

export interface ProfileSocialLink {
  id: ProfileSocialId
  label: string
  href: string
}

const LABEL: Record<ProfileSocialId, string> = {
  tiktok: "TikTok",
  instagram: "Instagram",
  youtube: "YouTube",
  twitter: "X",
  linkedin: "LinkedIn",
  bluesky: "Bluesky",
}

const COLUMN: Record<ProfileSocialId, string> = {
  tiktok: "tiktok_url",
  instagram: "instagram_url",
  youtube: "youtube_url",
  twitter: "twitter_url",
  linkedin: "linkedin_url",
  bluesky: "bluesky_url",
}

function hrefFor(id: ProfileSocialId, raw: string): string | null {
  const v = raw.trim()
  if (!v) return null
  if (/^https?:\/\//i.test(v)) return v
  const handle = v.replace(/^@+/, "").split(/[/?#]/)[0] || ""
  if (!handle) return null
  if (id === "instagram") return `https://instagram.com/${handle}`
  if (id === "tiktok") return `https://www.tiktok.com/@${handle}`
  if (id === "linkedin") return `https://www.linkedin.com/in/${handle}`
  if (id === "bluesky") return `https://bsky.app/profile/${handle}`
  if (id === "twitter") return `https://x.com/${handle}`
  return `https://youtube.com/@${handle}`
}

/** Links worth showing, from a profiles row. Missing columns are simply absent. */
export function profileSocialLinks(row: Record<string, unknown> | null | undefined): ProfileSocialLink[] {
  if (!row) return []
  const out: ProfileSocialLink[] = []
  for (const id of PROFILE_SOCIALS) {
    const raw = row[COLUMN[id]]
    if (typeof raw !== "string") continue
    const href = hrefFor(id, raw)
    if (!href) continue
    out.push({ id, label: LABEL[id], href })
  }
  return out
}
